// Детермінована симуляція гри.
// ВАЖЛИВО: тут дозволені лише + - * / Math.sqrt Math.abs Math.min Math.max,
// без Math.random, Math.sin/cos/pow, Date тощо — щоб на всіх пристроях
// однакові вхідні дані давали бітово однаковий результат (потрібно для rollback).

export const W = 960;
export const H = 540;
export const GROUND = 490;
export const NET_X = W / 2;
export const NET_HALF = 6;
export const NET_TOP = GROUND - 130;

export const BALL_R = 17;
const BALL_G = 0.3;
const BALL_MAX_SPEED = 16.5;
const WALL_E = 0.96;
const NET_E = 0.7;
const SUBSTEPS = 2;

export const SACK_RX = 52;
export const SACK_RY = 58;
export const CROUCH_RX = 66;
export const CROUCH_RY = 32;
const SACK_SPEED = 6.5;
const CROUCH_SPEED = 3.5;
const SACK_G = 0.85;
const JUMP_V = 15.5;
const HIT_E = 0.75;
const MIN_POP = 7.5;
const HIT_COOLDOWN = 8;

export const MAX_TOUCHES = 3;
const SERVE_FREEZE = 45;
const POINT_PAUSE = 80;
const OVER_LOCK = 60;

// біти введення
export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_JUMP = 4;
export const IN_CROUCH = 8;

export const PH_SERVE = 0;
export const PH_RALLY = 1;
export const PH_POINT = 2;
export const PH_OVER = 3;

export const FAULT_NONE = 0;
export const FAULT_FLOOR = 1;
export const FAULT_TOUCHES = 2;

export interface Sack {
  x: number;
  y: number; // лінія "ніг" (низ мішка)
  vx: number;
  vy: number;
  crouch: boolean;
  cooldown: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GameState {
  frame: number;
  phase: number;
  timer: number;
  players: [Sack, Sack];
  ball: Ball;
  score: [number, number];
  server: number;
  touchSide: number; // -1 — ніхто
  touches: number;
  ballSide: number;
  target: number;
  lastPointBy: number;
  fault: number;
  faultBy: number;
  ready: [boolean, boolean];
  winner: number;
}

export type GameEvent =
  | { type: 'hit'; p: number; speed: number; x: number; y: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'net'; x: number; y: number }
  | { type: 'floor'; x: number; y: number }
  | { type: 'point'; winner: number; fault: number }
  | { type: 'serve' }
  | { type: 'jump'; p: number }
  | { type: 'over'; winner: number };

export function homeX(p: number): number {
  return p === 0 ? W * 0.25 : W * 0.75;
}

function newSack(p: number): Sack {
  return { x: homeX(p), y: GROUND, vx: 0, vy: 0, crouch: false, cooldown: 0 };
}

export function createGame(target = 15, server = 0): GameState {
  const s: GameState = {
    frame: 0,
    phase: PH_SERVE,
    timer: SERVE_FREEZE,
    players: [newSack(0), newSack(1)],
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    score: [0, 0],
    server,
    touchSide: -1,
    touches: 0,
    ballSide: server,
    target,
    lastPointBy: -1,
    fault: FAULT_NONE,
    faultBy: -1,
    ready: [false, false],
    winner: -1,
  };
  setupServe(s);
  return s;
}

function setupServe(s: GameState) {
  s.phase = PH_SERVE;
  s.timer = SERVE_FREEZE;
  for (let p = 0; p < 2; p++) {
    const k = s.players[p];
    k.x = homeX(p);
    k.y = GROUND;
    k.vx = 0;
    k.vy = 0;
    k.crouch = false;
    k.cooldown = 0;
  }
  s.ball.x = homeX(s.server);
  s.ball.y = 170;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.touchSide = -1;
  s.touches = 0;
  s.ballSide = s.server;
  s.fault = FAULT_NONE;
  s.faultBy = -1;
}

export function cloneState(s: GameState): GameState {
  const a = s.players[0];
  const b = s.players[1];
  return {
    frame: s.frame,
    phase: s.phase,
    timer: s.timer,
    players: [
      { x: a.x, y: a.y, vx: a.vx, vy: a.vy, crouch: a.crouch, cooldown: a.cooldown },
      { x: b.x, y: b.y, vx: b.vx, vy: b.vy, crouch: b.crouch, cooldown: b.cooldown },
    ],
    ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy },
    score: [s.score[0], s.score[1]],
    server: s.server,
    touchSide: s.touchSide,
    touches: s.touches,
    ballSide: s.ballSide,
    target: s.target,
    lastPointBy: s.lastPointBy,
    fault: s.fault,
    faultBy: s.faultBy,
    ready: [s.ready[0], s.ready[1]],
    winner: s.winner,
  };
}

