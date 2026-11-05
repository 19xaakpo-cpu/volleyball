// Детермінована симуляція гри.
// ВАЖЛИВО: тут дозволені лише + - * / Math.sqrt Math.abs Math.min Math.max,
// без Math.random, Math.sin/cos/pow, Date тощо — щоб на всіх пристроях
// однакові вхідні дані давали бітово однаковий результат (потрібно для rollback).

export const W = 960;
export const H = 540;
export const GROUND = 490;
export const NET_X = W / 2;
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
/** присідання: м'яч підкидається вгору з такою швидкістю */
const CROUCH_POP = 14.5;
/** ривок: подвійне швидке натискання стрілки */
export const DASH_FRAMES = 11;
const DASH_SPEED = 15;
export const DASH_RECOVER = 26;
const DASH_COOLDOWN = 45;
export const DOUBLE_TAP = 14; // кадрів між натисканнями
/** суперстрибок: присісти і відразу стрибнути — у 1.8 раза вище */
export const SUPER_WINDOW = 15; // кадрів після натискання "присісти"
const SUPER_JUMP_V = 15.5 * 1.3416; // sqrt(1.8): висота ×1.8
const SUPER_HIT_MIN = 15; // мінімальна швидкість м'яча після суперудару
const BOOST_STEP = 1.1; // кожен суперудар пришвидшує м'яч
const BOOST_MAX = 1.6;
/** подача: м'яч висить тут, поки його не вдарять */
export const SERVE_Y = 285;
const SERVE_TIMEOUT = 600; // 10 с — потім м'яч падає сам

export const MAX_TOUCHES = 3;
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

/** Форма "сітки": стовп напівшириною half з круглою верхівкою радіуса cap. */
export interface NetShape {
  half: number;
  cap: number;
}
export const DEFAULT_NET: NetShape = { half: 6, cap: 6 };

export interface Sack {
  x: number;
  y: number; // лінія "ніг" (низ мішка)
  vx: number;
  vy: number;
  crouch: boolean;
  cooldown: number;
  dash: number; // кадрів ривка лишилось
  dashDir: number;
  recover: number; // кадрів "підйому" після ривка
  dashCd: number;
  prevIn: number;
  tapDir: number; // напрямок першого натискання для подвійного
  tapTimer: number;
  sinceCrouch: number; // кадрів від останнього натискання "присісти"
  superAir: boolean; // у повітрі після суперстрибка
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
  net: NetShape;
  boost: number; // множник швидкості м'яча від суперударів (скидається на подачі)
}

export type GameEvent =
  | { type: 'hit'; p: number; speed: number; x: number; y: number; pop: boolean; super: boolean; spike: boolean }
  | { type: 'wall'; x: number; y: number }
  | { type: 'net'; x: number; y: number }
  | { type: 'floor'; x: number; y: number }
  | { type: 'point'; winner: number; fault: number }
  | { type: 'serve' }
  | { type: 'jump'; p: number; super: boolean }
  | { type: 'dash'; p: number; dir: number }
  | { type: 'over'; winner: number };

export function homeX(p: number): number {
  return p === 0 ? W * 0.25 : W * 0.75;
}

function newSack(p: number): Sack {
  return { x: homeX(p), y: GROUND, vx: 0, vy: 0, crouch: false, cooldown: 0, dash: 0, dashDir: 0, recover: 0, dashCd: 0, prevIn: 0, tapDir: 0, tapTimer: 0, sinceCrouch: 99, superAir: false };
}

export function createGame(target = 15, server = 0, net: NetShape = DEFAULT_NET): GameState {
  const s: GameState = {
    frame: 0,
    phase: PH_SERVE,
    timer: SERVE_TIMEOUT,
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
    net: { half: net.half, cap: net.cap },
    boost: 1,
  };
  setupServe(s);
  return s;
}

