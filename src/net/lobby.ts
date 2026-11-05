// Список відкритих ігор без власного сервера.
// Один із браузерів, у яких відкрита гра, бере на себе роль "табла оголошень" (peer id LOBBY_ID):
// хости кімнат реєструють там свої ігри, а всі інші отримують список. Якщо цей браузер закриють,
// роль автоматично перебирає хтось інший, а хости повторно оголошують свої кімнати.

import { PREFIX, PeerNode } from './peer.ts';
import type { Link } from './peer.ts';

const LOBBY_ID = PREFIX + 'lobby';
const ENTRY_TTL = 30000; // оголошення живе 30 с без оновлення
const REFRESH = 10000;

export interface RoomInfo {
  code: string;
  kind: 'room' | 'tour';
  host: string;
  location: string;
  target: number;
  players: number; // 1 — чекає суперника, 2 — грають
  maxPlayers: number;
  watchers: number;
  ts?: number;
}

function clean(x: any): RoomInfo | null {
  if (!x || typeof x.code !== 'string' || !/^[A-Z0-9]{5}$/.test(x.code)) return null;
  const n = (v: any, d: number, max: number) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : d);
  return {
    code: x.code,
    kind: x.kind === 'tour' ? 'tour' : 'room',
    host: String(x.host ?? '').slice(0, 16) || 'Гравець',
    location: String(x.location ?? 'beach').slice(0, 20),
    target: n(x.target, 15, 99),
    players: n(x.players, 1, 8),
    maxPlayers: n(x.maxPlayers, 2, 8),
    watchers: n(x.watchers, 0, 99),
  };
}

class Lobby {
  private node: PeerNode | null = null;
  private registry: Map<string, RoomInfo> | null = null; // якщо ми — табло
  private clients = new Set<Link>();
  private link: Link | null = null; // наш зв'язок із табло
  private mine = new Map<string, RoomInfo>(); // наші оголошення
  private rooms: RoomInfo[] = [];
  private listeners = new Set<(r: RoomInfo[]) => void>();
  private starting = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Підписатися на зміни списку. Повертає функцію відписки. */
  subscribe(fn: (r: RoomInfo[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.rooms);
    this.start();
    return () => this.listeners.delete(fn);
  }

  announce(info: RoomInfo) {
    this.mine.set(info.code, info);
    this.start();
    this.push(info);
  }

  remove(code: string) {
    this.mine.delete(code);
    if (this.registry) { this.registry.delete(code); this.broadcast(); }
    else this.link?.send({ t: 'lremove', code });
  }

  private push(info: RoomInfo) {
    if (this.registry) { this.registry.set(info.code, { ...info, ts: Date.now() }); this.broadcast(); }
    else this.link?.send({ t: 'lannounce', info });
  }

  private emit(list: RoomInfo[]) {
    this.rooms = list;
    for (const fn of this.listeners) fn(list);
  }

  private start() {
    if (this.starting || this.stopped) return;
    this.starting = true;
    if (!this.timer) {
      this.timer = setInterval(() => {
        for (const info of this.mine.values()) this.push(info);
        if (this.registry) this.expire();
      }, REFRESH);
    }
    void this.connect();
  }

  private async connect() {
    try {
      if (!this.node) this.node = await PeerNode.create();
      try {
        const link = await this.node.connect(LOBBY_ID, { kind: 'lobby' }, 12000);
        this.attach(link);
        return;
      } catch (e: any) {
        if (e.message !== 'peer-unavailable' && e.message !== 'timeout') throw e;
      }
      // табла немає — стаємо ним
      try {
        const reg = await PeerNode.create(LOBBY_ID);
        this.becomeRegistry(reg);
        return;
      } catch (e: any) {
        if (e.message !== 'unavailable-id') throw e;
        // хтось щойно став табло — підключаємось до нього
        const link = await this.node.connect(LOBBY_ID, { kind: 'lobby' }, 12000);
        this.attach(link);
      }
    } catch {
      // спробуємо пізніше
      this.starting = false;
      setTimeout(() => this.start(), 5000 + Math.random() * 3000);
    }
  }

  private attach(link: Link) {
    this.link = link;
    this.starting = false;
    link.onMessage = (m: any) => {
      if (m?.t === 'llist' && Array.isArray(m.rooms)) this.emit(m.rooms.map(clean).filter(Boolean) as RoomInfo[]);
    };
    link.onClose = () => {
      this.link = null;
      // табло зникло — через випадкову паузу хтось із нас його перебере
      setTimeout(() => this.start(), 500 + Math.random() * 2500);
    };
    for (const info of this.mine.values()) this.push(info);
  }

  private becomeRegistry(reg: PeerNode) {
    this.registry = new Map();
    this.starting = false;
    for (const info of this.mine.values()) this.registry.set(info.code, { ...info, ts: Date.now() });
    reg.onConnection = (link) => {
      if (link.meta?.kind !== 'lobby') { link.close(); return; }
      this.clients.add(link);
      link.onMessage = (m: any) => {
        if (m?.t === 'lannounce') {
          const info = clean(m.info);
          if (info && this.registry) { this.registry.set(info.code, { ...info, ts: Date.now() }); this.broadcast(); }
        } else if (m?.t === 'lremove' && typeof m.code === 'string') {
          this.registry?.delete(m.code);
          this.broadcast();
        }
      };
      link.onClose = () => this.clients.delete(link);
      link.send({ t: 'llist', rooms: this.list() });
    };
    this.broadcast();
  }

  private expire() {
    if (!this.registry) return;
    const now = Date.now();
    let changed = false;
    for (const [k, v] of this.registry) if (now - (v.ts ?? 0) > ENTRY_TTL) { this.registry.delete(k); changed = true; }
    if (changed) this.broadcast();
  }

  private list(): RoomInfo[] {
    return [...(this.registry?.values() ?? [])].map(({ ts: _ts, ...r }) => r);
  }

  private broadcast() {
    const rooms = this.list();
    this.emit(rooms);
    for (const c of this.clients) c.send({ t: 'llist', rooms });
  }
}

export const lobby = new Lobby();
