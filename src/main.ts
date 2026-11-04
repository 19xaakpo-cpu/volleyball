import './style.css';
import { createGame, step, PH_SERVE } from './sim/game.ts';
import type { GameEvent, GameState } from './sim/game.ts';
import { Bot } from './bot.ts';
import type { Difficulty } from './bot.ts';
import { Renderer } from './render.ts';
import type { DrawInfo } from './render.ts';
import { buildTouch, initInput, isTouchDevice, readInput } from './input.ts';
import { isMuted, setMuted, sfx, unlockAudio } from './audio.ts';
import { RollbackSession } from './net/rollback.ts';
import type { NetMsg } from './net/rollback.ts';
import { hostRoom, joinRoom, normalizeCode } from './net/peer.ts';
import type { Link } from './net/peer.ts';

const PROTO = 1;
const DT = 1000 / 60;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const canvas = $<HTMLCanvasElement>('#game');
const renderer = new Renderer(canvas);
initInput();

type Mode =
  | { kind: 'local' }
  | { kind: 'bot'; bot: Bot; diff: Difficulty }
  | { kind: 'online'; session: RollbackSession; link: Link; side: number }
  | { kind: 'netsim'; session: RollbackSession; remote: RollbackSession; bot: Bot; rtt: number };

let mode: Mode | null = null;
let state: GameState = createGame(15);
let paused = false;
let ended = false;
let showDebug = false;
let cancelConnect: (() => void) | null = null;
let attract: [Bot, Bot] = [new Bot(0, 'normal'), new Bot(1, 'normal')];

// ---------- меню ----------

function showScreen(name: string) {
  document.querySelectorAll<HTMLElement>('#menu .screen').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.screen !== name);
  });
}

function target(): number {
  return parseInt($<HTMLSelectElement>('#target').value, 10) || 15;
}

try {
  const t = localStorage.getItem('mishkobol-target');
  if (t) $<HTMLSelectElement>('#target').value = t;
} catch { /* ignore */ }
$<HTMLSelectElement>('#target').addEventListener('change', () => {
  try { localStorage.setItem('mishkobol-target', String(target())); } catch { /* ignore */ }
});

document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => {
  b.addEventListener('click', () => {
    unlockAudio();
    const go = b.dataset.go!;
    if (go === 'local') startLocal();
    else showScreen(go);
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-bot]').forEach((b) => {
  b.addEventListener('click', () => {
    unlockAudio();
    startBot(b.dataset.bot as Difficulty);
  });
});

function setMenuVisible(v: boolean) {
  $('#menu').classList.toggle('hidden', !v);
  $('#hud-buttons').classList.toggle('hidden', v);
  updateTouch();
}

function updateTouch() {
  const inGame = mode !== null && $('#menu').classList.contains('hidden');
  const touch = $('#touch');
  if (inGame && isTouchDevice()) {
    touch.classList.remove('hidden');
    buildTouch(touch, mode!.kind === 'local');
  } else {
    touch.classList.add('hidden');
    touch.innerHTML = '';
  }
  checkRotate();
}

function checkRotate() {
  const portrait = window.innerHeight > window.innerWidth;
  $('#rotate').classList.toggle('hidden', !(portrait && isTouchDevice() && mode !== null));
}
window.addEventListener('resize', checkRotate);

// ---------- режими ----------

function beginGame(m: Mode, s: GameState) {
  mode = m;
  state = s;
  paused = false;
  ended = false;
  hidePause();
  setMenuVisible(false);
  sfx.whistle();
}

function startLocal() {
  beginGame({ kind: 'local' }, createGame(target()));
}

function startBot(diff: Difficulty) {
  beginGame({ kind: 'bot', bot: new Bot(1, diff), diff }, createGame(target()));
}

function startOnline(link: Link, side: number, tgt: number, delay: number, early: NetMsg[]) {
  const session = new RollbackSession({
    local: side,
    target: tgt,
    inputDelay: delay,
    transport: { send: (m) => link.send(m) },
  });
  link.onMessage = (m: any) => {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ready' && side === 0) link.send({ t: 'start', delay, target: tgt });
    else if (m.t === 'bye') endGame('Суперник вийшов з гри.');
    else if (m.t === 'in' || m.t === 'ping' || m.t === 'pong' || m.t === 'hash') session.receive(m);
  };
  link.onClose = (reason) => endGame(reason + '.');
  for (const m of early) session.receive(m);
  cancelConnect = null;
  beginGame({ kind: 'online', session, link, side }, session.state);
}