function setupServe(s: GameState) {
  s.phase = PH_SERVE;
  s.timer = SERVE_TIMEOUT;
  s.boost = 1;
  for (let p = 0; p < 2; p++) {
    const k = s.players[p];
    k.x = homeX(p);
    k.y = GROUND;
    k.vx = 0;
    k.vy = 0;
    k.crouch = false;
    k.cooldown = 0;
    k.dash = 0;
    k.recover = 0;
    k.dashCd = 0;
    k.superAir = false;
  }
  s.ball.x = homeX(s.server);
  s.ball.y = SERVE_Y;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.touchSide = -1;
  s.touches = 0;
  s.ballSide = s.server;
  s.fault = FAULT_NONE;
  s.faultBy = -1;
}

function cloneSack(a: Sack): Sack {
  return {
    x: a.x, y: a.y, vx: a.vx, vy: a.vy, crouch: a.crouch, cooldown: a.cooldown,
    dash: a.dash, dashDir: a.dashDir, recover: a.recover, dashCd: a.dashCd, prevIn: a.prevIn,
    tapDir: a.tapDir, tapTimer: a.tapTimer, sinceCrouch: a.sinceCrouch, superAir: a.superAir,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    frame: s.frame,
    phase: s.phase,
    timer: s.timer,
    players: [cloneSack(s.players[0]), cloneSack(s.players[1])],
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
    net: s.net,
    boost: s.boost,
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
    mix(k.dash); mix(k.dashDir); mix(k.recover); mix(k.dashCd); mix(k.prevIn);
    mix(k.tapDir); mix(k.tapTimer); mix(k.sinceCrouch); mix(k.superAir ? 1 : 0);
  }
  mix(s.ball.x); mix(s.ball.y); mix(s.ball.vx); mix(s.ball.vy);
  mix(s.score[0]); mix(s.score[1]); mix(s.server); mix(s.touchSide); mix(s.touches);
  mix(s.ballSide); mix(s.ready[0] ? 1 : 0); mix(s.ready[1] ? 1 : 0); mix(s.winner);
  mix(s.net.half); mix(s.net.cap); mix(s.boost);
  return h >>> 0;
}

export function sackRadii(k: Sack): [number, number] {
  return k.crouch ? [CROUCH_RX, CROUCH_RY] : [SACK_RX, SACK_RY];
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function limitSpeed(b: Ball, boost: number) {
  const max = BALL_MAX_SPEED * boost;
  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 > max * max) {
    const k = max / Math.sqrt(sp2);
    b.vx *= k;
    b.vy *= k;
  }
}

function updateSack(s: GameState, p: number, input: number, events: GameEvent[] | null) {
  const k = s.players[p];
  const onGround = k.y >= GROUND;
  let dir = 0;
  if (input & IN_LEFT) dir -= 1;
  if (input & IN_RIGHT) dir += 1;
  const crouchPressed = (input & IN_CROUCH) !== 0 && (k.prevIn & IN_CROUCH) === 0;
  const leftPressed = (input & IN_LEFT) !== 0 && (k.prevIn & IN_LEFT) === 0;
  const rightPressed = (input & IN_RIGHT) !== 0 && (k.prevIn & IN_RIGHT) === 0;
  k.prevIn = input;
  if (k.dashCd > 0) k.dashCd--;
  if (k.tapTimer > 0) k.tapTimer--;
  if (crouchPressed) k.sinceCrouch = 0;
  else if (k.sinceCrouch < 99) k.sinceCrouch++;

  // ривок: двічі швидко натиснути стрілку в один бік
  const tap = leftPressed && !rightPressed ? -1 : rightPressed && !leftPressed ? 1 : 0;
  if (tap !== 0) {
    if (k.tapTimer > 0 && k.tapDir === tap && onGround && k.dash === 0 && k.recover === 0 && k.dashCd === 0) {
      k.dash = DASH_FRAMES;
      k.dashDir = tap;
      k.dashCd = DASH_COOLDOWN;
      k.tapTimer = 0;
      if (events) events.push({ type: 'dash', p, dir: tap });
    } else {
      k.tapDir = tap;
      k.tapTimer = DOUBLE_TAP;
    }
  }

  if (k.dash > 0) {
    k.crouch = true;
    k.vx = k.dashDir * DASH_SPEED;
    k.dash--;
    if (k.dash === 0) k.recover = DASH_RECOVER;
  } else if (k.recover > 0) {
    // після ривка мішок довше "підводиться"
    k.crouch = true;
    k.vx = dir * CROUCH_SPEED * 0.6;
    k.recover--;
  } else {
    const wantJump = (input & IN_JUMP) !== 0;
    // суперстрибок: "присісти" натиснуто щойно, а потім одразу "стрибок"
    const superJump = onGround && wantJump && k.sinceCrouch <= SUPER_WINDOW;
    k.crouch = (input & IN_CROUCH) !== 0 && !superJump;
    const speed = k.crouch && onGround ? CROUCH_SPEED : SACK_SPEED;
    k.vx = dir * speed;
    if (onGround && !k.crouch && wantJump) {
      k.vy = superJump ? -SUPER_JUMP_V : -JUMP_V;
      k.superAir = superJump;
      if (superJump) k.sinceCrouch = 99;
      if (events) events.push({ type: 'jump', p, super: superJump });
    }
  }
  k.vy += SACK_G;
  k.x += k.vx;
  k.y += k.vy;
  if (k.y >= GROUND) {
    k.y = GROUND;
    k.vy = 0;
    k.superAir = false;
  }
  const [rx] = sackRadii(k);
  const nh = s.net.half;
  if (p === 0) k.x = clamp(k.x, rx, NET_X - nh - rx);
  else k.x = clamp(k.x, NET_X + nh + rx, W - rx);
  if (k.cooldown > 0) k.cooldown--;
}