// Хеш стану (FNV-1a над бітами float64) — для перевірки розсинхронізації.
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
export function hashState(s: GameState): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    f64[0] = n;
    for (let i = 0; i < 2; i++) {
      h ^= u32[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  mix(s.frame); mix(s.phase); mix(s.timer);
  for (const k of s.players) {
    mix(k.x); mix(k.y); mix(k.vx); mix(k.vy); mix(k.crouch ? 1 : 0); mix(k.cooldown);
  }
  mix(s.ball.x); mix(s.ball.y); mix(s.ball.vx); mix(s.ball.vy);
  mix(s.score[0]); mix(s.score[1]); mix(s.server); mix(s.touchSide); mix(s.touches);
  mix(s.ballSide); mix(s.ready[0] ? 1 : 0); mix(s.ready[1] ? 1 : 0); mix(s.winner);
  return h >>> 0;
}

export function sackRadii(k: Sack): [number, number] {
  return k.crouch ? [CROUCH_RX, CROUCH_RY] : [SACK_RX, SACK_RY];
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function limitSpeed(b: Ball) {
  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 > BALL_MAX_SPEED * BALL_MAX_SPEED) {
    const k = BALL_MAX_SPEED / Math.sqrt(sp2);
    b.vx *= k;
    b.vy *= k;
  }
}

function updateSack(s: GameState, p: number, input: number, events: GameEvent[] | null) {
  const k = s.players[p];
  const onGround = k.y >= GROUND;
  const wantCrouch = (input & IN_CROUCH) !== 0;
  k.crouch = wantCrouch;
  const speed = k.crouch && onGround ? CROUCH_SPEED : SACK_SPEED;
  let dir = 0;
  if (input & IN_LEFT) dir -= 1;
  if (input & IN_RIGHT) dir += 1;
  k.vx = dir * speed;
  if (onGround && !k.crouch && (input & IN_JUMP)) {
    k.vy = -JUMP_V;
    if (events) events.push({ type: 'jump', p });
  }
  k.vy += SACK_G;
  k.x += k.vx;
  k.y += k.vy;
  if (k.y >= GROUND) {
    k.y = GROUND;
    k.vy = 0;
  }
  const [rx] = sackRadii(k);
  if (p === 0) k.x = clamp(k.x, rx, NET_X - NET_HALF - rx);
  else k.x = clamp(k.x, NET_X + NET_HALF + rx, W - rx);
  if (k.cooldown > 0) k.cooldown--;
}

// Повертає true, якщо було зіткнення.
function collideSack(b: Ball, k: Sack): boolean {
  const [rx, ry] = sackRadii(k);
  const dx = b.x - k.x;
  const dy = b.y - k.y;
  let nx: number, ny: number, sx: number, sy: number;
  if (dy <= 0) {
    // купол (верхня половина еліпса)
    const q = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    if (q === 0) {
      nx = 0; ny = -1; sx = k.x; sy = k.y - ry;
    } else {
      const t = 1 / q;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist * (1 - t) >= BALL_R) return false;
      sx = k.x + dx * t;
      sy = k.y + dy * t;
      let gx = dx / (rx * rx);
      let gy = dy / (ry * ry);
      const gl = Math.sqrt(gx * gx + gy * gy);
      gx /= gl; gy /= gl;
      nx = gx; ny = gy;
    }
  } else {
    // пласке дно
    const cx = clamp(b.x, k.x - rx, k.x + rx);
    const cy = k.y;
    const ex = b.x - cx;
    const ey = b.y - cy;
    const d2 = ex * ex + ey * ey;
    if (d2 >= BALL_R * BALL_R) return false;
    const d = Math.sqrt(d2);
    if (d === 0) { nx = 0; ny = 1; } else { nx = ex / d; ny = ey / d; }
    sx = cx; sy = cy;
  }
  // виштовхуємо м'яч на поверхню
  b.x = sx + nx * (BALL_R + 0.5);
  b.y = sy + ny * (BALL_R + 0.5);
  // відбиття з урахуванням руху мішка
  let rvx = b.vx - k.vx;
  let rvy = b.vy - k.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    rvx -= (1 + HIT_E) * vn * nx;
    rvy -= (1 + HIT_E) * vn * ny;
  }
  const vn2 = rvx * nx + rvy * ny;
  if (vn2 < MIN_POP) {
    rvx += (MIN_POP - vn2) * nx;
    rvy += (MIN_POP - vn2) * ny;
  }
  b.vx = rvx + k.vx;
  b.vy = rvy + k.vy;
  limitSpeed(b);
  return true;
}

