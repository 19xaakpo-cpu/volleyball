import { IN_CROUCH, IN_JUMP, IN_LEFT, IN_RIGHT } from './sim/game.ts';

const keys = new Set<string>();

const P1: Record<string, number> = { KeyA: IN_LEFT, KeyD: IN_RIGHT, KeyW: IN_JUMP, KeyS: IN_CROUCH, Space: IN_JUMP };
const P2: Record<string, number> = { ArrowLeft: IN_LEFT, ArrowRight: IN_RIGHT, ArrowUp: IN_JUMP, ArrowDown: IN_CROUCH };

const touchBits = [0, 0];
/** Синтезовані послідовності для сенсорних жестів (по одному кадру): b = (b & ~mask) | or */
const queue: { or: number; mask: number }[] = [];

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (P1[e.code] !== undefined || P2[e.code] !== undefined) e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    touchBits[0] = touchBits[1] = 0;
    queue.length = 0;
  });
}

function bitsFrom(map: Record<string, number>): number {
  let b = 0;
  for (const k in map) if (keys.has(k)) b |= map[k];
  return b;
}

/** Введення гравця: which = 0 (WASD), 1 (стрілки), 'any' — обидва набори разом */
export function readInput(which: 0 | 1 | 'any'): number {
  let b: number;
  if (which === 'any') b = bitsFrom(P1) | bitsFrom(P2) | touchBits[0] | touchBits[1];
  else b = bitsFrom(which === 0 ? P1 : P2) | touchBits[which];
  if (which !== 1 && queue.length) {
    const q = queue.shift()!;
    b = (b & ~q.mask) | q.or;
  }
  // протилежні напрямки гасять один одного
  if ((b & (IN_LEFT | IN_RIGHT)) === (IN_LEFT | IN_RIGHT)) b &= ~(IN_LEFT | IN_RIGHT);
  return b;
}

export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/**
 * Сенсорне керування для одного гравця — великі зони замість кнопок:
 * ліва половина — тягни палець вліво/вправо (швидкий змах — ривок);
 * права — верх: стрибок, низ: присісти; провести знизу вгору — суперстрибок.
 */
