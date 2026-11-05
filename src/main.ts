import './style.css';
import {
  BALL_PRESETS, LOCATIONS, botProfile, loadProfile, locationById, resolveBall, saveProfile,
} from './cosmetics.ts';
import type { BallDesign, GameLook } from './cosmetics.ts';
import type { Difficulty } from './bot.ts';
import { loadSettings, saveSettings } from './settings.ts';
import { beginMatch, isPlaying, setMenuBackground } from './match.ts';
import { unlockAudio } from './audio.ts';
import { PREFIX, PeerNode, createRoomNode, errText, normalizeCode } from './net/peer.ts';
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

// ---------- гра по мережі (виклик друга) ----------

let cancelConnect: (() => void) | null = null;

function inviteUrl(code: string) {
  const q = new URLSearchParams({ room: code, n: profiles[0].name, l: settings.location, g: String(settings.target) });
  return `${location.origin}${location.pathname}?${q}`;
}

function startNetMatch(r: HandshakeResult, link: any) {
  cancelConnect = null;
  const lk: GameLook = {
    location: r.location, ball: r.ball,
    profiles: r.side === 0 ? [r.me, r.opp] : [r.opp, r.me],
  };
  beginMatch({ kind: 'online', look: lk, target: r.target, link, side: r.side, delay: r.delay, early: r.early, onExit: toMain });
}

$('#btn-host').addEventListener('click', async () => {
  unlockAudio();
  showScreen('wait');
  setWait('Виклик друга', 'Підключення до сервера…');
  $('#room-box').classList.add('hidden');
  let cancelled = false;
  let node: PeerNode | null = null;
  cancelConnect = () => { cancelled = true; node?.destroy(); };
  try {
    const res = await createRoomNode();
    node = res.node;
    if (cancelled) { node.destroy(); return; }
    const code = res.code;
    $('#room-box').classList.remove('hidden');
    $('#room-code').textContent = code;
    $('#btn-share').classList.toggle('hidden', !navigator.share);
    ($('#btn-copy') as HTMLButtonElement).onclick = () => copyText(inviteUrl(code), $('#btn-copy'), '📋 Копіювати посилання-виклик');
    ($('#btn-share') as HTMLButtonElement).onclick = () => {
      navigator.share?.({ title: 'Мішкобол', text: `${profiles[0].name} викликає тебе на гру в Мішкобол! Код: ${code}`, url: inviteUrl(code) }).catch(() => {});
    };
    setWait('Виклик друга', 'Надішліть другу посилання або код. Гра почнеться, щойно він прийме виклик. Не закривайте цю вкладку.');
    // показуємо, якщо зв'язок із сервером-"сватом" зник (тоді друг тимчасово не знайде кімнату)
    const st = setInterval(() => {
      if (!node || isPlaying()) { clearInterval(st); return; }
      const msg = node.online ? 'Надішліть другу посилання або код. Гра почнеться, щойно він прийме виклик. Не закривайте цю вкладку.'
        : '⚠️ Немає зв\'язку із сервером з\'єднань — перепідключаємось… (друг поки не знайде кімнату)';
      if (!busy) $('#wait-status').textContent = msg;
    }, 2000);
    let busy = false;
    const n = node;
    node.onConnection = (link) => {
      if (busy || link.meta?.kind !== 'room') { link.close(); return; }
      busy = true;
      setWait('Суперник підключився', 'Починаємо…');
      handshakeHost(link, { target: settings.target, location: settings.location, ball: ball() }, profiles[0], {},
        (r) => {
          startNetMatch(r, link);
          // після матчу вузол більше не потрібен
          const iv = setInterval(() => { if (!isPlaying()) { n.destroy(); clearInterval(iv); } }, 2000);
        },
        (why) => { busy = false; setWait('З\'єднання розірвано', why); });
    };
    node.onError = (t) => setWait('Помилка', t);
  } catch (e: any) {
    setWait('Помилка', errText(e.message));
  }
});

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
    // кімнату можуть тимчасово не знайти (друг на мить втратив зв'язок із сервером) — пробуємо ще до 90 с
    const t0 = Date.now();
    let link;
    for (;;) {
      try {
        link = await node.connect(PREFIX + code, { kind: 'room' });
        break;
      } catch (e: any) {
        if (cancelled) return;
        if (e.message !== 'peer-unavailable' || Date.now() - t0 > 90000) throw e;
        const left = Math.max(0, Math.round((90000 - (Date.now() - t0)) / 1000));
        setWait('Кімната ' + code, `Кімнату поки не знайдено — пробуємо ще (${left} с). Попросіть друга не закривати вкладку з грою. Якщо у когось увімкнений VPN — вимкніть.`);
        await new Promise((r) => setTimeout(r, 3000));
        if (cancelled) return;
      }
    }
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

$('#btn-join').addEventListener('click', () => joinRoom($<HTMLInputElement>('#join-code').value));
$<HTMLInputElement>('#join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom((e.target as HTMLInputElement).value);
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

// ---------- запрошення за посиланням ----------

function showInvite(kind: 'room' | 'tour', code: string, from: string, loc: string | null, target: string | null) {
  const info = $('#invite-info');
  info.innerHTML = '';
  const who = from ? from.slice(0, 16) : 'Друг';
  if (kind === 'room') {
    $('#invite-title').textContent = '⚔️ Вас викликають на гру!';
    info.append(el('div', {}, el('b', {}, who), ' викликає вас на матч у Мішкобол.'));
    const l = LOCATIONS.find((x) => x.id === loc);
    if (l) info.append(el('div', {}, 'Локація: ', el('b', {}, l.name)));
    if (target) info.append(el('div', {}, 'Гра до ', el('b', {}, target), ' очок'));
  } else {
    $('#invite-title').textContent = '🏆 Запрошення на турнір!';
    info.append(el('div', {}, el('b', {}, who), ' запрошує вас на турнір у Мішкобол.'));
  }
  info.append(el('div', {}, 'Ви граєте як:'), sackThumb(profiles[0], 60), el('b', {}, profiles[0].name),
    el('button', { class: 'mini', onclick: () => editProfile(profiles[0], 'Мій мішок', () => { saveProfile(0, profiles[0]); updateSackButtons(); showInvite(kind, code, from, loc, target); }) }, '🎨 Змінити вигляд'),
    el('div', { class: 'note' }, `Код: ${code}`));
  ($('#btn-accept') as HTMLButtonElement).onclick = () => {
    unlockAudio();
    if (kind === 'room') joinRoom(code);
    else joinOnlineTour(code);
  };
  ($('#btn-decline') as HTMLButtonElement).onclick = toMain;
  showScreen('invite');
}

// ---------- старт ----------

refreshMenuBg();
const params = new URLSearchParams(location.search);
const room = params.get('room');
const tcode = params.get('t');
const netsim = params.get('netsim');
if (room) {
  showInvite('room', normalizeCode(room), params.get('n') ?? '', params.get('l'), params.get('g'));
} else if (tcode) {
  showInvite('tour', normalizeCode(tcode), params.get('n') ?? '', null, null);
} else if (netsim !== null) {
  beginMatch({ kind: 'netsim', look: look(), target: settings.target, rtt: parseInt(netsim, 10) || 100, onExit: toMain });
}
if (settings.location === 'kyiv') refreshKyivAlert();
