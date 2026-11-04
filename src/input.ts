import { IN_CROUCH, IN_JUMP, IN_LEFT, IN_RIGHT } from './sim/game.ts';

const keys = new Set<string>();

const P1: Record<string, number> = { KeyA: IN_LEFT, KeyD: IN_RIGHT, KeyW: IN_JUMP, KeyS: IN_CROUCH, Space: IN_JUMP };
const P2: Record<string, number> = { ArrowLeft: IN_LEFT, ArrowRight: IN_RIGHT, ArrowUp: IN_JUMP, ArrowDown: IN_CROUCH };

const touchBits = [0, 0];

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
  // протилежні напрямки гасять один одного
  if ((b & (IN_LEFT | IN_RIGHT)) === (IN_LEFT | IN_RIGHT)) b &= ~(IN_LEFT | IN_RIGHT);
  return b;
}

export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/** Будує сенсорні кнопки. two = двоє гравців на одному екрані. */
export function buildTouch(root: HTMLElement, two: boolean) {
  root.innerHTML = '';
  root.classList.toggle('two', two);
  touchBits[0] = touchBits[1] = 0;
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
