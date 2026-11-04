// З'єднання браузерів напряму через WebRTC (PeerJS).
// Сервер PeerJS потрібен лише щоб гравці знайшли один одного; ігрові дані йдуть напряму.

import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

export const PREFIX = 'mishkobol-v2-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');

export function randomCode(): string {
  let s = '';
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  for (let i = 0; i < 5; i++) s += ALPHABET[a[i] % ALPHABET.length];
  return s;
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export interface Link {
  send(msg: unknown): void;
  close(): void;
  onMessage: (msg: any) => void;
  onClose: (reason: string) => void;
  readonly meta: any;
}

function wrap(conn: DataConnection): Link {
  let closed = false;
  const link: Link = {
    meta: conn.metadata,
    send(msg) {
      if (!closed && conn.open) {
        if (DEBUG && (msg as any)?.t !== 'in') console.log('[net] send', JSON.stringify(msg).slice(0, 200));
        try { conn.send(msg); } catch (e) { if (DEBUG) console.log('[net] send err', e); }
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try { conn.close(); } catch { /* ignore */ }
    },
    onMessage: () => {},
    onClose: () => {},
  };
  conn.on('data', (d: any) => {
    if (DEBUG && d?.t !== 'in') console.log('[net] recv', JSON.stringify(d).slice(0, 200));
    link.onMessage(d);
  });
  const lost = (why: string) => {
    if (!closed) { closed = true; link.onClose(why); }
  };
  conn.on('close', () => lost('Суперник від\'єднався'));
  conn.on('error', () => lost('Помилка з\'єднання'));
  // ICE-з'єднання розірвалося (наприклад, зник інтернет)
  conn.peerConnection?.addEventListener?.('iceconnectionstatechange', () => {
    const st = conn.peerConnection?.iceConnectionState;
    if (st === 'failed' || st === 'closed') lost('З\'єднання розірвано');
  });
  return link;
}

export function errText(type: string): string {
  switch (type) {
    case 'peer-unavailable': return 'Кімнату не знайдено. Перевірте код — або гру вже закрили.';
    case 'network': return 'Немає з\'єднання із сервером. Перевірте інтернет.';
    case 'server-error': return 'Сервер з\'єднань недоступний. Спробуйте за хвилину.';
    case 'browser-incompatible': return 'Цей браузер не підтримує WebRTC.';
    case 'webrtc': return 'Не вдалося встановити пряме з\'єднання (WebRTC).';
    case 'unavailable-id': return 'Такий код уже зайнятий.';
    case 'timeout': return 'Не вдалося з\'єднатися за 20 секунд. Можливо, мережа блокує пряме з\'єднання — спробуйте іншу мережу (напр. мобільний інтернет).';
    default: return `Помилка з'єднання (${type}).`;
  }
}

/** Учасник мережі: має свій id, приймає вхідні з'єднання і може підключатися до інших. */
export class PeerNode {
  readonly peer: Peer;
  readonly id: string;
  onConnection: (link: Link) => void = (l) => l.close();
  onError: (text: string) => void = () => {};
  private destroyed = false;

  private constructor(peer: Peer, id: string) {
    this.peer = peer;
    this.id = id;
    peer.on('connection', (conn) => {
      const t = setTimeout(() => { if (!conn.open) conn.close(); }, 20000);
      conn.on('open', () => {
        clearTimeout(t);
        if (!this.destroyed) this.onConnection(wrap(conn));
      });
    });
    peer.on('error', (e: any) => {
      if (this.destroyed) return;
      // помилки конкретного вихідного з'єднання обробляються в connect()
      if (e.type === 'peer-unavailable') return;
      this.onError(errText(e.type));
    });
    peer.on('disconnected', () => {
      // втратили зв'язок лише із сервером-"сватом" — пробуємо відновити, прямі з'єднання живуть
      if (!this.destroyed) setTimeout(() => { try { peer.reconnect(); } catch { /* ignore */ } }, 1000);
    });
  }

  /** id === undefined — випадковий id від сервера. */
  static create(id?: string): Promise<PeerNode> {
    return new Promise((resolve, reject) => {
      const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      let done = false;
      const fail = (e: any) => {
        if (done) return;
        done = true;
        peer.destroy();
        reject(new Error(e?.type ?? 'network'));
      };
      const to = setTimeout(() => fail({ type: 'server-error' }), 15000);
      peer.once('open', (pid) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        resolve(new PeerNode(peer, pid));
      });
      peer.once('error', fail);
    });
  }

  connect(remoteId: string, meta: any, timeoutMs = 20000): Promise<Link> {
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(remoteId, { reliable: false, serialization: 'json', metadata: meta });
      let done = false;
      const fin = (err?: string) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        this.peer.off('error', onErr);
        if (err) { try { conn.close(); } catch { /* ignore */ } reject(new Error(err)); }
      };
      const onErr = (e: any) => {
        if (e.type === 'peer-unavailable' && String(e.message ?? '').includes(remoteId)) fin('peer-unavailable');
        else if (e.type === 'peer-unavailable') fin('peer-unavailable');
      };
      this.peer.on('error', onErr);
      const to = setTimeout(() => fin('timeout'), timeoutMs);
      conn.on('open', () => {
        if (done) return;
        fin();
        resolve(wrap(conn));
      });
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    setTimeout(() => this.peer.destroy(), 300);
  }
}

/** Створює вузол із кодом кімнати (з повтором, якщо код зайнятий). */
export async function createRoomNode(): Promise<{ node: PeerNode; code: string }> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      const node = await PeerNode.create(PREFIX + code);
      return { node, code };
    } catch (e: any) {
      if (e.message !== 'unavailable-id') throw e;
    }
  }
  throw new Error('unavailable-id');
}
