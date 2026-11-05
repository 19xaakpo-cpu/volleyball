// Рушій матчу: ігровий цикл, режими (локально, бот, мережа), пауза, завершення.

import { createGame, step, IN_JUMP, PH_OVER, PH_SERVE } from './sim/game.ts';
import type { GameEvent, GameState } from './sim/game.ts';
import { Bot } from './bot.ts';
import type { Difficulty } from './bot.ts';
import { Renderer } from './render.ts';
import type { DrawInfo } from './render.ts';
import { buildTouch, initInput, isTouchDevice, readInput } from './input.ts';
import { isMuted, setMuted, sfx, speak, unlockAudio } from './audio.ts';
import { RollbackSession } from './net/rollback.ts';
import type { NetMsg } from './net/rollback.ts';
import type { Link } from './net/peer.ts';
import { BALL_PRESETS, botProfile, defaultProfile, locationById } from './cosmetics.ts';
import type { GameLook } from './cosmetics.ts';
import { kyivAlert } from './alerts.ts';
import { $ } from './ui/dom.ts';
import { addChat, addSystem, chatEnabled, sanitizeChat, setChat } from './ui/chat.ts';
import type { ChatMsg } from './ui/chat.ts';

const DT = 1000 / 60;
const DEBUG = location.search.includes('debug');

export interface TourCtx {
  label: string;
  /** викликається один раз із підсумковим рахунком (з точки зору лівого/правого) */
  onDone: (score: [number, number], note?: string) => void;
  onLive?: (score: [number, number]) => void;
}

export interface MatchSpec {
  kind: 'local' | 'bot' | 'online' | 'netsim' | 'watch';
  look: GameLook;
  target: number;
  botSide?: number;
  botDiff?: Difficulty;
  link?: Link;
  side?: number;
  delay?: number;
  early?: NetMsg[];
  rtt?: number;
  tour?: TourCtx;
  /** глядачі, що підключилися ще до початку матчу (лише в того, хто створив кімнату) */
  watchers?: Link[];
  /** змінилася кількість глядачів */
  onWatchers?: (n: number) => void;
  /** ім'я для чату (для глядача) */
  myName?: string;
  /** куди повертатися після виходу */
  onExit: () => void;
}

interface Running {
  spec: MatchSpec;
  state: GameState;
  bot?: Bot;
  session?: RollbackSession;
  remote?: RollbackSession;
  netBot?: Bot;
  ended: boolean;
  paused: boolean;
  tourDone: boolean;
  overSince: number;
  scene: string;
  lastScore: string;
  watchers: Link[];
  watchWaiting: boolean;
}

let run: Running | null = null;
let showDebug = false;
const canvas = $<HTMLCanvasElement>('#game');
const menuLook: GameLook = {
  location: 'beach',
  ball: BALL_PRESETS.beach.ball,
  profiles: [botProfile('normal', 0), { ...botProfile('easy', 1) }],
};
export const renderer = new Renderer(canvas, menuLook);
let attract: { state: GameState; bots: [Bot, Bot] } = newAttract();
initInput();

function newAttract() {
  return { state: createGame(15, 0, locationById(menuLook.location).net), bots: [new Bot(0, 'normal'), new Bot(1, 'normal')] as [Bot, Bot] };
}

/** Фонова сцена під меню */
export function setMenuBackground(look: Partial<GameLook>) {
  Object.assign(menuLook, look);
  if (!run) {
    renderer.look = menuLook;
    attract = newAttract();
  }
}

export function isPlaying() {
  return run !== null;
}

function sceneFor(look: GameLook): string {
  if (look.location === 'kyiv' && kyivAlert() === 'alert') return 'metro';
  return look.location;
}

const METRO_BANNER = '🚨 Повітряна тривога! Гра проводиться на станції метро «Хрещатик». Бережіть себе і не стійте біля краю платформи!';

