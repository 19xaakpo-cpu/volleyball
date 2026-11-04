// Редактори вигляду мішка (профілю) і м'яча — у модальному вікні з живим переглядом.

import {
  ACCENT_COLORS, BALL_LOGOS, BALL_PATTERNS, LOGOS, PATTERNS, REACTIONS, SACK_COLORS, reactionById,
} from '../cosmetics.ts';
import type { BallDesign, Profile } from '../cosmetics.ts';
import { drawBall, drawSack } from '../draw.ts';
import type { Face } from '../draw.ts';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) (e as any)[k] = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

function swatches(colors: string[], get: () => string, set: (c: string) => void) {
  const wrap = el('div', { class: 'swatches' });
  const render = () => {
    wrap.innerHTML = '';
    for (const c of colors) {
      const b = el('button', { class: 'sw' + (get() === c ? ' on' : ''), title: c, onclick: () => { set(c); render(); } });
      b.style.background = c;
      wrap.append(b);
    }
    const custom = el('input', { type: 'color', value: get(), title: 'Свій колір' }) as HTMLInputElement;
    custom.oninput = () => { set(custom.value); };
    custom.onchange = () => render();
    wrap.append(custom);
  };
  render();
  return wrap;
}

function chips(items: { id: string; name: string }[], get: () => string, set: (v: string) => void) {
  const wrap = el('div', { class: 'chips' });
  const render = () => {
    wrap.innerHTML = '';
    for (const it of items) {
      wrap.append(el('button', { class: 'chip' + (get() === it.id ? ' on' : ''), onclick: () => { set(it.id); render(); } }, it.name));
    }
  };
  render();
  return wrap;
}

function emojiGrid(items: string[], get: () => string, set: (v: string) => void) {
  const wrap = el('div', { class: 'emojis' });
  const render = () => {
    wrap.innerHTML = '';
    for (const it of items) {
      wrap.append(el('button', { class: 'emo' + (get() === it ? ' on' : ''), onclick: () => { set(it); render(); } }, it || '∅'));
    }
  };
  render();
  return wrap;
}

let stopPreview: (() => void) | null = null;

function openModal(title: string, body: HTMLElement, onDone: () => void) {
  const modal = $('#editor');
  const content = $('#editor-content');
  $('#editor-title').textContent = title;
  content.innerHTML = '';
  content.append(body);
  modal.classList.remove('hidden');
  ($('#editor-done') as HTMLButtonElement).onclick = () => {
    stopPreview?.();
    stopPreview = null;
    modal.classList.add('hidden');
    onDone();
  };
}

const MOOD: Record<string, Face> = {
  hop: 'happy', dance: 'happy', spin: 'happy', flex: 'happy', fireworks: 'happy', laugh: 'laugh', cool: 'cool',
  kiss: 'kiss', cry: 'sad', facepalm: 'sad', angry: 'angry', revenge: 'angry', faint: 'dizzy',
};

