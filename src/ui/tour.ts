// Турніри: на одному пристрої та по мережі.

import { botProfile, defaultProfile, randomProfile, sanitizeProfile, sanitizeBall, LOCATIONS } from '../cosmetics.ts';
import type { BallDesign, GameLook, Profile } from '../cosmetics.ts';
import {
  forfeitScore, isFinished, makeSchedule, nextLocalMatch, simulateBotMatch, standings,
} from '../tournament.ts';
import type { TMatch, TPlayer, Tournament } from '../tournament.ts';
import { beginMatch, isPlaying } from '../match.ts';
import type { Difficulty } from '../bot.ts';
import { PREFIX, PeerNode, createRoomNode, errText } from '../net/peer.ts';
import type { Link } from '../net/peer.ts';
import { handshakeGuest, handshakeHost } from '../net/handshake.ts';
import { $, copyText, el, showScreen } from './dom.ts';
import { editProfile, sackThumb } from './editors.ts';

export interface TourEnv {
  myProfile: () => Profile;
  p2Profile: () => Profile;
  target: () => number;
  location: () => string;
  ball: () => BallDesign;
  toMain: () => void;
}

const BOT_LABEL: Record<string, string> = { easy: 'Бот 🥔 легкий', normal: 'Бот 🧅 нормальний', hard: 'Бот 😈 складний' };

let env: TourEnv;

export function initTour(e: TourEnv) {
  env = e;
  setupLocalUi();
}

// =============== спільне: таблиця ===============

function renderTable(t: Tournament, myIds: number[]) {
  const st = standings(t);
  const byId = new Map(t.players.map((p) => [p.id, p]));
  const table = el('table', { class: 'standings' },
    el('tr', {}, el('th', {}, '#'), el('th', {}, 'Гравець'), el('th', {}, 'І'), el('th', {}, 'В'), el('th', {}, 'П'), el('th', {}, 'Очки')));
  st.forEach((s, i) => {
    const p = byId.get(s.id)!;
    const nm = el('td', { class: 'nm' }, sackThumb(p.profile, 26), p.profile.name + (p.bot ? ' 🤖' : '') + (p.left ? ' (вийшов)' : ''));
    table.append(el('tr', { class: myIds.includes(s.id) ? 'me' : '' },
      el('td', {}, String(i + 1)), nm, el('td', {}, String(s.played)), el('td', {}, String(s.wins)), el('td', {}, String(s.losses)),
      el('td', {}, `${s.pf}:${s.pa}`)));
  });
  $('#tt-table').replaceChildren(table);
  const list = el('div', { class: 'mlist' });
  for (const m of t.matches) {
    const a = byId.get(m.a)!, b = byId.get(m.b)!;
    const res = m.score ? `${m.score[0]}:${m.score[1]}${m.note ? ' (' + m.note + ')' : ''}` : m.status === 'playing' ? (m.live ? `${m.live[0]}:${m.live[1]} ●` : 'грають ●') : '—';
    list.append(el('div', { class: m.status === 'playing' ? 'live' : '' }, el('span', {}, `Коло ${m.round}: ${a.profile.name} — ${b.profile.name}`), el('b', {}, res)));
  }
  $('#tt-matches').replaceChildren(list);
  $('#tt-title').textContent = `Турнір · ${t.players.length} учасників · ${t.rounds} ${t.rounds === 1 ? 'коло' : 'кола'}`;
}

function championBox(t: Tournament): HTMLElement {
  const st = standings(t);
  const w = t.players.find((p) => p.id === st[0].id)!;
  return el('div', {}, el('div', { class: 'champion' }, '🏆 Переможець: ', w.profile.name), sackThumb(w.profile, 80));
}

function lookFor(t: Tournament, ball: BallDesign, a: TPlayer, b: TPlayer): GameLook {
  return { location: t.location, ball, profiles: [a.profile, b.profile] };
}

// =============== турнір на одному пристрої ===============

interface Entry { profile: Profile; bot: '' | Difficulty }
let entries: Entry[] = [];
let localT: Tournament | null = null;