function announceScene(scene: string, prev: string | null) {
  if (scene === 'metro') {
    sfx.chime();
    setTimeout(() => speak('Увага! Повітряна тривога. Гра проводиться на станції метро Хрещатик.'), 1000);
  } else if (prev === 'metro' && scene === 'kyiv') {
    sfx.chime();
    setTimeout(() => speak('Відбій повітряної тривоги. Гра повертається на Хрещатик.'), 1000);
  }
}

export function beginMatch(spec: MatchSpec) {
  const net = locationById(spec.look.location).net;
  const r: Running = {
    spec,
    state: createGame(spec.target, 0, net),
    ended: false,
    paused: false,
    tourDone: false,
    overSince: 0,
    scene: sceneFor(spec.look),
    lastScore: '0:0',
    watchers: [],
    watchWaiting: spec.kind === 'watch',
  };
  if (spec.kind === 'bot') r.bot = new Bot(spec.botSide ?? 1, spec.botDiff ?? 'normal');
  if (spec.kind === 'online') {
    const link = spec.link!;
    const session = new RollbackSession({
      local: spec.side!, target: spec.target, inputDelay: spec.delay, net,
      transport: { send: (m) => link.send(m) },
    });
    link.onMessage = (m: any) => {
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'ready' && spec.side === 0) link.send({ t: 'start', delay: spec.delay, target: spec.target });
      else if (m.t === 'bye') opponentGone(m.s ? 'surrender' : 'Суперник вийшов з гри.');
      else if (m.t === 'in' || m.t === 'ping' || m.t === 'pong' || m.t === 'hash') session.receive(m);
      else if (m.t === 'chat') {
        const c = sanitizeChat(m);
        if (!c) return;
        if (spec.side === 0) relayChat(r, { ...c, from: spec.look.profiles[1].name, role: 'p' }, link);
        else addChat(c);
      } else if (m.t === 'sys' && typeof m.text === 'string' && spec.side === 1) addSystem(m.text.slice(0, 80));
    };
    link.onClose = (reason) => opponentGone(reason + '.');
    for (const m of spec.early ?? []) session.receive(m);
    r.session = session;
    r.state = session.state;
  }
  if (spec.kind === 'netsim') {
    const rtt = spec.rtt ?? 100;
    let a: RollbackSession, b: RollbackSession;
    const mk = (to: () => RollbackSession) => ({
      send(m: NetMsg) {
        if (Math.random() < 0.03) return;
        const copy = JSON.parse(JSON.stringify(m));
        setTimeout(() => to().receive(copy), rtt / 2 + Math.random() * rtt * 0.2);
      },
    });
    a = new RollbackSession({ local: 0, target: spec.target, transport: mk(() => b), inputDelay: 2, net });
    b = new RollbackSession({ local: 1, target: spec.target, transport: mk(() => a), inputDelay: 2, net });
    r.session = a;
    r.remote = b;
    r.netBot = new Bot(1, 'normal');
    r.state = a.state;
  }
  if (spec.kind === 'watch') {
    const link = spec.link!;
    link.send({ t: 'hi', name: spec.myName ?? 'Глядач' });
    link.onMessage = (m: any) => {
      if (!m || typeof m.t !== 'string' || run !== r) return;
      if (m.t === 'look' && m.look?.profiles) {
        r.spec.look = m.look;
        renderer.look = m.look;
        r.scene = sceneFor(m.look);
        r.watchWaiting = !!m.waiting;
      } else if (m.t === 'snap' && m.st?.players && m.st?.ball) {
        r.state = m.st;
        r.watchWaiting = false;
      } else if (m.t === 'ev' && Array.isArray(m.ev)) {
        handleEvents(m.ev, r);
      } else if (m.t === 'chat') {
        const c = sanitizeChat(m);
        if (c) addChat(c);
      } else if (m.t === 'sys' && typeof m.text === 'string') {
        addSystem(m.text.slice(0, 80));
      } else if (m.t === 'bye') {
        r.ended = true;
        showPause('Трансляцію завершено', 'Гравець закрив гру.', false);
      }
    };
    link.onClose = () => {
      if (run !== r || r.ended) return;
      r.ended = true;
      showPause('Трансляцію завершено', r.watchWaiting ? 'Матч ще не почався або вже завершився.' : 'Зв\'язок із грою втрачено.', false);
    };
  }
  run = r;
  if (spec.kind === 'online' && spec.side === 0) for (const w of spec.watchers ?? []) attachWatcher(r, w);
  if (spec.kind === 'online') {
    const me = spec.look.profiles[spec.side!].name;
    setChat((text) => {
      const c: ChatMsg = { from: me, text, role: 'p' };
      if (spec.side === 0) relayChat(r, c);
      else { addChat(c); spec.link!.send({ t: 'chat', ...c }); }
    });
  } else if (spec.kind === 'watch') {
    const me = spec.myName ?? 'Глядач';
    setChat((text) => {
      const c: ChatMsg = { from: me, text, role: 'w' };
      addChat(c);
      spec.link!.send({ t: 'chat', ...c });
    });
    addSystem('👁 Ви дивитеся гру. Enter — написати в чат.');
  } else {
    setChat(null);
  }
  renderer.look = spec.look;
  renderer.reset();
  hidePause();
  $('#menu').classList.add('hidden');
  $('#editor').classList.add('hidden');
  $('#hud-buttons').classList.remove('hidden');
  updateTouch();
  sfx.whistle();
  announceScene(r.scene, null);
}

