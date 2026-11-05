import './style.css';
import {
  BALL_PRESETS, LOCATIONS, botProfile, loadProfile, locationById, resolveBall, saveProfile,
} from './cosmetics.ts';
import type { BallDesign, GameLook } from './cosmetics.ts';
import type { Difficulty } from './bot.ts';
import { loadSettings, saveSettings } from './settings.ts';
import { addWatcher, beginMatch, isPlaying, setMenuBackground } from './match.ts';
import { lobby } from './net/lobby.ts';
import type { RoomInfo } from './net/lobby.ts';
import { initChat } from './ui/chat.ts';
import { unlockAudio } from './audio.ts';
import { PREFIX, PeerNode, createRoomNode, errText, normalizeCode } from './net/peer.ts';
import type { Link } from './net/peer.ts';
import { handshakeGuest, handshakeHost } from './net/handshake.ts';
import type { HandshakeResult } from './net/handshake.ts';
import { $, copyText, el, setWait, showScreen } from './ui/dom.ts';
import { editBall, editProfile, sackThumb } from './ui/editors.ts';
import { initTour, joinOnlineTour, openTourSetup } from './ui/tour.ts';
import { refreshKyivAlert } from './alerts.ts';

const settings = loadSettings();
const profiles = [loadProfile(0), loadProfile(1)];

function ball(): BallDesign {
  return resolveBall(settings.ballChoice, settings.ballCustom, settings.location);
}

function look(p0 = profiles[0], p1 = profiles[1]): GameLook {
  return { location: settings.location, ball: ball(), profiles: [p0, p1] };
}

function refreshMenuBg() {
  setMenuBackground({ location: settings.location, ball: ball() });
}

// ---------- меню налаштувань ----------

const selLoc = $<HTMLSelectElement>('#set-location');
for (const l of LOCATIONS) selLoc.append(el('option', { value: l.id }, l.name));
selLoc.value = settings.location;
selLoc.onchange = () => {
  settings.location = selLoc.value;
  saveSettings(settings);
  refreshMenuBg();
  if (settings.location === 'kyiv') refreshKyivAlert();
};

const selBall = $<HTMLSelectElement>('#set-ball');
function fillBallSelect() {
  selBall.innerHTML = '';
  const def = BALL_PRESETS[locationById(settings.location).ball];
  selBall.append(el('option', { value: 'default' }, `За локацією (${def.name})`));
  for (const [k, v] of Object.entries(BALL_PRESETS)) selBall.append(el('option', { value: k }, v.name));
  selBall.append(el('option', { value: 'custom' }, '✏️ Свій дизайн'));
  selBall.value = settings.ballChoice;
}
fillBallSelect();
selLoc.addEventListener('change', fillBallSelect);
selBall.onchange = () => {
  settings.ballChoice = selBall.value;
  saveSettings(settings);
  refreshMenuBg();
  if (selBall.value === 'custom') openBallEditor();
};
function openBallEditor() {
  if (settings.ballChoice !== 'custom') {
    settings.ballCustom = { ...ball() };
    settings.ballChoice = 'custom';
    selBall.value = 'custom';
  }
  editBall(settings.ballCustom, () => { saveSettings(settings); refreshMenuBg(); });
}
$('#btn-edit-ball').addEventListener('click', openBallEditor);

const selTarget = $<HTMLSelectElement>('#set-target');
selTarget.value = String(settings.target);
selTarget.onchange = () => { settings.target = parseInt(selTarget.value, 10) || 15; saveSettings(settings); };

function updateSackButtons() {
  $('#btn-my-sack').replaceChildren(sackThumb(profiles[0], 26), ' ', profiles[0].name);
  $('#btn-p2-sack').replaceChildren(sackThumb(profiles[1], 26), ' ', profiles[1].name);
}
updateSackButtons();
$('#btn-my-sack').addEventListener('click', () => editProfile(profiles[0], 'Мій мішок', () => { saveProfile(0, profiles[0]); updateSackButtons(); }));
$('#btn-p2-sack').addEventListener('click', () => editProfile(profiles[1], 'Мішок гравця 2 (на одному пристрої)', () => { saveProfile(1, profiles[1]); updateSackButtons(); }));