function setupLocalUi() {
  const modeBtns = document.querySelectorAll<HTMLButtonElement>('#t-mode button');
  modeBtns.forEach((b) => b.addEventListener('click', () => {
    modeBtns.forEach((x) => x.classList.toggle('on', x === b));
    $('#t-local').classList.toggle('hidden', b.dataset.v !== 'local');
    $('#t-online').classList.toggle('hidden', b.dataset.v !== 'online');
  }));
  $('#t-add').addEventListener('click', () => {
    if (entries.length >= 8) return;
    entries.push({ profile: randomProfile(`Гравець ${entries.length + 1}`), bot: '' });
    renderEntries();
  });
  $('#t-add-bot').addEventListener('click', () => {
    if (entries.length >= 8) return;
    entries.push({ profile: randomProfile(), bot: 'normal' });
    renderEntries();
  });
  $('#t-start').addEventListener('click', startLocal);
  $('#t-host').addEventListener('click', hostOnline);
  $('#tt-leave').addEventListener('click', () => {
    if (localT && !isFinished(localT) && !confirm('Вийти з турніру? Результати буде втрачено.')) return;
    if (client && !confirm('Вийти з мережевого турніру?')) return;
    localT = null;
    leaveOnline();
    env.toMain();
  });
}

export function openTourSetup() {
  if (entries.length === 0) {
    entries = [
      { profile: env.myProfile(), bot: '' },
      { profile: env.p2Profile(), bot: '' },
      { profile: botProfile('normal', 2), bot: 'normal' },
    ];
  }
  renderEntries();
  showScreen('tsetup');
}

function renderEntries() {
  const box = $('#t-players');
  box.innerHTML = '';
  entries.forEach((e, i) => {
    const thumb = sackThumb(e.profile, 34);
    thumb.style.cursor = 'pointer';
    thumb.title = 'Змінити вигляд';
    thumb.onclick = () => editProfile(e.profile, `Вигляд: ${e.profile.name}`, renderEntries);
    const name = el('input', { value: e.profile.name, maxlength: '16' }) as HTMLInputElement;
    name.oninput = () => { e.profile.name = name.value.trim() || `Гравець ${i + 1}`; };
    const type = el('select') as HTMLSelectElement;
    type.append(el('option', { value: '' }, '👤 Людина'));
    for (const d of ['easy', 'normal', 'hard']) type.append(el('option', { value: d }, BOT_LABEL[d]));
    type.value = e.bot;
    type.onchange = () => { e.bot = type.value as Entry['bot']; };
    const del = el('button', { class: 'mini', title: 'Прибрати', onclick: () => { if (entries.length > 3) { entries.splice(i, 1); renderEntries(); } } }, '✕');
    box.append(el('div', { class: 'tp' }, thumb, name, type, el('button', { class: 'mini', title: 'Вигляд', onclick: () => thumb.click() }, '🎨'), del));
  });
  ($('#t-add') as HTMLButtonElement).disabled = entries.length >= 8;
  ($('#t-add-bot') as HTMLButtonElement).disabled = entries.length >= 8;
}

function rounds(): number {
  return parseInt(($('#t-rounds') as HTMLSelectElement).value, 10) || 1;
}

function startLocal() {
  const players: TPlayer[] = entries.map((e, i) => ({ id: i, profile: { ...e.profile }, bot: e.bot }));
  localT = {
    players,
    matches: makeSchedule(players.map((p) => p.id), rounds()),
    rounds: rounds(),
    target: env.target(),
    location: env.location(),
  };
  showLocalTable();
}

function showLocalTable() {
  const t = localT!;
  // матчі ботів між собою рахуємо одразу
  for (const m of t.matches) {
    if (m.status === 'done') continue;
    const a = t.players[m.a], b = t.players[m.b];
    if (a.bot && b.bot) {
      m.score = simulateBotMatch(a.bot, b.bot, t.target);
      m.status = 'done';
      m.note = 'симуляція';
    }
  }
  renderTable(t, t.players.filter((p) => !p.bot).map((p) => p.id));
  const next = $('#tt-next');
  next.innerHTML = '';
  if (isFinished(t)) {
    next.append(championBox(t), el('button', { class: 'big accent', onclick: () => { localT = null; openTourSetup(); } }, '🔁 Новий турнір'));
  } else {
    const m = nextLocalMatch(t)!;
    const a = t.players[m.a], b = t.players[m.b];
    next.append(
      el('div', { class: 'note' }, `Коло ${m.round} · наступний матч`),
      el('div', { class: 'vs' }, sackThumb(a.profile, 34), a.profile.name, ' vs ', b.profile.name, sackThumb(b.profile, 34)),
      el('button', { class: 'big accent', onclick: () => playLocal(m) }, '▶ Грати'),
    );
  }
  showScreen('ttable');
  $('#menu').classList.remove('hidden');
}

