// Бот. Кожні кілька кадрів він "програє в голові" кілька варіантів удару
// (де стати і як бити: стоячи, з набігання, у стрибку), симулюючи гру наперед,
// і обирає той, після якого м'яч перелітає на бік суперника.
// Працює лише локально (у мережевій грі бота немає), тож Math.random тут дозволено.

import {
  BALL_SUBSTEPS, GROUND, IN_CROUCH, IN_JUMP, IN_LEFT, IN_RIGHT, NET_X, PH_OVER, PH_RALLY, PH_SERVE,
  SACK_RY, W, ballGravityStep, cloneState, homeX, moveBallFree, sackRadii, step,
} from './sim/game.ts';
import type { Ball, GameEvent, GameState } from './sim/game.ts';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Profile {
  blunder: number; // ймовірність схибити на черговому м'ячі
  dig: boolean;
  react: number; // як часто бот переоцінює ситуацію (кадри)
  error: number; // розкид помилки позиціонування (px)
  pickTop: number; // з якої частки найкращих планів обирає випадково (0 — завжди найкращий)
  jump: boolean;
  deadzone: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { blunder: 0.25, dig: false, react: 12, error: 26, pickTop: 0.6, jump: false, deadzone: 8 },
  normal: { blunder: 0.12, dig: false, react: 9, error: 18, pickTop: 0.35, jump: true, deadzone: 5 },
  hard: { blunder: 0.03, dig: true, react: 3, error: 5, pickTop: 0, jump: true, deadzone: 3 },
};

const MODE_STAND = 0;
const MODE_RUN = 1;
const MODE_JUMP = 2;
const MODE_DIG = 3; // присісти — сильне підкидання вгору

interface Plan {
  x: number;
  mode: number;
}

const OFFSETS = [-12, -4, 4, 12, 20, 28, 36, 46, 58];

/** Поведінка за планом — функція лише від стану, тож однакова і в "уяві", і в грі. */
function planInput(s: GameState, p: number, plan: Plan, deadzone: number): number {
  const me = s.players[p];
  const b = s.ball;
  const toNet = p === 0 ? IN_RIGHT : IN_LEFT;
  const [, ry] = sackRadii(me);
  const dx = b.x - me.x;
  const adx = dx < 0 ? -dx : dx;
  let inp = 0;
  const d = plan.x - me.x;
  if (d > deadzone) inp |= IN_RIGHT;
  else if (d < -deadzone) inp |= IN_LEFT;
  if (plan.mode === MODE_RUN) {
    if (b.vy > 0 && b.y > me.y - ry - 130 && adx < 95) inp = toNet;
  } else if (plan.mode === MODE_DIG) {
    if (b.vy > 0 && b.y > me.y - 170 && adx < 80) inp |= IN_CROUCH;
  } else if (plan.mode === MODE_JUMP) {
    if (adx < 70 && b.y < me.y - 100 && b.y > me.y - 250 && b.vy > -4) inp |= IN_JUMP;
    if (me.y < GROUND) inp = (inp & ~(IN_LEFT | IN_RIGHT)) | (adx < 50 ? toNet : inp & (IN_LEFT | IN_RIGHT));
  }
  return inp;
}

export class Bot {
  private p: number;
  private prof: Profile;
  private plan: Plan;
  private wait = 0;
  private lastOut = 0;
  private rallyKey = '';
  private blunder = 0;
  private rand: () => number;

  constructor(p: number, diff: Difficulty, rand: () => number = Math.random) {
    this.p = p;
    this.prof = PROFILES[diff];
    this.plan = { x: homeX(p), mode: MODE_STAND };
    this.rand = rand;
  }

  private mine(x: number) {
    return this.p === 0 ? x < NET_X : x > NET_X;
  }

  /** де м'яч опуститься до висоти hitY: [x, кадри, чи на нашому боці] */
  private predict(s: GameState, hitY: number): [number, number, boolean] {
    const b: Ball = { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy };
    for (let f = 1; f < 240; f++) {
      ballGravityStep(b);
      let floor = false;
      for (let i = 0; i < BALL_SUBSTEPS; i++) floor = moveBallFree(b, s.net, null) || floor;
      if ((b.vy > 0 && b.y >= hitY) || floor) return [b.x, f, this.mine(b.x)];
    }
    return [b.x, 240, this.mine(b.x)];
  }