// ---------- глядачі (лише в того, хто створив кімнату) ----------

function sendWatchers(r: Running, msg: unknown) {
  for (const w of r.watchers) w.send(msg);
}

/** Повідомлення чату: показати і розіслати всім, крім відправника. */
function relayChat(r: Running, c: ChatMsg, except?: Link) {
  addChat(c);
  for (const w of r.watchers) if (w !== except) w.send({ t: 'chat', ...c });
  const g = r.spec.link;
  if (g && g !== except && r.spec.kind === 'online') g.send({ t: 'chat', ...c });
}

function systemAll(r: Running, text: string) {
  addSystem(text);
  sendWatchers(r, { t: 'sys', text });
  if (r.spec.kind === 'online') r.spec.link?.send({ t: 'sys', text });
}

function attachWatcher(r: Running, link: Link) {
  r.watchers.push(link);
  // у матчі з ботом чат вмикається з першим глядачем
  if (!chatEnabled()) {
    const me = r.spec.look.profiles[localSide(r) === 1 ? 1 : 0].name;
    setChat((text) => relayChat(r, { from: me, text, role: 'p' }));
  }
  const name = () => String((link as any).wname ?? 'Глядач').slice(0, 16);
  link.send({ t: 'look', look: r.spec.look, waiting: false });
  link.send({ t: 'snap', st: r.state });
  link.onMessage = (m: any) => {
    if (m?.t === 'hi') {
      (link as any).wname = String(m.name ?? 'Глядач').slice(0, 16);
      systemAll(r, `👁 ${name()} дивиться гру`);
    } else if (m?.t === 'chat') {
      const c = sanitizeChat(m);
      if (c) relayChat(r, { ...c, from: name(), role: 'w' }, link);
    }
  };
  link.onClose = () => {
    r.watchers = r.watchers.filter((w) => w !== link);
    r.spec.onWatchers?.(r.watchers.length);
  };
  if ((link as any).wname) systemAll(r, `👁 ${name()} дивиться гру`);
  r.spec.onWatchers?.(r.watchers.length);
}

/** Глядач підключився під час матчу. */
export function addWatcher(link: Link): boolean {
  if (!run || run.ended) return false;
  const k = run.spec.kind;
  if (!((k === 'online' && run.spec.side === 0) || k === 'bot')) return false;
  attachWatcher(run, link);
  return true;
}