document.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => {
  b.addEventListener('click', () => {
    unlockAudio();
    const go = b.dataset.go!;
    if (go === 'local') beginMatch({ kind: 'local', look: look(), target: settings.target, onExit: toMain });
    else if (go === 'tsetup') openTourSetup();
    else if (go === 'games') openGames();
    else if (go === 'main') { stopGames(); showScreen('main'); }
    else showScreen(go);
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-bot]').forEach((b) => {
  b.addEventListener('click', () => {
    unlockAudio();
    const d = b.dataset.bot as Difficulty;
    beginMatch({ kind: 'bot', look: look(profiles[0], botProfile(d)), target: settings.target, botSide: 1, botDiff: d, onExit: toMain });
  });
});

function toMain() {
  cancelConnect?.();
  cancelConnect = null;
  if (location.search) history.replaceState(null, '', location.pathname);
  showScreen('main');
  $('#menu').classList.remove('hidden');
}

initTour({
  myProfile: () => profiles[0],
  p2Profile: () => profiles[1],
  target: () => settings.target,
  location: () => settings.location,
  ball,
  toMain,
});

// ---------- ім'я (обов'язкове, запам'ятовується) ----------

const NAME_KEY = 'mishkobol-name-set';
function hasName(): boolean {
  try { return localStorage.getItem(NAME_KEY) === '1'; } catch { return true; }
}
let afterName: (() => void) | null = null;
/** Виконати дію, щойно в гравця буде ім'я (при першому запуску — спершу спитати). */
function withName(fn: () => void) {
  if (hasName()) { fn(); return; }
  afterName = fn;
  const inp = $<HTMLInputElement>('#name-input');
  inp.value = /^Гравець \d$/.test(profiles[0].name) ? '' : profiles[0].name;
  $('#name-err').textContent = '';
  showScreen('name');
  $('#menu').classList.remove('hidden');
  setTimeout(() => inp.focus(), 50);
}
function saveName() {
  const v = $<HTMLInputElement>('#name-input').value.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (v.length < 2) { $('#name-err').textContent = 'Ім\'я має містити хоча б 2 символи.'; return; }
  profiles[0].name = v;
  saveProfile(0, profiles[0]);
  try { localStorage.setItem(NAME_KEY, '1'); } catch { /* ignore */ }
  updateSackButtons();
  const fn = afterName ?? (() => showScreen('main'));
  afterName = null;
  fn();
}
$('#name-save').addEventListener('click', saveName);
$<HTMLInputElement>('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });

// ---------- гра по мережі (виклик друга) ----------

let cancelConnect: (() => void) | null = null;

function inviteUrl(code: string) {
  const q = new URLSearchParams({ room: code, n: profiles[0].name, l: settings.location, g: String(settings.target) });
  return `${location.origin}${location.pathname}?${q}`;
}
function watchUrl(code: string) {
  const q = new URLSearchParams({ watch: code, n: profiles[0].name });
  return `${location.origin}${location.pathname}?${q}`;
}

function startNetMatch(r: HandshakeResult, link: any, watchers: Link[] = [], onWatchers?: (n: number) => void) {
  cancelConnect = null;
  const lk: GameLook = {
    location: r.location, ball: r.ball,
    profiles: r.side === 0 ? [r.me, r.opp] : [r.opp, r.me],
  };
  beginMatch({
    kind: 'online', look: lk, target: r.target, link, side: r.side, delay: r.delay, early: r.early,
    watchers, onWatchers, onExit: toMain,
  });
}

$('#btn-host').addEventListener('click', () => withName(hostRoom));

async function hostRoom() {
  unlockAudio();
  showScreen('wait');
  setWait('Виклик друга', 'Підключення до сервера…');
  $('#room-box').classList.add('hidden');
  const isPublic = $<HTMLInputElement>('#room-public').checked;
  let cancelled = false;
  let node: PeerNode | null = null;
  let code = '';
  const watchers: Link[] = [];
  let players = 1;
  let liveWatchers = -1; // під час матчу кількість глядачів повідомляє рушій гри
  const announce = () => {
    if (!isPublic || !code) return;
    const w = liveWatchers >= 0 ? liveWatchers : watchers.length;
    lobby.announce({ code, kind: 'room', host: profiles[0].name, location: settings.location, target: settings.target, players, maxPlayers: 2, watchers: w });
  };
  const finish = () => {
    if (code) lobby.remove(code);
    for (const w of watchers) w.close();
    node?.destroy();
  };
  cancelConnect = () => { cancelled = true; finish(); };
  try {
    const res = await createRoomNode();
    node = res.node;
    if (cancelled) { node.destroy(); return; }
    code = res.code;
    $('#room-box').classList.remove('hidden');
    $('#room-code').textContent = code;
    $('#btn-share').classList.toggle('hidden', !navigator.share);
    ($('#btn-copy') as HTMLButtonElement).onclick = () => copyText(inviteUrl(code), $('#btn-copy'), '📋 Копіювати посилання-виклик');
    ($('#btn-copy-watch') as HTMLButtonElement).onclick = () => copyText(watchUrl(code), $('#btn-copy-watch'), '👁 Посилання для глядачів');
    ($('#btn-share') as HTMLButtonElement).onclick = () => {
      navigator.share?.({ title: 'Мішкобол', text: `${profiles[0].name} викликає тебе на гру в Мішкобол! Код: ${code}`, url: inviteUrl(code) }).catch(() => {});
    };
    const waitMsg = () => `Надішліть другу посилання або код. Гра почнеться, щойно він прийме виклик. Не закривайте цю вкладку.${watchers.length ? ` 👁 Глядачів: ${watchers.length}` : ''}`;
    setWait('Виклик друга', waitMsg());
    announce();
    let busy = false;
    // показуємо, якщо зв'язок із сервером-"сватом" зник (тоді друг тимчасово не знайде кімнату)
    const st = setInterval(() => {
      if (!node || isPlaying() || cancelled) { clearInterval(st); return; }
      if (!busy) $('#wait-status').textContent = node.online ? waitMsg() : '⚠️ Немає зв\'язку із сервером з\'єднань — перепідключаємось… (друг поки не знайде кімнату)';
    }, 2000);
    const n = node;
    const myLookWaiting = (): GameLook => ({ location: settings.location, ball: ball(), profiles: [profiles[0], { ...profiles[0], name: '…' }] });
    node.onConnection = (link) => {
      const kind = link.meta?.kind;
      if (kind === 'watch') {
        if (isPlaying()) {
          if (!addWatcher(link)) link.close();
          return;
        }
        watchers.push(link);
        link.send({ t: 'look', look: myLookWaiting(), waiting: true });
        link.onMessage = (m: any) => { if (m?.t === 'hi') (link as any).wname = String(m.name ?? 'Глядач').slice(0, 16); };
        link.onClose = () => { const i = watchers.indexOf(link); if (i >= 0) watchers.splice(i, 1); announce(); };
        announce();
        return;
      }
      if (busy || kind !== 'room') { link.close(); return; }
      busy = true;
      setWait('Суперник підключився', 'Починаємо…');
      handshakeHost(link, { target: settings.target, location: settings.location, ball: ball() }, profiles[0], {},
        (r) => {
          players = 2;
          announce();
          liveWatchers = watchers.length;
          startNetMatch(r, link, [...watchers], (cnt) => { liveWatchers = cnt; announce(); });
          // після матчу вузол і оголошення більше не потрібні
          const iv = setInterval(() => {
            if (!isPlaying()) { clearInterval(iv); clearInterval(st); if (code) lobby.remove(code); n.destroy(); }
          }, 2000);
        },
        (why) => { busy = false; setWait('З\'єднання розірвано', why); });
    };
    node.onError = (t) => setWait('Помилка', t);
  } catch (e: any) {
    setWait('Помилка', errText(e.message));
  }
}

/** Підключення до вузла кімнати з повторними спробами, якщо її тимчасово не знайдено. */
async function connectRoom(node: PeerNode, code: string, kind: 'room' | 'watch', isCancelled: () => boolean): Promise<Link | null> {
  const t0 = Date.now();
  for (;;) {
    try {
      return await node.connect(PREFIX + code, { kind });
    } catch (e: any) {
      if (isCancelled()) return null;
      if (e.message !== 'peer-unavailable' || Date.now() - t0 > 90000) throw e;
      const left = Math.max(0, Math.round((90000 - (Date.now() - t0)) / 1000));
      setWait('Кімната ' + code, `Кімнату поки не знайдено — пробуємо ще (${left} с). Попросіть друга не закривати вкладку з грою. Якщо у когось увімкнений VPN — вимкніть.`);
      await new Promise((r) => setTimeout(r, 3000));
      if (isCancelled()) return null;
    }
  }
}

async function joinRoom(codeRaw: string) {
  const code = normalizeCode(codeRaw);
  if (code.length !== 5) { $<HTMLInputElement>('#join-code').focus(); return; }
  showScreen('wait');
  $('#room-box').classList.add('hidden');
  setWait('Кімната ' + code, 'Підключення…');
  let cancelled = false;
  let node: PeerNode | null = null;
  cancelConnect = () => { cancelled = true; node?.destroy(); };
  try {
    node = await PeerNode.create();
    if (cancelled) { node.destroy(); return; }
    setWait('Кімната ' + code, 'Шукаємо суперника…');
    const link = await connectRoom(node, code, 'room', () => cancelled);
    if (!link) return;
    if (cancelled) { link.close(); return; }
    setWait('З\'єднано', 'Чекаємо на початок…');
    const n = node;
    handshakeGuest(link, profiles[0], (r) => {
      startNetMatch(r, link);
      const iv = setInterval(() => { if (!isPlaying()) { n.destroy(); clearInterval(iv); } }, 2000);
    }, (why) => setWait('Не вдалося підключитися', why));
  } catch (e: any) {
    setWait('Не вдалося підключитися', errText(e.message));
    node?.destroy();
  }
}

/** Дивитися чужу гру як глядач. */
async function watchRoom(codeRaw: string) {
  const code = normalizeCode(codeRaw);
  if (code.length !== 5) return;
  showScreen('wait');
  $('#room-box').classList.add('hidden');
  setWait('Перегляд гри ' + code, 'Підключення…');
  let cancelled = false;
  let node: PeerNode | null = null;
  cancelConnect = () => { cancelled = true; node?.destroy(); };
  try {
    node = await PeerNode.create();
    if (cancelled) { node.destroy(); return; }
    setWait('Перегляд гри ' + code, 'Шукаємо гру…');
    const link = await connectRoom(node, code, 'watch', () => cancelled);
    if (!link) return;
    cancelConnect = null;
    const n = node;
    beginMatch({ kind: 'watch', look: look(), target: settings.target, link, myName: profiles[0].name, onExit: () => { n.destroy(); toMain(); } });
  } catch (e: any) {
    setWait('Не вдалося підключитися', errText(e.message));
    node?.destroy();
  }
}

$('#btn-join').addEventListener('click', () => withName(() => joinRoom($<HTMLInputElement>('#join-code').value)));
$<HTMLInputElement>('#join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; withName(() => joinRoom(v)); }
});
$<HTMLInputElement>('#join-code').addEventListener('input', (e) => {
  const x = e.target as HTMLInputElement;
  x.value = normalizeCode(x.value);
});
$('#btn-cancel').addEventListener('click', () => {
  cancelConnect?.();
  cancelConnect = null;
  if (location.search) history.replaceState(null, '', location.pathname);
  showScreen('online');
});