function startNetsim(rtt: number) {
  // Режим перевірки: та сама rollback-логіка, але "суперник" — бот у цій же вкладці
  // за імітованою мережею із затримкою rtt мс і втратами.
  const mk = (to: () => RollbackSession) => ({
    send(m: NetMsg) {
      if (Math.random() < 0.03) return;
      const copy = JSON.parse(JSON.stringify(m));
      setTimeout(() => to().receive(copy), rtt / 2 + Math.random() * rtt * 0.2);
    },
  });
  let a: RollbackSession, b: RollbackSession;
  a = new RollbackSession({ local: 0, target: target(), transport: mk(() => b), inputDelay: 2 });
  b = new RollbackSession({ local: 1, target: target(), transport: mk(() => a), inputDelay: 2 });
  beginGame({ kind: 'netsim', session: a, remote: b, bot: new Bot(1, 'normal'), rtt }, a.state);
}

function leaveGame() {
  if (mode?.kind === 'online') {
    mode.link.send({ t: 'bye' });
    const l = mode.link;
    setTimeout(() => l.close(), 100);
  }
  mode = null;
  paused = false;
  hidePause();
  state = createGame(15);
  attract = [new Bot(0, 'normal'), new Bot(1, 'normal')];
  showScreen('main');
  setMenuVisible(true);
  if (location.search) history.replaceState(null, '', location.pathname);
}

function endGame(reason: string) {
  if (ended || !mode) return;
  ended = true;
  if (mode.kind === 'online') mode.link.close();
  showPause('Гру завершено', reason, false);
}

// ---------- пауза ----------

function showPause(title: string, text: string, canResume: boolean) {
  $('#pause-title').textContent = title;
  $('#pause-text').textContent = text;
  $('#btn-resume').classList.toggle('hidden', !canResume);
  $('#pause').classList.remove('hidden');
}
function hidePause() {
  $('#pause').classList.add('hidden');
}

function togglePause() {
  if (!mode || ended) return;
  if (!$('#pause').classList.contains('hidden')) {
    paused = false;
    hidePause();
    return;
  }
  if (mode.kind === 'online') {
    showPause('Меню', 'Гра по мережі не зупиняється — суперник продовжує грати.', true);
  } else {
    paused = true;
    showPause('Пауза', '', true);
  }
}

$('#btn-pause').addEventListener('click', togglePause);
$('#btn-resume').addEventListener('click', () => { paused = false; hidePause(); });
$('#btn-tomenu').addEventListener('click', leaveGame);
const muteBtn = $('#btn-mute');
const updMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
updMute();
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); updMute(); });
$('#btn-full').addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  const d = document as any;
  if (!document.fullscreenElement && !d.webkitFullscreenElement) {
    const el = document.documentElement as any;
    const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
    Promise.resolve(p).then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {});
  } else {
    (document.exitFullscreen ? document.exitFullscreen() : d.webkitExitFullscreen?.())?.catch?.(() => {});
  }
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyM') { setMuted(!isMuted()); updMute(); }
  else if (e.code === 'KeyF' && mode) toggleFullscreen();
  else if (e.code === 'F3') { showDebug = !showDebug; e.preventDefault(); }
});
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ---------- гра по мережі ----------

const roomUrl = (code: string) => `${location.origin}${location.pathname}?room=${code}`;

function setWait(title: string, status: string) {
  $('#wait-title').textContent = title;
  $('#wait-status').textContent = status;
}

function delayFor(rtt: number) {
  // невелика затримка введення зменшує кількість відкатів; більша — для далеких з'єднань
  if (rtt < 50) return 1;
  if (rtt < 110) return 2;
  if (rtt < 200) return 3;
  return 4;
}