  /** Оцінка плану: симулюємо гру наперед (суперник стоїть). */
  private evaluate(s: GameState, plan: Plan): number {
    const c = cloneState(s);
    const p = this.p;
    const opp = 1 - p;
    const ev: GameEvent[] = [];
    let hit = false;
    for (let f = 0; f < 200; f++) {
      ev.length = 0;
      const mi = planInput(c, p, plan, 3);
      if (p === 0) step(c, mi, 0, ev);
      else step(c, 0, mi, ev);
      for (const e of ev) {
        if (e.type === 'point') {
          if (e.winner === p) return 300;
          return hit ? -200 : -300;
        }
        if (e.type === 'hit' && e.p === p) {
          if (!hit) {
            hit = true;
          }
        }
      }
      if (c.phase !== PH_RALLY) return 0;
      if (hit && !this.mine(c.ball.x)) {
        // перелетів — оцінюємо, наскільки далеко від суперника впаде
        const [lx] = this.predict(c, GROUND - SACK_RY);
        const away = Math.abs(lx - c.players[opp].x);
        const sp = Math.sqrt(c.ball.vx * c.ball.vx + c.ball.vy * c.ball.vy);
        return 100 + Math.min(away, 220) * 0.4 + sp * 1.5;
      }
      if (hit && f > 20 && c.ball.vy > 0 && c.ball.y > GROUND - SACK_RY - 140) {
        // м'яч падає назад на наш бік
        const left = 3 - (c.touchSide === p ? c.touches : 0);
        if (left <= 0) return -150;
        // краще, якщо м'яч ближче до сітки (для наступного удару)
        return 20 + left * 10 - Math.abs(c.ball.x - NET_X) * 0.05;
      }
    }
    return hit ? 0 : -100;
  }

  private replan(s: GameState) {
    const dir = this.p === 0 ? 1 : -1;
    if (s.phase === PH_SERVE) {
      if (s.server === this.p) {
        this.plan = { x: s.ball.x - dir * (10 + this.rand() * 25), mode: this.rand() < 0.5 ? MODE_RUN : MODE_STAND };
      } else {
        this.plan = { x: homeX(this.p), mode: MODE_STAND };
      }
      return;
    }
    if (s.phase !== PH_RALLY) {
      this.plan = { x: homeX(this.p), mode: MODE_STAND };
      return;
    }
    const [lx, , mine] = this.predict(s, GROUND - SACK_RY - 10);
    if (!mine) {
      this.plan = { x: homeX(this.p) + dir * 40, mode: MODE_STAND };
      return;
    }
    const scored: [number, Plan][] = [];
    const modes = [MODE_STAND, MODE_RUN];
    if (this.prof.jump) modes.push(MODE_JUMP);
    if (this.prof.dig) modes.push(MODE_DIG);
    for (const off of OFFSETS) {
      const x = Math.max(40, Math.min(W - 40, lx - dir * off));
      for (const mode of modes) {
        const plan = { x, mode };
        scored.push([this.evaluate(s, plan), plan]);
      }
    }
    scored.sort((a, b) => b[0] - a[0]);
    let idx = 0;
    if (this.prof.pickTop > 0) {
      const good = scored.filter(e => e[0] >= 100);
      const pool = good.length > 0 ? good : scored;
      idx = Math.floor(this.rand() * Math.max(1, Math.ceil(pool.length * this.prof.pickTop)));
      idx = scored.indexOf(pool[Math.min(idx, pool.length - 1)]);
    }
    const key = `${s.ballSide}:${s.touchSide}:${s.touches}:${s.score[0]}:${s.score[1]}`;
    if (key !== this.rallyKey) {
      this.rallyKey = key;
      this.blunder = this.rand() < this.prof.blunder ? (this.rand() < 0.5 ? -1 : 1) * (45 + this.rand() * 40) : 0;
    }
    const best = scored[idx][1];
    best.x += this.blunder;
    this.plan = { x: best.x + (this.rand() * 2 - 1) * this.prof.error, mode: best.mode };
  }

  input(s: GameState): number {
    if (s.phase === PH_OVER) return (s.frame >> 4) & 1 ? IN_JUMP : 0;
    if (this.wait > 0) this.wait--;
    else {
      this.wait = this.prof.react;
      this.replan(s);
    }
    let out = planInput(s, this.p, this.plan, this.prof.deadzone);
    // ривок до далекого м'яча (на "нормально" і "складно")
    const me = s.players[this.p];
    if (this.prof.jump && s.phase === PH_RALLY && me.y >= GROUND && me.dash === 0 && me.recover === 0 && me.dashCd === 0) {
      const d = this.plan.x - me.x;
      if (Math.abs(d) > 230 && !(this.lastOut & IN_CROUCH)) out = (out & ~IN_JUMP) | IN_CROUCH | (d > 0 ? IN_RIGHT : IN_LEFT);
    }
    this.lastOut = out;
    return out;
  }
}