function playLocal(m: TMatch) {
  const t = localT!;
  const a = t.players[m.a], b = t.players[m.b];
  const look = lookFor(t, env.ball(), a, b);
  const tour = {
    label: `Коло ${m.round}`,
    onDone: (score: [number, number], note?: string) => {
      m.score = score;
      m.status = 'done';
      m.note = note;
    },
  };
  const onExit = () => showLocalTable();
  if (!a.bot && !b.bot) beginMatch({ kind: 'local', look, target: t.target, tour, onExit });
  else beginMatch({ kind: 'bot', look, target: t.target, botSide: a.bot ? 0 : 1, botDiff: (a.bot || b.bot) as Difficulty, tour, onExit });
}

// =============== мережевий турнір ===============
// Хост ("хаб") координує: приймає учасників, складає розклад, роздає матчі.
// Матчі між людьми йдуть напряму між їхніми браузерами (P2P), з ботами — локально в гравця.

interface ClientState {
  node: PeerNode;
  myId: number;
  t: Tournament | null;
  lobby: TPlayer[];
  isHost: boolean;
  code: string;
  toHub: (msg: any) => void;
  pendingConns: Map<number, Link>;
  inMatch: number;
  ball: BallDesign;
  rounds: number;
}

let client: ClientState | null = null;
let hub: Hub | null = null;

const tourUrl = (code: string, name: string) =>
  `${location.origin}${location.pathname}?t=${code}&n=${encodeURIComponent(name)}`;

class Hub {
  t: Tournament;
  started = false;
  links = new Map<number, Link>();
  nextId = 1;
  ball: BallDesign;
  private lastBroadcast = 0;
  private bcTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(hostProfile: Profile, hostPeer: string, target: number, location: string, ball: BallDesign, roundsN: number) {
    this.t = { players: [{ id: 0, profile: hostProfile, bot: '', peer: hostPeer }], matches: [], rounds: roundsN, target, location };
    this.ball = ball;
  }

  addLink(link: Link) {
    let id = -1;
    link.onMessage = (m: any) => {
      if (m?.t === 'tjoin' && id < 0) {
        if (this.started || this.t.players.length >= 8) {
          link.send({ t: 'tfull', reason: this.started ? 'Турнір уже почався.' : 'Уже 8 учасників.' });
          setTimeout(() => link.close(), 300);
          return;
        }
        id = this.nextId++;
        this.t.players.push({ id, profile: sanitizeProfile(m.profile, defaultProfile(id)), bot: '', peer: String(m.peer ?? '') });
        this.links.set(id, link);
        link.send({ t: 'twelcome', id });
        this.broadcast();
      } else if (id >= 0) {
        this.onMsg(id, m);
      }
    };
    link.onClose = () => { if (id >= 0) this.leave(id); };
  }

  addBot(diff: Difficulty) {
    if (this.started || this.t.players.length >= 8) return;
    const id = this.nextId++;
    this.t.players.push({ id, profile: botProfile(diff, id), bot: diff });
    this.t.players[this.t.players.length - 1].profile.name = randomProfile().name + ' 🤖';
    this.broadcast();
  }

  start(): boolean {
    const active = this.t.players.filter((p) => !p.left);
    if (active.length < 3) return false;
    this.t.players = active;
    this.t.matches = makeSchedule(active.map((p) => p.id), this.t.rounds);
    this.started = true;
    this.broadcast(true);
    this.pump();
    return true;
  }

  onMsg(id: number, m: any) {
    const match = this.t.matches.find((x) => x.id === m?.mid);
    if (!match || (match.a !== id && match.b !== id)) return;
    if (m.t === 'tresult' && match.status !== 'done') {
      const s = m.score;
      if (Array.isArray(s) && s.length === 2 && s.every((v: any) => Number.isInteger(v) && v >= 0 && v < 999) && s[0] !== s[1]) {
        match.score = [s[0], s[1]];
        match.status = 'done';
        match.live = undefined;
        if (typeof m.note === 'string') match.note = m.note.slice(0, 20);
        this.broadcast(true);
        this.pump();
      }
    } else if (m.t === 'tlive' && match.status === 'playing' && Array.isArray(m.score)) {
      match.live = [m.score[0] | 0, m.score[1] | 0];
      this.broadcast();
    }
  }