// Сітка: прямокутник з напівкруглим верхом. Повертає true при зіткненні.
function collideNet(b: Ball): boolean {
  const capY = NET_TOP + NET_HALF;
  if (b.y <= capY) {
    const dx = b.x - NET_X;
    const dy = b.y - capY;
    const r = BALL_R + NET_HALF;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    let nx = 0, ny = -1;
    if (d > 0) { nx = dx / d; ny = dy / d; }
    b.x = NET_X + nx * (r + 0.1);
    b.y = capY + ny * (r + 0.1);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + NET_E) * vn * nx;
      b.vy -= (1 + NET_E) * vn * ny;
    }
    return true;
  }
  if (Math.abs(b.x - NET_X) >= BALL_R + NET_HALF) return false;
  // бокові грані
  if (b.x < NET_X) {
    b.x = NET_X - NET_HALF - BALL_R - 0.1;
    if (b.vx > 0) b.vx = -b.vx * NET_E;
  } else {
    b.x = NET_X + NET_HALF + BALL_R + 0.1;
    if (b.vx < 0) b.vx = -b.vx * NET_E;
  }
  return true;
}

// Рух м'яча без гравців: гравітація, стіни, стеля, сітка.
// Повертає 1 якщо м'яч торкнувся підлоги. Використовується і ботом для прогнозу.
export function moveBallFree(b: Ball, events: GameEvent[] | null): boolean {
  let floor = false;
  b.x += b.vx / SUBSTEPS;
  b.y += b.vy / SUBSTEPS;
  if (b.x < BALL_R) {
    b.x = BALL_R;
    b.vx = -b.vx * WALL_E;
    if (events) events.push({ type: 'wall', x: b.x, y: b.y });
  } else if (b.x > W - BALL_R) {
    b.x = W - BALL_R;
    b.vx = -b.vx * WALL_E;
    if (events) events.push({ type: 'wall', x: b.x, y: b.y });
  }
  if (b.y < BALL_R) {
    b.y = BALL_R;
    b.vy = -b.vy * WALL_E;
    if (events) events.push({ type: 'wall', x: b.x, y: b.y });
  }
  if (collideNet(b) && events) events.push({ type: 'net', x: b.x, y: b.y });
  if (b.y >= GROUND - BALL_R) {
    b.y = GROUND - BALL_R;
    floor = true;
  }
  return floor;
}

export function ballGravityStep(b: Ball) {
  b.vy += BALL_G;
}
export const BALL_SUBSTEPS = SUBSTEPS;

function awardPoint(s: GameState, winner: number, fault: number, faultBy: number, events: GameEvent[] | null) {
  s.score[winner]++;
  s.lastPointBy = winner;
  s.server = winner;
  s.fault = fault;
  s.faultBy = faultBy;
  s.phase = PH_POINT;
  s.timer = POINT_PAUSE;
  if (events) events.push({ type: 'point', winner, fault });
}

function isMatchOver(s: GameState): number {
  for (let p = 0; p < 2; p++) {
    if (s.score[p] >= s.target && s.score[p] - s.score[1 - p] >= 2) return p;
  }
  return -1;
}