// ---------- список відкритих ігор ----------

let unsubGames: (() => void) | null = null;
function renderGames(rooms: RoomInfo[]) {
  const box = $('#games-list');
  box.innerHTML = '';
  const list = [...rooms].sort((a, b) => (a.players >= a.maxPlayers ? 1 : 0) - (b.players >= b.maxPlayers ? 1 : 0));
  for (const r of list) {
    const loc = LOCATIONS.find((l) => l.id === r.location)?.name ?? '';
    const full = r.players >= r.maxPlayers;
    const status = r.kind === 'tour'
      ? (full ? `🏆 Турнір іде · учасників ${r.players}` : `🏆 Турнір збирається · ${r.players}/8`)
      : full ? '⚔️ Грають' : '⏳ Чекає суперника';
    const btns: HTMLElement[] = [];
    if (r.kind === 'room' && !full) btns.push(el('button', { class: 'accent', onclick: () => { stopGames(); withName(() => joinRoom(r.code)); } }, '⚔️ Грати'));
    if (r.kind === 'room') btns.push(el('button', { onclick: () => { stopGames(); withName(() => watchRoom(r.code)); } }, '👁 Дивитися'));
    if (r.kind === 'tour' && !full) btns.push(el('button', { class: 'accent', onclick: () => { stopGames(); withName(() => joinOnlineTour(r.code)); } }, '🏆 Приєднатися'));
    if (r.kind === 'tour') btns.push(el('button', { onclick: () => { stopGames(); withName(() => joinOnlineTour(r.code, true)); } }, '👁 Дивитися'));
    box.append(el('div', { class: 'game-row' },
      el('div', { class: 'info' }, el('b', {}, r.host), el('span', {}, `${status} · ${loc} · до ${r.target}${r.watchers ? ` · 👁 ${r.watchers}` : ''}`)),
      ...btns));
  }
  $('#games-status').textContent = rooms.length ? '' : 'Поки що відкритих ігор немає. Створіть свою: «Гра по мережі → Викликати друга».';
}
function stopGames() { unsubGames?.(); unsubGames = null; }
function openGames() {
  showScreen('games');
  $('#games-status').textContent = 'Шукаємо ігри…';
  $('#games-list').innerHTML = '';
  stopGames();
  unsubGames = lobby.subscribe(renderGames);
}