// Результат зіткнення: 0 — немає, 1 — звичайне, 2 — суперудар, 3 — суперудар-"гасіння".
function collideSack(b: Ball, k: Sack, p: number, boost: number): number {
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
      if (dist * (1 - t) >= BALL_R) return 0;
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
    if (d2 >= BALL_R * BALL_R) return 0;
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
  // присідання: сильне підкидання вгору (м'яч зверху мішка)
  if (k.crouch && ny < 0.3) {
    b.vx = b.vx * 0.45 + k.vx * 0.25;
    if (b.vy > -CROUCH_POP) b.vy = -CROUCH_POP;
  }
  let kind = 1;
  if (k.superAir) {
    // суперудар: м'яч летить швидше і вище; біля сітки боком — "гасіння" вниз
    const toNet = p === 0 ? 1 : -1;
    const sp0 = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    let sp = sp0 * 1.15;
    if (sp < SUPER_HIT_MIN * boost) sp = SUPER_HIT_MIN * boost;
    let dx = b.vx, dy = b.vy;
    if (nx * toNet > 0.45 && ny > -0.75) {
      // м'яч збоку з боку сітки — б'ємо вперед і вниз
      dx = toNet * 0.88;
      dy = 0.48;
      kind = 3;
    } else {
      // вгору, з ухилом до сітки
      const l0 = sp0 > 0 ? sp0 : 1;
      dx = dx / l0;
      dy = dy / l0;
      if (dy > -0.6) dy = -0.6;
      if (dx * toNet < 0.25) dx = toNet * 0.25;
      kind = 2;
    }
    const l = Math.sqrt(dx * dx + dy * dy);
    b.vx = (dx / l) * sp;
    b.vy = (dy / l) * sp;
  }
  limitSpeed(b, kind >= 2 ? Math.min(BOOST_MAX, boost * BOOST_STEP) : boost);
  return kind;
}

function reflect(b: Ball, nx: number, ny: number, e: number) {
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
  }
}

// "Сітка": стовп з круглою верхівкою. Повертає true при зіткненні.
function collideNet(b: Ball, net: NetShape): boolean {
  const capY = NET_TOP + net.cap;
  let hit = false;
  if (b.y > capY && Math.abs(b.x - NET_X) < BALL_R + net.half) {
    // бокові грані стовпа
    if (b.x < NET_X) {
      b.x = NET_X - net.half - BALL_R - 0.1;
      if (b.vx > 0) b.vx = -b.vx * NET_E;
    } else {
      b.x = NET_X + net.half + BALL_R + 0.1;
      if (b.vx < 0) b.vx = -b.vx * NET_E;
    }
    hit = true;
  }
  // кругла верхівка
  const dx = b.x - NET_X;
  const dy = b.y - capY;
  const r = BALL_R + net.cap;
  const d2 = dx * dx + dy * dy;
  if (d2 < r * r) {
    const d = Math.sqrt(d2);
    let nx = 0, ny = -1;
    if (d > 0) { nx = dx / d; ny = dy / d; }
    b.x = NET_X + nx * (r + 0.1);
    b.y = capY + ny * (r + 0.1);
    reflect(b, nx, ny, NET_E);
    hit = true;
  }
  return hit;
}