function buildZones(root: HTMLElement) {
  const LR = IN_LEFT | IN_RIGHT;
  // --- зона руху ---
  const move = document.createElement('div');
  move.className = 'tzone move';
  move.innerHTML = '<div class="zhint">◀ тягни ▶<br><small>швидкий змах — ривок</small></div><div class="knob hidden"></div>';
  const knob = move.querySelector('.knob') as HTMLElement;
  let mid = -1, x0 = 0, xDown = 0, tDown = 0, flicked = false;
  const setDir = (dir: number) => {
    touchBits[0] = (touchBits[0] & ~LR) | (dir < 0 ? IN_LEFT : dir > 0 ? IN_RIGHT : 0);
  };
  move.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (mid !== -1) return;
    mid = e.pointerId;
    move.setPointerCapture(e.pointerId);
    x0 = xDown = e.clientX;
    tDown = performance.now();
    flicked = false;
    const r = move.getBoundingClientRect();
    knob.style.left = `${e.clientX - r.left}px`;
    knob.style.top = `${e.clientY - r.top}px`;
    knob.classList.remove('hidden');
    move.classList.add('on');
  });
  move.addEventListener('pointermove', (e) => {
    if (e.pointerId !== mid) return;
    const x = e.clientX;
    // "плаваючий" центр: розворот у інший бік спрацьовує одразу
    if (x - x0 > 55) x0 = x - 55;
    if (x - x0 < -55) x0 = x + 55;
    const dx = x - x0;
    const dir = dx > 12 ? 1 : dx < -12 ? -1 : 0;
    setDir(dir);
    knob.style.transform = `translate(-50%, -50%) translateX(${Math.max(-40, Math.min(40, dx))}px)`;
    // швидкий змах — ривок (друге "натискання" стрілки синтезуємо)
    if (!flicked && dir !== 0 && performance.now() - tDown < 200 && Math.abs(x - xDown) > 45) {
      flicked = true;
      const bit = dir < 0 ? IN_LEFT : IN_RIGHT;
      queue.push({ or: 0, mask: LR }, { or: bit, mask: LR });
    }
  });
  const moveUp = (e: PointerEvent) => {
    if (e.pointerId !== mid) return;
    mid = -1;
    setDir(0);
    knob.classList.add('hidden');
    knob.style.transform = 'translate(-50%, -50%)';
    move.classList.remove('on');
  };
  move.addEventListener('pointerup', moveUp);
  move.addEventListener('pointercancel', moveUp);

  // --- зона дій ---
  const act = document.createElement('div');
  act.className = 'tzone act';
  act.innerHTML = '<div class="half top"><span>⤒ стрибок</span></div><div class="half bottom"><span>⤓ присісти</span><small>провести ↓ потім ↑ — суперстрибок</small></div>';
  const top = act.querySelector('.top') as HTMLElement, bottom = act.querySelector('.bottom') as HTMLElement;
  const actPtr = new Map<number, number>(); // pointer -> біт
  const updAct = () => {
    let bits = 0;
    for (const v of actPtr.values()) bits |= v;
    touchBits[0] = (touchBits[0] & ~(IN_JUMP | IN_CROUCH)) | bits;
    top.classList.toggle('on', (bits & IN_JUMP) !== 0);
    bottom.classList.toggle('on', (bits & IN_CROUCH) !== 0);
  };
  const bitAt = (y: number) => {
    const r = act.getBoundingClientRect();
    return y < r.top + r.height * 0.5 ? IN_JUMP : IN_CROUCH;
  };
  act.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    act.setPointerCapture(e.pointerId);
    actPtr.set(e.pointerId, bitAt(e.clientY));
    updAct();
  });
  act.addEventListener('pointermove', (e) => {
    if (!actPtr.has(e.pointerId)) return;
    const b = bitAt(e.clientY);
    if (b !== actPtr.get(e.pointerId)) { actPtr.set(e.pointerId, b); updAct(); }
  });
  const actUp = (e: PointerEvent) => { if (actPtr.delete(e.pointerId)) updAct(); };
  act.addEventListener('pointerup', actUp);
  act.addEventListener('pointercancel', actUp);
  for (const z of [move, act]) z.addEventListener('contextmenu', (e) => e.preventDefault());
  root.append(move, act);
}

/** Будує сенсорне керування. two = двоє гравців на одному екрані (тоді — кнопки). */
export function buildTouch(root: HTMLElement, two: boolean) {
  root.innerHTML = '';
  root.classList.toggle('two', two);
  touchBits[0] = touchBits[1] = 0;
  queue.length = 0;
  if (!two) { buildZones(root); return; }
  const mk = (player: number, side: 'left' | 'right', buttons: [string, number][]) => {
    const g = document.createElement('div');
    g.className = `tgroup ${side} ${buttons.length === 4 ? 'quad' : 'row2'}`;
    for (const [label, bit] of buttons) {
      const b = document.createElement('div');
      b.className = 'tbtn';
      b.textContent = label;
      const pointers = new Set<number>();
      const upd = () => {
        if (pointers.size > 0) touchBits[player] |= bit;
        else touchBits[player] &= ~bit;
        b.classList.toggle('on', pointers.size > 0);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.releasePointerCapture?.(e.pointerId);
        pointers.add(e.pointerId);
        upd();
      });
      // палець може "зісковзнути" на сусідню кнопку
      b.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse' && e.buttons) { pointers.add(e.pointerId); upd(); }
      });
      const off = (e: PointerEvent) => { pointers.delete(e.pointerId); upd(); };
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      g.appendChild(b);
    }
    root.appendChild(g);
  };
  if (two) {
    mk(0, 'left', [['⤒', IN_JUMP], ['⤓', IN_CROUCH], ['◀', IN_LEFT], ['▶', IN_RIGHT]]);
    mk(1, 'right', [['⤒', IN_JUMP], ['⤓', IN_CROUCH], ['◀', IN_LEFT], ['▶', IN_RIGHT]]);
  } else {
    mk(0, 'left', [['◀', IN_LEFT], ['▶', IN_RIGHT]]);
    mk(0, 'right', [['⤓', IN_CROUCH], ['⤒', IN_JUMP]]);
  }
}
