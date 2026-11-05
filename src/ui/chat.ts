// Текстовий чат для мережевої гри (гравці й глядачі).

import { $, el } from './dom.ts';

export interface ChatMsg {
  from: string;
  text: string;
  role: 'p' | 'w'; // гравець / глядач
}

let onSend: ((text: string) => void) | null = null;
let lastSent = 0;

export function sanitizeChat(m: any): ChatMsg | null {
  if (!m || typeof m.text !== 'string') return null;
  const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!text) return null;
  return { from: String(m.from ?? '?').slice(0, 16), text, role: m.role === 'w' ? 'w' : 'p' };
}

/** Увімкнути чат (send — куди надсилати власні повідомлення) або вимкнути (null). */
export function setChat(send: ((text: string) => void) | null) {
  onSend = send;
  $('#chat').classList.toggle('hidden', !send);
  $('#btn-chat').classList.toggle('hidden', !send);
  if (!send) {
    $('#chat-log').innerHTML = '';
    closeInput();
  }
}

export function chatEnabled() {
  return onSend !== null;
}

export function addChat(m: ChatMsg) {
  const log = $('#chat-log');
  const row = el('div', { class: 'chat-row' + (m.role === 'w' ? ' watcher' : '') },
    el('b', {}, (m.role === 'w' ? '👁 ' : '') + m.from + ': '), m.text);
  log.append(row);
  while (log.children.length > 8) log.firstChild?.remove();
  // повідомлення поступово зникають
  setTimeout(() => row.classList.add('old'), 12000);
}

export function addSystem(text: string) {
  const log = $('#chat-log');
  const row = el('div', { class: 'chat-row system' }, text);
  log.append(row);
  while (log.children.length > 8) log.firstChild?.remove();
  setTimeout(() => row.classList.add('old'), 8000);
}

export function openInput() {
  if (!onSend) return;
  $('#chat-form').classList.remove('hidden');
  const inp = $<HTMLInputElement>('#chat-input');
  inp.focus();
}

function closeInput() {
  $('#chat-form').classList.add('hidden');
  const inp = $<HTMLInputElement>('#chat-input');
  inp.value = '';
  inp.blur();
}

export function initChat() {
  const inp = $<HTMLInputElement>('#chat-input');
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inp.value.replace(/\s+/g, ' ').trim().slice(0, 140);
    if (text && onSend && performance.now() - lastSent > 700) {
      lastSent = performance.now();
      onSend(text);
    }
    closeInput();
  });
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeInput();
  });
  $('#btn-chat').addEventListener('click', () => {
    if ($('#chat-form').classList.contains('hidden')) openInput();
    else closeInput();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && onSend && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      openInput();
    }
  });
}