  leave(id: number) {
    const p = this.t.players.find((x) => x.id === id);
    if (!p) return;
    this.links.delete(id);
    if (!this.started) {
      this.t.players = this.t.players.filter((x) => x.id !== id);
      this.broadcast();
      return;
    }
    p.left = true;
    for (const m of this.t.matches) {
      if (m.status === 'done' || (m.a !== id && m.b !== id)) continue;
      m.score = forfeitScore(this.t.target, m.b === id);
      m.status = 'done';
      m.note = 'тех.';
    }
    this.broadcast(true);
    this.pump();
  }

  /** Роздає матчі вільним гравцям. */
  pump() {
    const busy = new Set<number>();
    for (const m of this.t.matches) if (m.status === 'playing') { busy.add(m.a); busy.add(m.b); }
    const byId = new Map(this.t.players.map((p) => [p.id, p]));
    for (const m of this.t.matches) {
      if (m.status !== 'pending') continue;
      const a = byId.get(m.a)!, b = byId.get(m.b)!;
      if (busy.has(a.id) || busy.has(b.id)) continue;
      if (a.bot && b.bot) {
        m.score = simulateBotMatch(a.bot, b.bot, this.t.target);
        m.status = 'done';
        m.note = 'симуляція';
        continue;
      }
      m.status = 'playing';
      busy.add(a.id); busy.add(b.id);
      const msg = (side: number) => ({
        t: 'tmatch', mid: m.id, side, round: m.round,
        opp: side === 0 ? b : a, me: side === 0 ? a : b,
        target: this.t.target, location: this.t.location, ball: this.ball,
      });
      if (!a.bot) this.send(a.id, msg(0));
      if (!b.bot) this.send(b.id, msg(1));
    }
    this.broadcast(true);
  }

  send(id: number, msg: any) {
    if (id === 0) clientReceive(msg);
    else this.links.get(id)?.send(msg);
  }

  broadcast(now = false) {
    const doIt = () => {
      this.bcTimer = null;
      this.lastBroadcast = performance.now();
      const msg = this.started
        ? { t: 'tstate', t2: this.t, finished: isFinished(this.t) }
        : { t: 'tlobby', players: this.t.players, rounds: this.t.rounds, target: this.t.target, location: this.t.location };
      clientReceive(msg);
      for (const l of this.links.values()) l.send(msg);
    };
    if (now || performance.now() - this.lastBroadcast > 400) {
      if (this.bcTimer) { clearTimeout(this.bcTimer); this.bcTimer = null; }
      doIt();
    } else if (!this.bcTimer) {
      this.bcTimer = setTimeout(doIt, 400);
    }
  }
}

function setTlStatus(s: string) { $('#tl-status').textContent = s; }

async function hostOnline() {
  showScreen('tlobby');
  $('#tl-title').textContent = 'Мережевий турнір';
  $('#tl-host-ctrl').classList.remove('hidden');
  $('#tl-code').textContent = '-----';
  setTlStatus('Підключення до сервера…');
  try {
    const { node, code } = await createRoomNode();
    const me = env.myProfile();
    hub = new Hub({ ...me }, node.id, env.target(), env.location(), env.ball(), rounds());
    client = {
      node, myId: 0, t: null, lobby: [], isHost: true, code, ball: env.ball(), rounds: rounds(),
      toHub: (m) => hub!.onMsg(0, m), pendingConns: new Map(), inMatch: -1,
    };
    node.onConnection = (link) => {
      if (link.meta?.kind === 'hub') hub!.addLink(link);
      else if (link.meta?.kind === 'match') onMatchConn(link);
      else link.close();
    };
    node.onError = (t) => setTlStatus(t);
    $('#tl-code').textContent = code;
    ($('#tl-copy') as HTMLButtonElement).onclick = () => copyText(tourUrl(code, me.name), $('#tl-copy'), '📋 Копіювати запрошення');
    setTlStatus('Надішліть запрошення друзям. Потрібно 3–8 учасників.');
    hub.broadcast(true);
  } catch (e: any) {
    setTlStatus(errText(e.message));
  }
}

$('#tl-add-bot').addEventListener('click', () => hub?.addBot('normal'));
$('#tl-start').addEventListener('click', () => {
  if (!hub) return;
  if (!hub.start()) setTlStatus('Потрібно щонайменше 3 учасники (можна додати ботів).');
});
$('#tl-leave').addEventListener('click', () => { leaveOnline(); env.toMain(); });

