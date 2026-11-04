// З'єднання двох браузерів напряму через WebRTC (PeerJS).
// Сервер PeerJS потрібен лише для того, щоб гравці знайшли один одного;
// ігрові дані йдуть напряму між браузерами.

import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

const PREFIX = 'mishkobol-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

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
}

export interface ConnectCallbacks {
  onStatus(text: string): void;
  onRoom?(code: string): void;
  onLink(link: Link): void;
  onError(text: string): void;
}

const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');

function wrap(peer: Peer, conn: DataConnection): Link {
  let closed = false;
  if (DEBUG) console.log('[net] link', conn.serialization, conn.reliable, conn.open);
  const link: Link = {
    send(msg) {
      if (!closed && conn.open) {
        if (DEBUG && (msg as any)?.t !== 'in') console.log('[net] send', JSON.stringify(msg));
        try { conn.send(msg); } catch (e) { if (DEBUG) console.log('[net] send err', e); }
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try { conn.close(); } catch { /* ignore */ }
      setTimeout(() => peer.destroy(), 200);
    },
    onMessage: () => {},
    onClose: () => {},
  };
  conn.on('data', (d: any) => {
    if (DEBUG && d?.t !== 'in') console.log('[net] recv', JSON.stringify(d));
    link.onMessage(d);
  });
  conn.on('close', () => {
    if (!closed) { closed = true; link.onClose('Суперник від\'єднався'); peer.destroy(); }
  });
  conn.on('error', () => {
    if (!closed) { closed = true; link.onClose('Помилка з\'єднання'); peer.destroy(); }
  });
  peer.on('disconnected', () => {
    // втрачено зв'язок лише із сервером-"сватом" — пряме з'єднання ще працює
  });
  return link;
}

function errText(type: string): string {
  switch (type) {
    case 'peer-unavailable': return 'Кімнату не знайдено. Перевірте код — або суперник закрив гру.';
    case 'network': return 'Немає з\'єднання із сервером. Перевірте інтернет.';
    case 'server-error': return 'Сервер з\'єднань недоступний. Спробуйте за хвилину.';
    case 'browser-incompatible': return 'Цей браузер не підтримує WebRTC.';
    case 'webrtc': return 'Не вдалося встановити пряме з\'єднання (WebRTC).';
    default: return `Помилка з'єднання (${type}).`;
  }
}

/** Створює кімнату і чекає суперника. Повертає функцію скасування. */
export function hostRoom(cb: ConnectCallbacks, attempt = 0): () => void {
  const code = randomCode();
  let cancelled = false;
  let inner: (() => void) | null = null;
  const peer = new Peer(PREFIX + code, { debug: 0 });
  let linked = false;
  cb.onStatus('Підключення до сервера…');
  peer.on('open', () => {
    if (cancelled) return;
    cb.onRoom?.(code);
    cb.onStatus('Очікуємо суперника. Надішліть йому код або посилання.');
  });
  peer.on('connection', (conn) => {
    if (linked || cancelled) { conn.close(); return; }
    linked = true;
    cb.onStatus('Суперник підключається…');
    const t = setTimeout(() => {
      if (!conn.open) {
        linked = false;
        conn.close();
        cb.onStatus('Не вдалося з\'єднатися напряму. Очікуємо ще…');
      }
    }, 15000);
    conn.on('open', () => {
      clearTimeout(t);
      if (cancelled) return;
      cb.onLink(wrap(peer, conn));
    });
  });
  peer.on('error', (e: any) => {
    if (cancelled) return;
    if (e.type === 'unavailable-id' && attempt < 5) {
      peer.destroy();
      inner = hostRoom(cb, attempt + 1);
      return;
    }
    if (linked) return;
    cb.onError(errText(e.type));
  });
  return () => {
    cancelled = true;
    inner?.();
    if (!linked) peer.destroy();
  };
}

export function joinRoom(code: string, cb: ConnectCallbacks): () => void {
  let cancelled = false;
  let done = false;
  const peer = new Peer({ debug: 0 });
  cb.onStatus('Підключення до сервера…');
  const timeout = setTimeout(() => {
    if (!done && !cancelled) {
      cb.onError('Не вдалося з\'єднатися з суперником за 20 секунд. Можливо, мережа блокує пряме з\'єднання — спробуйте іншу мережу (напр. мобільний інтернет).');
      peer.destroy();
    }
  }, 20000);
  peer.on('open', () => {
    if (cancelled) return;
    cb.onStatus('Шукаємо кімнату ' + code + '…');
    const conn = peer.connect(PREFIX + code, { reliable: false, serialization: 'json' });
    conn.on('open', () => {
      if (cancelled) return;
      done = true;
      clearTimeout(timeout);
      cb.onLink(wrap(peer, conn));
    });
  });
  peer.on('error', (e: any) => {
    if (cancelled || done) return;
    clearTimeout(timeout);
    cb.onError(errText(e.type));
    peer.destroy();
  });
  return () => {
    cancelled = true;
    clearTimeout(timeout);
    if (!done) peer.destroy();
  };
}