// ---------- запрошення за посиланням ----------

function showInvite(kind: 'room' | 'tour' | 'watch', code: string, from: string, loc: string | null, target: string | null) {
  const info = $('#invite-info');
  info.innerHTML = '';
  const who = from ? from.slice(0, 16) : 'Друг';
  if (kind === 'room') {
    $('#invite-title').textContent = '⚔️ Вас викликають на гру!';
    info.append(el('div', {}, el('b', {}, who), ' викликає вас на матч у Мішкобол.'));
    const l = LOCATIONS.find((x) => x.id === loc);
    if (l) info.append(el('div', {}, 'Локація: ', el('b', {}, l.name)));
    if (target) info.append(el('div', {}, 'Гра до ', el('b', {}, target), ' очок'));
  } else if (kind === 'watch') {
    $('#invite-title').textContent = '👁 Запрошення подивитися гру';
    info.append(el('div', {}, el('b', {}, who), ' запрошує вас подивитися матч і поспілкуватися в чаті.'));
  } else {
    $('#invite-title').textContent = '🏆 Запрошення на турнір!';
    info.append(el('div', {}, el('b', {}, who), ' запрошує вас на турнір у Мішкобол.'));
  }
  info.append(el('div', {}, kind === 'watch' ? 'Ваше ім\'я в чаті:' : 'Ви граєте як:'), sackThumb(profiles[0], 60), el('b', {}, profiles[0].name),
    el('button', { class: 'mini', onclick: () => editProfile(profiles[0], 'Мій мішок', () => { saveProfile(0, profiles[0]); updateSackButtons(); showInvite(kind, code, from, loc, target); }) }, '🎨 Змінити ім\'я і вигляд'),
    el('div', { class: 'note' }, `Код: ${code}`));
  $('#btn-accept').textContent = kind === 'watch' ? '👁 Дивитися' : '✅ Прийняти';
  ($('#btn-accept') as HTMLButtonElement).onclick = () => {
    unlockAudio();
    if (kind === 'room') joinRoom(code);
    else if (kind === 'watch') watchRoom(code);
    else joinOnlineTour(code);
  };
  ($('#btn-decline') as HTMLButtonElement).onclick = toMain;
  showScreen('invite');
}

// ---------- старт ----------

initChat();
refreshMenuBg();
const params = new URLSearchParams(location.search);
const room = params.get('room');
const tcode = params.get('t');
const wcode = params.get('watch');
const netsim = params.get('netsim');
const startFlow = () => {
  if (room) showInvite('room', normalizeCode(room), params.get('n') ?? '', params.get('l'), params.get('g'));
  else if (tcode) showInvite('tour', normalizeCode(tcode), params.get('n') ?? '', null, null);
  else if (wcode) showInvite('watch', normalizeCode(wcode), params.get('n') ?? '', null, null);
  else if (netsim !== null) beginMatch({ kind: 'netsim', look: look(), target: settings.target, rtt: parseInt(netsim, 10) || 100, onExit: toMain });
  else showScreen('main');
};
withName(startFlow);
if (settings.location === 'kyiv') refreshKyivAlert();