function opponentGone(reason: string) {
  if (!run || run.ended) return;
  const r = run;
  r.ended = true;
  r.spec.link?.close();
  if (r.spec.tour && !r.tourDone) {
    // технічна перемога того, хто лишився
    r.tourDone = true;
    const me = r.spec.side ?? 0;
    const sc: [number, number] = me === 0 ? [r.spec.target, 0] : [0, r.spec.target];
    if (reason === 'surrender') {
      r.spec.tour.onDone(sc, 'здача');
      showPause('Суперник здався! 🏳️', 'Перемога ваша.', false, 'До турніру');
    } else {
      r.spec.tour.onDone(sc, 'тех. перемога');
      showPause('Суперник від\'єднався', 'Вам зараховано технічну перемогу.', false, 'До турніру');
    }
    return;
  }
  showPause('Гру завершено', reason === 'surrender' ? 'Суперник вийшов з гри.' : reason, false);
}

export function leaveMatch(surrender = false) {
  if (!run) return;
  const r = run;
  if (r.spec.link) {
    r.spec.link.send({ t: 'bye', s: surrender ? 1 : 0 });
    const l = r.spec.link;
    setTimeout(() => l.close(), 150);
  }
  for (const w of r.watchers) { w.send({ t: 'bye' }); setTimeout(() => w.close(), 150); }
  setChat(null);
  run = null;
  hidePause();
  renderer.look = menuLook;
  renderer.reset();
  attract = newAttract();
  $('#hud-buttons').classList.add('hidden');
  updateTouch();
  r.spec.onExit();
}

// ---------- пауза ----------

function showPause(title: string, text: string, canResume: boolean, exitLabel = '🏠 У меню') {
  $('#pause-title').textContent = title;
  $('#pause-text').textContent = text;
  $('#btn-resume').classList.toggle('hidden', !canResume);
  $('#btn-tomenu').textContent = exitLabel;
  $('#pause').classList.remove('hidden');
}
function hidePause() {
  $('#pause').classList.add('hidden');
}

function togglePause() {
  if (!run || run.ended) return;
  if (!$('#pause').classList.contains('hidden')) {
    run.paused = false;
    hidePause();
    return;
  }
  const exitLabel = run.spec.tour ? '🏳️ Здатися (до турніру)' : '🏠 У меню';
  if (run.spec.kind === 'online') {
    showPause('Меню', 'Гра по мережі не зупиняється — суперник продовжує грати.', true, exitLabel);
  } else {
    run.paused = true;
    showPause('Пауза', '', true, exitLabel);
  }
}

function surrenderOrLeave() {
  if (run?.spec.tour && !run.tourDone && !run.ended) {
    // здача матчу в турнірі
    run.tourDone = true;
    const r = run;
    const t = r.spec.target;
    let loser: number;
    if (r.spec.kind === 'online') loser = r.spec.side!;
    else if (r.spec.kind === 'bot') loser = 1 - (r.spec.botSide ?? 1);
    else loser = r.state.score[0] <= r.state.score[1] ? 0 : 1;
    r.spec.tour!.onDone(loser === 0 ? [r.state.score[0], Math.max(t, r.state.score[0] + 2)] : [Math.max(t, r.state.score[1] + 2), r.state.score[1]], 'здача');
    leaveMatch(true);
    return;
  }
  leaveMatch();
}

$('#btn-pause').addEventListener('click', togglePause);
$('#btn-resume').addEventListener('click', () => { if (run) run.paused = false; hidePause(); });
$('#btn-tomenu').addEventListener('click', surrenderOrLeave);
const muteBtn = $('#btn-mute');
const updMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
updMute();
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); updMute(); });
$('#btn-full').addEventListener('click', toggleFullscreen);