$('#btn-host').addEventListener('click', () => {
  unlockAudio();
  showScreen('wait');
  setWait('Нова кімната', '');
  $('#room-box').classList.add('hidden');
  const tgt = target();
  cancelConnect = hostRoom({
    onStatus: (t) => { $('#wait-status').textContent = t; },
    onRoom: (code) => {
      $('#room-box').classList.remove('hidden');
      $('#room-code').textContent = code;
      $('#btn-share').classList.toggle('hidden', !navigator.share);
      ($('#btn-copy') as any).onclick = async () => {
        try {
          await navigator.clipboard.writeText(roomUrl(code));
          $('#btn-copy').textContent = '✅ Скопійовано';
        } catch {
          prompt('Скопіюйте посилання:', roomUrl(code));
        }
        setTimeout(() => { $('#btn-copy').textContent = '📋 Копіювати посилання'; }, 2000);
      };
      ($('#btn-share') as any).onclick = () => {
        navigator.share?.({ title: 'Мішкобол', text: `Зіграймо в Мішкобол! Код кімнати: ${code}`, url: roomUrl(code) }).catch(() => {});
      };
    },
    onLink: (link) => handshakeHost(link, tgt),
    onError: (t) => setWait('Помилка', t),
  });
});

function handshakeHost(link: Link, tgt: number) {
  setWait('Суперник підключився', 'Починаємо…');
  let started = false;
  const iv = setInterval(() => link.send({ t: 'hello', v: PROTO, target: tgt, ts: performance.now() }), 200);
  link.send({ t: 'hello', v: PROTO, target: tgt, ts: performance.now() });
  link.onMessage = (m: any) => {
    if (m?.t === 'ready' && !started) {
      started = true;
      clearInterval(iv);
      const rtt = performance.now() - m.ts;
      const delay = delayFor(rtt);
      link.send({ t: 'start', delay, target: tgt });
      startOnline(link, 0, tgt, delay, []);
    } else if (m?.t === 'badver') {
      clearInterval(iv);
      setWait('Різні версії гри', 'Попросіть суперника оновити сторінку.');
      link.close();
    }
  };
  link.onClose = (r) => { clearInterval(iv); setWait('З\'єднання розірвано', r); };
}

function handshakeGuest(link: Link) {
  setWait('З\'єднано', 'Чекаємо на початок…');
  let started = false;
  let lastTs = 0;
  let iv: ReturnType<typeof setInterval> | null = null;
  const early: NetMsg[] = [];
  link.onMessage = (m: any) => {
    if (!m || started) return;
    if (m.t === 'hello') {
      if (m.v !== PROTO) {
        link.send({ t: 'badver' });
        setWait('Різні версії гри', 'Оновіть сторінку (Ctrl+F5) і спробуйте ще раз.');
        return;
      }
      lastTs = m.ts;
      link.send({ t: 'ready', ts: lastTs });
      if (!iv) iv = setInterval(() => link.send({ t: 'ready', ts: lastTs }), 250);
    } else if (m.t === 'start') {
      started = true;
      if (iv) clearInterval(iv);
      startOnline(link, 1, m.target, m.delay, early);
    } else if (m.t === 'in' || m.t === 'ping' || m.t === 'hash') {
      early.push(m);
    }
  };
  link.onClose = (r) => { if (iv) clearInterval(iv); setWait('З\'єднання розірвано', r); };
}

function join(codeRaw: string) {
  const code = normalizeCode(codeRaw);
  if (code.length !== 5) {
    $<HTMLInputElement>('#join-code').focus();
    return;
  }
  showScreen('wait');
  $('#room-box').classList.add('hidden');
  setWait('Кімната ' + code, '');
  cancelConnect = joinRoom(code, {
    onStatus: (t) => { $('#wait-status').textContent = t; },
    onLink: (link) => handshakeGuest(link),
    onError: (t) => setWait('Не вдалося підключитися', t),
  });
}

$('#btn-join').addEventListener('click', () => join($<HTMLInputElement>('#join-code').value));
$<HTMLInputElement>('#join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join((e.target as HTMLInputElement).value);
});
$<HTMLInputElement>('#join-code').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  el.value = normalizeCode(el.value);
});
$('#btn-cancel').addEventListener('click', () => {
  cancelConnect?.();
  cancelConnect = null;
  if (location.search) history.replaceState(null, '', location.pathname);
  showScreen('online');
});