export async function joinOnlineTour(code: string) {
  showScreen('tlobby');
  $('#tl-title').textContent = 'Турнір ' + code;
  $('#tl-host-ctrl').classList.add('hidden');
  $('#tl-code').textContent = code;
  ($('#tl-copy') as HTMLButtonElement).onclick = () => copyText(tourUrl(code, env.myProfile().name), $('#tl-copy'), '📋 Копіювати запрошення');
  $('#tl-players').innerHTML = '';
  setTlStatus('Підключення…');
  try {
    const node = await PeerNode.create();
    const t0 = Date.now();
    let link: Link;
    for (;;) {
      try {
        link = await node.connect(PREFIX + code, { kind: 'hub' });
        break;
      } catch (e: any) {
        if (e.message !== 'peer-unavailable' || Date.now() - t0 > 90000) throw e;
        setTlStatus('Турнір поки не знайдено — пробуємо ще… Якщо у когось увімкнений VPN — вимкніть.');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    client = {
      node, myId: -1, t: null, lobby: [], isHost: false, code, ball: env.ball(), rounds: 1,
      toHub: (m) => link.send(m), pendingConns: new Map(), inMatch: -1,
    };
    node.onConnection = (l) => { if (l.meta?.kind === 'match') onMatchConn(l); else l.close(); };
    link.onMessage = (m) => clientReceive(m);
    link.onClose = () => {
      if (!client) return;
      setTlStatus('Зв\'язок з організатором турніру втрачено.');
      $('#tt-next').replaceChildren(el('p', { class: 'note' }, 'Зв\'язок з організатором турніру втрачено. Турнір припинено.'));
    };
    link.send({ t: 'tjoin', profile: env.myProfile(), peer: node.id });
    setTlStatus('Очікуємо, поки організатор почне турнір…');
  } catch (e: any) {
    setTlStatus(errText(e.message));
  }
}

function leaveOnline() {
  if (!client) return;
  const c = client;
  client = null;
  if (hub) {
    for (const l of hub.links.values()) { l.send({ t: 'tend', reason: 'Організатор закрив турнір.' }); }
    hub = null;
  }
  c.node.destroy();
}

function onMatchConn(link: Link) {
  if (!client) { link.close(); return; }
  const mid = link.meta?.mid;
  client.pendingConns.set(mid, link);
  tryStartPending();
}

let waitingMatch: any = null;

function tryStartPending() {
  if (!client || !waitingMatch) return;
  const link = client.pendingConns.get(waitingMatch.mid);
  if (!link) return;
  client.pendingConns.delete(waitingMatch.mid);
  const m = waitingMatch;
  waitingMatch = null;
  handshakeHost(link, { target: m.target, location: m.location, ball: m.ball }, m.me.profile, {},
    (r) => startOnlineTourMatch(m, link, r.delay, r.early), (why) => tourMatchFailed(m, why));
}

function tourMatchFailed(m: any, why: string) {
  if (!client) return;
  client.inMatch = -1;
  // якщо не вдалося з'єднатися — не зараховуємо нікому; повідомляємо
  $('#tt-next').replaceChildren(el('p', { class: 'note' }, `Не вдалося з'єднатися із суперником: ${why}`));
  client.toHub({ t: 'tresult', mid: m.mid, score: m.side === 0 ? [m.target, 0] : [0, m.target], note: 'тех.' });
}

function tourDoneHandler(m: any) {
  return {
    label: `Коло ${m.round}`,
    onDone: (score: [number, number], note?: string) => {
      client?.toHub({ t: 'tresult', mid: m.mid, score, note });
    },
    onLive: (score: [number, number]) => client?.toHub({ t: 'tlive', mid: m.mid, score }),
  };
}

function backToTable() {
  if (!client) { env.toMain(); return; }
  client.inMatch = -1;
  $('#menu').classList.remove('hidden');
  renderClient();
}

function startOnlineTourMatch(m: any, link: Link, delay: number, early: any[]) {
  const look: GameLook = {
    location: m.location, ball: sanitizeBall(m.ball),
    profiles: m.side === 0 ? [m.me.profile, m.opp.profile] : [m.opp.profile, m.me.profile],
  };
  beginMatch({
    kind: 'online', look, target: m.target, link, side: m.side, delay, early,
    tour: tourDoneHandler(m), onExit: backToTable,
  });
}

function clientReceive(m: any) {
  if (!client || !m) return;
  switch (m.t) {
    case 'twelcome':
      client.myId = m.id;
      break;
    case 'tfull':
      setTlStatus(m.reason);
      break;
    case 'tend':
      setTlStatus(m.reason);
      $('#tt-next').replaceChildren(el('p', { class: 'note' }, m.reason));
      break;
    case 'tlobby': {
      client.lobby = m.players;
      const box = $('#tl-players');
      box.innerHTML = '';
      for (const p of m.players as TPlayer[]) {
        const pr = sanitizeProfile(p.profile, defaultProfile(0));
        box.append(el('div', { class: 'tp' }, sackThumb(pr, 30), el('span', { class: 'who' }, pr.name + (p.id === 0 ? ' 👑' : '') + (p.id === client.myId ? ' (ви)' : ''))));
      }
      const loc = LOCATIONS.find((l) => l.id === m.location)?.name ?? '';
      if (!client.isHost) setTlStatus(`Учасників: ${m.players.length}. ${loc}, до ${m.target} очок, кіл: ${m.rounds}. Очікуємо старту…`);
      else setTlStatus(`Учасників: ${m.players.length}/8. Потрібно щонайменше 3.`);
      break;
    }
    case 'tstate': {
      const t = m.t2 as Tournament;
      for (const p of t.players) p.profile = sanitizeProfile(p.profile, defaultProfile(p.id));
      client.t = t;
      // матч, на який ми чекали, уже закрито (напр. суперник не зміг підключитися)
      if (client.inMatch >= 0 && !isPlaying()) {
        const mm = t.matches.find((x) => x.id === client!.inMatch);
        if (!mm || mm.status === 'done') { client.inMatch = -1; waitingMatch = null; }
      }
      if (client.inMatch < 0 && !isPlaying()) renderClient();
      break;
    }
    case 'tmatch': {
      client.inMatch = m.mid;
      m.me.profile = sanitizeProfile(m.me.profile, defaultProfile(0));
      m.opp.profile = sanitizeProfile(m.opp.profile, defaultProfile(1));
      if (m.opp.bot) {
        const look: GameLook = {
          location: m.location, ball: sanitizeBall(m.ball),
          profiles: m.side === 0 ? [m.me.profile, m.opp.profile] : [m.opp.profile, m.me.profile],
        };
        beginMatch({ kind: 'bot', look, target: m.target, botSide: 1 - m.side, botDiff: m.opp.bot, tour: tourDoneHandler(m), onExit: backToTable });
      } else if (m.side === 0) {
        $('#tt-next').replaceChildren(el('p', { class: 'note' }, `З'єднання з ${m.opp.profile.name}…`));
        waitingMatch = m;
        tryStartPending();
      } else {
        $('#tt-next').replaceChildren(el('p', { class: 'note' }, `З'єднання з ${m.opp.profile.name}…`));
        connectToOpponent(m, 0);
      }
      break;
    }
  }
}

async function connectToOpponent(m: any, attempt: number) {
  if (!client) return;
  try {
    const link = await client.node.connect(m.opp.peer, { kind: 'match', mid: m.mid }, 15000);
    handshakeGuest(link, m.me.profile, (r) => startOnlineTourMatch(m, link, r.delay, r.early), (why) => tourMatchFailed(m, why));
  } catch (e: any) {
    if (attempt < 2) setTimeout(() => connectToOpponent(m, attempt + 1), 1500);
    else tourMatchFailed(m, errText(e.message));
  }
}

function renderClient() {
  if (!client || !client.t) return;
  const t = client.t;
  renderTable(t, [client.myId]);
  const next = $('#tt-next');
  next.innerHTML = '';
  if (isFinished(t)) {
    next.append(championBox(t));
  } else {
    const mine = t.matches.filter((x) => x.status !== 'done' && (x.a === client!.myId || x.b === client!.myId));
    const playing = t.matches.filter((x) => x.status === 'playing');
    const byId = new Map(t.players.map((p) => [p.id, p]));
    if (mine.length === 0) next.append(el('p', { class: 'note' }, 'Ваші матчі зіграно. Чекаємо на завершення інших.'));
    else next.append(el('p', { class: 'note' }, `Ваших матчів лишилося: ${mine.length}. Матч почнеться автоматично, щойно суперник звільниться.`));
    for (const x of playing) {
      const a = byId.get(x.a)!, b = byId.get(x.b)!;
      next.append(el('div', { class: 'vs' }, sackThumb(a.profile, 28), `${a.profile.name} ${x.live ? x.live[0] + ':' + x.live[1] : ''} ${b.profile.name}`, sackThumb(b.profile, 28)));
    }
  }
  showScreen('ttable');
}