// Рух м'яча без гравців: стіни, сітка (стелі немає — м'яч може залетіти за верх екрана).
// Повертає true якщо м'яч торкнувся підлоги. Використовується і ботом для прогнозу.
export function moveBallFree(b: Ball, net: NetShape, events: GameEvent[] | null): boolean {
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
  if (collideNet(b, net) && events) events.push({ type: 'net', x: b.x, y: b.y });
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

/** Зарахувати торкання. Повертає true, якщо через нього розіграш закінчився. */
function registerTouch(s: GameState, p: number, kind: number, events: GameEvent[] | null): boolean {
  const k = s.players[p];
  const b = s.ball;
  if (k.cooldown !== 0) {
    k.cooldown = HIT_COOLDOWN;
    return false;
  }
  k.cooldown = HIT_COOLDOWN;
  if (kind >= 2) {
    s.boost = Math.min(BOOST_MAX, s.boost * BOOST_STEP);
    k.superAir = false; // один суперудар за стрибок
  }
  if (s.touchSide !== p) {
    s.touchSide = p;
    s.touches = 1;
  } else {
    s.touches++;
  }
  if (events) {
    events.push({ type: 'hit', p, speed: Math.sqrt(b.vx * b.vx + b.vy * b.vy), x: b.x, y: b.y, pop: k.crouch, super: kind >= 2, spike: kind === 3 });
  }
  if (s.touches > MAX_TOUCHES) {
    awardPoint(s, 1 - p, FAULT_TOUCHES, p, events);
    return true;
  }
  return false;
}

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
    // м'яч висить над подаючим, доки його не вдарять (або не мине 10 с)
    s.timer--;
    let started = s.timer <= 0;
    for (let p = 0; p < 2 && !started; p++) {
      const kind = collideSack(b, s.players[p], p, s.boost);
      if (kind) {
        started = true;
        registerTouch(s, p, kind, events);
      }
    }
    if (!started) {
      b.vx = 0;
      b.vy = 0;
      return;
    }
    s.phase = PH_RALLY;
    if (events) events.push({ type: 'serve' });
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
    const floor = moveBallFree(b, s.net, s.phase === PH_RALLY ? events : null);
    if (s.phase !== PH_RALLY) {
      if (floor) {
        // після очка м'яч просто стрибає по підлозі із загасанням
        if (b.vy > 0) b.vy = -b.vy * 0.5;
        b.vx *= 0.9;
      }
      continue;
    }
    for (let p = 0; p < 2; p++) {
      const kind = collideSack(b, s.players[p], p, s.boost);
      if (kind && registerTouch(s, p, kind, events)) break;
    }
    // мішок міг виштовхнути м'яч у стіну/сітку — повертаємо в межі
    if (b.x < BALL_R) { b.x = BALL_R; if (b.vx < 0) b.vx = -b.vx; }
    else if (b.x > W - BALL_R) { b.x = W - BALL_R; if (b.vx > 0) b.vx = -b.vx; }
    if (b.y > GROUND - BALL_R) b.y = GROUND - BALL_R;
    collideNet(b, s.net);
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

/** Прогнати матч бот-проти-бота повністю (для турнірів): повертає рахунок. */
export function quickSim(target: number, net: NetShape, inputs: (s: GameState) => [number, number], maxFrames = 60 * 60 * 30): [number, number] {
  const s = createGame(target, 0, net);
  for (let f = 0; f < maxFrames && s.phase !== PH_OVER; f++) {
    const [a, b] = inputs(s);
    step(s, a, b);
  }
  return [s.score[0], s.score[1]];
}