// ---------- ігровий цикл ----------

function handleEvents(ev: GameEvent[], localSide: number) {
  if (ev.length === 0) return;
  renderer.onEvents(ev, state, localSide);
  for (const e of ev) {
    switch (e.type) {
      case 'hit': sfx.hit(e.speed); break;
      case 'wall': sfx.wall(); break;
      case 'net': sfx.net(); break;
      case 'floor': sfx.floor(); break;
      case 'jump': if (localSide === -1 || e.p === localSide) sfx.jump(); break;
      case 'point': sfx.point(localSide === -1 || e.winner === localSide); break;
      case 'over': sfx.win(); break;
      case 'serve': if (state.phase !== PH_SERVE) sfx.whistle(); break;
    }
  }
}

function tick() {
  if (!mode) {
    // фонова гра ботів під меню
    step(state, attract[0].input(state), attract[1].input(state));
    if (state.phase === 3) { state = createGame(15); attract = [new Bot(0, 'normal'), new Bot(1, 'normal')]; }
    return;
  }
  if (ended) return;
  if (paused) return;
  const ev: GameEvent[] = [];
  switch (mode.kind) {
    case 'local':
      step(state, readInput(0), readInput(1), ev);
      handleEvents(ev, -1);
      break;
    case 'bot':
      step(state, readInput('any'), mode.bot.input(state), ev);
      handleEvents(ev, 0);
      break;
    case 'online': {
      const evs = mode.session.tick(readInput('any'));
      state = mode.session.state;
      handleEvents(evs, mode.side);
      if (performance.now() - mode.session.stats.lastRecv > 15000) endGame('З\'єднання із суперником втрачено.');
      break;
    }
    case 'netsim': {
      const evs = mode.session.tick(readInput('any'));
      mode.remote.tick(mode.bot.input(mode.remote.state));
      state = mode.session.state;
      handleEvents(evs, 0);
      break;
    }
  }
}

function drawInfo(): DrawInfo {
  if (!mode) return { names: ['Бот', 'Бот'], localSide: -1 };
  switch (mode.kind) {
    case 'local':
      return { names: ['Лівий', 'Правий'], localSide: -1, hint: state.frame < 400 && !touchUi ? 'Лівий: A D W S   ·   Правий: ← → ↑ ↓' : undefined };
    case 'bot':
      return { names: ['Гравець', 'Бот'], localSide: 0, hint: state.frame < 400 && !touchUi ? 'Ходити ← → / A D   ·   стрибок ↑ / W   ·   присісти ↓ / S' : undefined };
    case 'online':
    case 'netsim': {
      const st = mode.session.stats;
      const side = mode.kind === 'online' ? mode.side : 0;
      return {
        names: ['Гравець 1', 'Гравець 2'],
        localSide: side,
        ping: st.rtt,
        stalled: st.stalled,
        debug: showDebug ? `кадр ${mode.session.frame}  відкат ${st.rollbackFrames}  перевага ${st.advantage.toFixed(1)}  затримка вводу ${mode.session.inputDelay}${st.desync ? '  РОЗСИНХРОН!' : ''}` : undefined,
      };
    }
  }
}

// Коли вкладку згорнуто, requestAnimationFrame зупиняється — шлемо "пульс",
// щоб суперник знав, що ми на зв'язку.
setInterval(() => {
  if (mode?.kind === 'online' && document.hidden) mode.link.send({ t: 'ping', ts: performance.now() });
}, 1000);

const touchUi = isTouchDevice();

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(now - last, 250);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= DT && n < 8) {
    tick();
    acc -= DT;
    n++;
  }
  if (n === 8) acc = 0;
  renderer.draw(state, drawInfo(), dt / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- старт ----------

const params = new URLSearchParams(location.search);
const room = params.get('room');
const netsim = params.get('netsim');
if (room) {
  showScreen('online');
  $<HTMLInputElement>('#join-code').value = normalizeCode(room);
  join(room);
} else if (netsim !== null) {
  startNetsim(parseInt(netsim, 10) || 100);
}