/** Редагує профіль на місці (мутує об'єкт). */
export function editProfile(pr: Profile, title: string, onDone: () => void) {
  const canvas = el('canvas', { class: 'preview', width: '520', height: '300' }) as HTMLCanvasElement;
  let previewReaction = '';
  let previewT = 0;
  let mx = 400, my = 100;
  canvas.onpointermove = (e) => {
    const r = canvas.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width) * 260;
    my = ((e.clientY - r.top) / r.height) * 150;
  };

  const name = el('input', { value: pr.name, maxlength: '16', class: 'name-input' }) as HTMLInputElement;
  name.oninput = () => { pr.name = name.value.trim() || pr.name; };

  const react = (key: 'winPoint' | 'losePoint' | 'winGame' | 'loseGame', label: string) => {
    const sel = el('select') as HTMLSelectElement;
    for (const r of REACTIONS) sel.append(el('option', { value: r.id }, `${r.emoji} ${r.name}`));
    sel.value = pr[key];
    sel.onchange = () => { pr[key] = sel.value; previewReaction = sel.value; previewT = 0; };
    const play = el('button', { class: 'mini', title: 'Показати', onclick: () => { previewReaction = pr[key]; previewT = 0; } }, '▶');
    return el('label', { class: 'react-row' }, el('span', {}, label), sel, play);
  };

  const body = el('div', { class: 'editor' },
    canvas,
    el('div', { class: 'field' }, el('span', {}, 'Ім\'я'), name),
    el('div', { class: 'field' }, el('span', {}, 'Колір мішка'), swatches(SACK_COLORS, () => pr.color, (c) => { pr.color = c; })),
    el('div', { class: 'field' }, el('span', {}, 'Другий колір'), swatches(ACCENT_COLORS, () => pr.accent, (c) => { pr.accent = c; })),
    el('div', { class: 'field' }, el('span', {}, 'Візерунок'), chips(PATTERNS, () => pr.pattern, (v) => { pr.pattern = v; })),
    el('div', { class: 'field' }, el('span', {}, 'Лого'), emojiGrid(LOGOS, () => pr.logo, (v) => { pr.logo = v; })),
    el('h3', {}, 'Реакції'),
    react('winPoint', 'Виграв очко'),
    react('losePoint', 'Програв очко'),
    react('winGame', 'Виграв гру'),
    react('loseGame', 'Програв гру'),
  );

  const g = canvas.getContext('2d')!;
  let raf = 0;
  const loop = () => {
    g.setTransform(2, 0, 0, 2, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, 150);
    grd.addColorStop(0, '#2a3a74');
    grd.addColorStop(1, '#c86b78');
    g.fillStyle = grd;
    g.fillRect(0, 0, 260, 150);
    g.fillStyle = '#e8c88a';
    g.fillRect(0, 130, 260, 20);
    let dy = 0, rot = 0, scx = 1, scy = 1, dx = 0;
    let mood: Face = 'normal';
    const r = previewReaction ? reactionById(previewReaction) : null;
    if (r && previewT < 120) {
      const t = ++previewT;
      mood = MOOD[r.id] ?? 'normal';
      switch (r.anim) {
        case 'hop': dy = -Math.abs(Math.sin(t * 0.2)) * 20; break;
        case 'wiggle': rot = Math.sin(t * 0.35) * 0.22; dx = Math.sin(t * 0.35) * 5; break;
        case 'spin': rot = (t * 0.25) % (Math.PI * 2); break;
        case 'shake': dx = Math.sin(t * 1.6) * 3; break;
        case 'flat': scy = Math.max(0.45, 1 - t * 0.04); scx = 1 + (1 - scy) * 0.6; break;
        case 'droop': scy = 0.86; scx = 1.06; break;
        case 'puff': { const q = 1 + Math.abs(Math.sin(t * 0.15)) * 0.12; scx = q; scy = q; break; }
      }
    }
    g.save();
    g.translate(110 + dx, 130 + dy);
    if (rot) { g.translate(0, -29); g.rotate(rot); g.translate(0, 29); }
    g.scale(scx, scy);
    drawSack(g, pr, 0, 0, 52, 58, { face: 1, lookX: mx - 110, lookY: my - 130, mood,
      tint: r && (r.id === 'angry' || r.id === 'revenge') && previewT < 120 ? 'rgba(255,40,20,0.22)' : undefined });
    g.restore();
    if (r && previewT < 120 && (r.emoji || r.text)) {
      g.font = '700 13px system-ui, sans-serif';
      const label = `${r.emoji} ${r.text}`;
      const tw = g.measureText(label).width + 16;
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.roundRect(150, 20, tw, 24, 10);
      g.fill();
      g.fillStyle = '#222';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(label, 158, 32);
    }
    g.fillStyle = '#fff';
    g.font = '800 15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(pr.name, 110, 16);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  stopPreview = () => cancelAnimationFrame(raf);
  openModal(title, body, onDone);
}

/** Редагує дизайн м'яча на місці. */
export function editBall(b: BallDesign, onDone: () => void) {
  const canvas = el('canvas', { class: 'preview', width: '520', height: '200' }) as HTMLCanvasElement;
  const color = (key: 'c1' | 'c2' | 'c3', label: string) => {
    const inp = el('input', { type: 'color', value: b[key] }) as HTMLInputElement;
    inp.oninput = () => { b[key] = inp.value; };
    return el('label', { class: 'color-field' }, label, inp);
  };
  const body = el('div', { class: 'editor' },
    canvas,
    el('div', { class: 'field' }, el('span', {}, 'Візерунок'), chips(BALL_PATTERNS, () => b.pattern, (v) => { b.pattern = v; })),
    el('div', { class: 'field row3' }, color('c1', 'Основний'), color('c2', 'Другий'), color('c3', 'Третій')),
    el('div', { class: 'field' }, el('span', {}, 'Лого'), emojiGrid(BALL_LOGOS, () => b.logo, (v) => { b.logo = v; })),
  );
  const g = canvas.getContext('2d')!;
  let raf = 0, a = 0;
  const loop = () => {
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.fillStyle = '#1d2747';
    g.fillRect(0, 0, 260, 100);
    a += 0.03;
    drawBall(g, b, 80, 50, 34, a);
    drawBall(g, b, 180, 50, 34, 0);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  stopPreview = () => cancelAnimationFrame(raf);
  openModal('Дизайн м\'яча', body, onDone);
}

/** Маленький значок мішка (для списків і таблиць). */
export function sackThumb(pr: Profile, size = 36): HTMLCanvasElement {
  const c = el('canvas', { width: String(size * 2), height: String(size * 2), class: 'thumb' }) as HTMLCanvasElement;
  c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d')!;
  const k = (size * 2) / 130;
  g.scale(k, k);
  drawSack(g, pr, 65, 118, 52, 58, { face: 1, lookX: 30, lookY: -20, mood: 'normal' });
  return c;
}