export function toggleFullscreen() {
  const d = document as any;
  if (!document.fullscreenElement && !d.webkitFullscreenElement) {
    const elx = document.documentElement as any;
    const p = elx.requestFullscreen ? elx.requestFullscreen() : elx.webkitRequestFullscreen?.();
    Promise.resolve(p).then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {});
  } else {
    (document.exitFullscreen ? document.exitFullscreen() : d.webkitExitFullscreen?.())?.catch?.(() => {});
  }
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyM') { setMuted(!isMuted()); updMute(); }
  else if (e.code === 'KeyF' && run) toggleFullscreen();
  else if (e.code === 'F3') { showDebug = !showDebug; e.preventDefault(); }
});
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ---------- сенсорне керування ----------

const touchUi = isTouchDevice();

function updateTouch() {
  const touch = $('#touch');
  if (run && touchUi) {
    touch.classList.remove('hidden');
    buildTouch(touch, run.spec.kind === 'local');
  } else {
    touch.classList.add('hidden');
    touch.innerHTML = '';
  }
  checkRotate();
}

function checkRotate() {
  const portrait = window.innerHeight > window.innerWidth;
  $('#rotate').classList.toggle('hidden', !(portrait && touchUi && run !== null));
}
window.addEventListener('resize', checkRotate);

// ---------- цикл ----------

function localSide(r: Running): number {
  switch (r.spec.kind) {
    case 'local': return -1;
    case 'bot': return 1 - (r.spec.botSide ?? 1);
    case 'online': return r.spec.side!;
    case 'netsim': return 0;
    case 'watch': return -1;
  }
}

function handleEvents(ev: GameEvent[], r: Running) {
  if (ev.length === 0) return;
  const ls = localSide(r);
  renderer.onEvents(ev, r.state, ls);
  if (r.watchers.length) sendWatchers(r, { t: 'ev', ev });
  for (const e of ev) {
    switch (e.type) {
      case 'hit': if (e.super) sfx.superHit(e.spike); else sfx.hit(e.speed); break;
      case 'wall': sfx.wall(); break;
      case 'net': sfx.net(); break;
      case 'floor': sfx.floor(); break;
      case 'jump': if (e.super) sfx.superJump(); else if (ls === -1 || e.p === ls) sfx.jump(); break;
      case 'dash': sfx.dash(); break;
      case 'point':
        sfx.point(ls === -1 || e.winner === ls);
        if (r.scene === 'court') sfx.cheer();
        break;
      case 'over': sfx.win(); break;
      case 'serve': if (r.state.phase !== PH_SERVE) sfx.whistle(); break;
    }
  }
}

function tick() {
  if (!run) {
    const a = attract;
    step(a.state, a.bots[0].input(a.state), a.bots[1].input(a.state));
    if (a.state.phase === PH_OVER) attract = newAttract();
    return;
  }
  const r = run;
  if (r.ended || r.paused) return;
  const inTourOver = !!r.spec.tour && r.state.phase === PH_OVER;
  // у турнірі після кінця матчу "стрибок" не запускає реванш
  const mask = (x: number) => (inTourOver ? x & ~IN_JUMP : x);
  const ev: GameEvent[] = [];
  switch (r.spec.kind) {
    case 'local':
      step(r.state, mask(readInput(0)), mask(readInput(1)), ev);
      handleEvents(ev, r);
      break;
    case 'bot': {
      const bs = r.spec.botSide ?? 1;
      const human = readInput('any');
      const bi = r.bot!.input(r.state);
      if (bs === 1) step(r.state, mask(human), mask(bi), ev);
      else step(r.state, mask(bi), mask(human), ev);
      handleEvents(ev, r);
      if (r.watchers.length && r.state.frame % 2 === 0) sendWatchers(r, { t: 'snap', st: r.state });
      break;
    }
    case 'online': {
      const evs = r.session!.tick(mask(readInput('any')));
      r.state = r.session!.state;
      handleEvents(evs, r);
      // трансляція стану глядачам (30 разів на секунду)
      if (r.watchers.length && r.state.frame % 2 === 0) sendWatchers(r, { t: 'snap', st: r.state });
      if (performance.now() - r.session!.stats.lastRecv > 15000) opponentGone('З\'єднання із суперником втрачено.');
      if (r.session!.stats.desync) opponentGone('Гра розсинхронізувалася — найімовірніше, у вас із суперником різні версії гри. Обом оновіть сторінку (Ctrl+F5 або потягнути вниз на телефоні) і спробуйте ще раз.');
      break;
    }
    case 'netsim': {
      const evs = r.session!.tick(readInput('any'));
      r.remote!.tick(r.netBot!.input(r.remote!.state));
      r.state = r.session!.state;
      handleEvents(evs, r);
      break;
    }
  }
  // живий рахунок для турніру
  const sc = `${r.state.score[0]}:${r.state.score[1]}`;
  if (sc !== r.lastScore) {
    r.lastScore = sc;
    r.spec.tour?.onLive?.([r.state.score[0], r.state.score[1]]);
  }
  // завершення турнірного матчу
  if (r.spec.tour && r.state.phase === PH_OVER && r.state.timer === 0) {
    if (!r.tourDone) {
      r.tourDone = true;
      r.overSince = performance.now();
      r.spec.tour.onDone([r.state.score[0], r.state.score[1]]);
    } else if ((readInput('any') & IN_JUMP && performance.now() - r.overSince > 700) || performance.now() - r.overSince > 9000) {
      leaveMatch();
    }
  }
  // сцена може змінитися (тривога в Києві)
  if (r.spec.look.location === 'kyiv' && r.state.frame % 120 === 0) {
    const sc2 = sceneFor(r.spec.look);
    if (sc2 !== r.scene) {
      announceScene(sc2, r.scene);
      r.scene = sc2;
    }
  }
}