/** Один крок симуляції (1/60 с). events може бути null (під час пересимуляції). */
export function step(s: GameState, in0: number, in1: number, events: GameEvent[] | null = null) {
  s.frame++;
  updateSack(s, 0, in0, events);
  updateSack(s, 1, in1, events);
  const b = s.ball;

  if (s.phase === PH_SERVE) {
    // м'яч завис над подаючим, гравці можуть рухатися
    s.timer--;
    for (let p = 0; p < 2; p++) {
      const k = s.players[p];
      // якщо гравець дістав м'яч під час заморозки — одразу починаємо розіграш
      const [rx, ry] = sackRadii(k);
      const dx = b.x - k.x, dy = b.y - (k.y - ry);
      if (s.timer <= 0 || (Math.abs(dx) < rx + BALL_R && Math.abs(dy) < BALL_R + 4)) {
        s.timer = 0;
      }
    }
    if (s.timer <= 0) {
      s.phase = PH_RALLY;
      if (events) events.push({ type: 'serve' });
    } else {
      return;
    }
  }

  if (s.phase === PH_OVER) {
    s.timer = s.timer > 0 ? s.timer - 1 : 0;
    if (s.timer === 0) {
      if (in0 & IN_JUMP) s.ready[0] = true;
      if (in1 & IN_JUMP) s.ready[1] = true;
      if (s.ready[0] && s.ready[1]) {
        const loser = 1 - s.winner;
        s.score[0] = 0;
        s.score[1] = 0;
        s.ready[0] = false;
        s.ready[1] = false;
        s.winner = -1;
        s.lastPointBy = -1;
        s.server = loser;
        setupServe(s);
        if (events) events.push({ type: 'serve' });
        return;
      }
    }
  }

  ballGravityStep(b);
  for (let i = 0; i < SUBSTEPS; i++) {
    const floor = moveBallFree(b, s.phase === PH_RALLY ? events : null);
    if (s.phase !== PH_RALLY) {
      if (floor) {
        // після очка м'яч просто стрибає по підлозі із загасанням
        if (b.vy > 0) b.vy = -b.vy * 0.5;
        b.vx *= 0.9;
      }
      continue;
    }
    for (let p = 0; p < 2; p++) {
      const k = s.players[p];
      if (collideSack(b, k)) {
        if (k.cooldown === 0) {
          k.cooldown = HIT_COOLDOWN;
          if (s.touchSide !== p) {
            s.touchSide = p;
            s.touches = 1;
          } else {
            s.touches++;
          }
          if (events) {
            events.push({ type: 'hit', p, speed: Math.sqrt(b.vx * b.vx + b.vy * b.vy), x: b.x, y: b.y });
          }
          if (s.touches > MAX_TOUCHES) {
            awardPoint(s, 1 - p, FAULT_TOUCHES, p, events);
            break;
          }
        } else {
          k.cooldown = HIT_COOLDOWN;
        }
      }
    }
    // мішок міг виштовхнути м'яч у стіну/стелю/сітку — повертаємо в межі
    if (b.x < BALL_R) { b.x = BALL_R; if (b.vx < 0) b.vx = -b.vx; }
    else if (b.x > W - BALL_R) { b.x = W - BALL_R; if (b.vx > 0) b.vx = -b.vx; }
    if (b.y < BALL_R) { b.y = BALL_R; if (b.vy < 0) b.vy = -b.vy; }
    if (b.y > GROUND - BALL_R) b.y = GROUND - BALL_R;
    collideNet(b);
    if (s.phase !== PH_RALLY) continue;
    const side = b.x < NET_X ? 0 : 1;
    if (side !== s.ballSide) {
      s.ballSide = side;
      s.touchSide = -1;
      s.touches = 0;
    }
    if (floor) {
      if (events) events.push({ type: 'floor', x: b.x, y: b.y });
      awardPoint(s, 1 - side, FAULT_FLOOR, side, events);
      if (b.vy > 0) b.vy = -b.vy * 0.5;
    }
  }

  if (s.phase === PH_POINT) {
    s.timer--;
    if (s.timer <= 0) {
      const w = isMatchOver(s);
      if (w >= 0) {
        s.phase = PH_OVER;
        s.winner = w;
        s.timer = OVER_LOCK;
        s.ready[0] = false;
        s.ready[1] = false;
        if (events) events.push({ type: 'over', winner: w });
      } else {
        setupServe(s);
      }
    }
  }
}