function drawInfo(): DrawInfo {
  if (!run) {
    return { names: [menuLook.profiles[0].name, menuLook.profiles[1].name], localSide: -1, scene: menuLook.location };
  }
  const r = run;
  const names: [string, string] = [r.spec.look.profiles[0].name, r.spec.look.profiles[1].name];
  const info: DrawInfo = {
    names, localSide: localSide(r), scene: r.scene,
    banner: r.scene === 'metro' ? METRO_BANNER : undefined,
  };
  if (r.spec.tour) info.overText = 'Стрибок — до турнірної таблиці';
  if (r.spec.kind === 'watch') {
    info.hint = touchUi ? '👁 Ви глядач' : '👁 Ви глядач  ·  Enter — написати в чат';
    info.overText = '👁 Гравці вирішують, чи грати ще…';
    if (r.watchWaiting) info.waitText = 'Очікуємо, поки до кімнати приєднається суперник…';
    return info;
  }
  if (r.watchers.length) info.watchers = r.watchers.length;
  if (!touchUi && r.state.frame < 400 && !info.banner) {
    if (r.spec.kind === 'local') info.hint = 'Лівий: A D W S  ·  Правий: ← → ↑ ↓  ·  двічі вбік — ривок  ·  присісти+стрибок — супер';
    else info.hint = '← → ходити  ·  ↑ стрибок  ·  ↓ присісти  ·  ←← / →→ ривок  ·  ↓ і одразу ↑ — суперстрибок';
  }
  if (r.session) {
    const st = r.session.stats;
    info.ping = st.rtt;
    info.stalled = st.stalled;
    if (showDebug) {
      info.debug = `кадр ${r.session.frame}  відкат ${st.rollbackFrames}  перевага ${st.advantage.toFixed(1)}  затримка вводу ${r.session.inputDelay}${st.desync ? '  РОЗСИНХРОН!' : ''}`;
    }
  }
  return info;
}

// Коли вкладку згорнуто, requestAnimationFrame зупиняється — шлемо "пульс".
setInterval(() => {
  if (run?.spec.kind === 'online' && document.hidden) run.spec.link?.send({ t: 'ping', ts: performance.now() });
}, 1000);

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
  renderer.draw(run ? run.state : attract.state, drawInfo(), dt / 1000);
  if (DEBUG) (window as any).__state = run ? run.state : null;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export { defaultProfile };
