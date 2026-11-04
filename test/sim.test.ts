import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, W, GROUND, BALL_R, PH_OVER, cloneState, hashState } from '../src/sim/game.ts';
import type { GameEvent } from '../src/sim/game.ts';
import { Bot } from '../src/bot.ts';
import { mulberry32 } from './rng.ts';

test('бот проти бота: гра йде, м\'яч у межах, матчі завершуються', () => {
  for (const [d0, d1] of [['hard', 'normal'], ['normal', 'easy'], ['easy', 'hard']] as const) {
    const s = createGame(15);
    const b0 = new Bot(0, d0, mulberry32(1));
    const b1 = new Bot(1, d1, mulberry32(2));
    let hits = 0, points = 0, faults4 = 0, overs = 0, maxRally = 0, rally = 0;
    for (let f = 0; f < 60 * 60 * 15; f++) {
      const ev: GameEvent[] = [];
      step(s, b0.input(s), b1.input(s), ev);
      for (const e of ev) {
        if (e.type === 'hit') { hits++; rally++; }
        if (e.type === 'point') { points++; maxRally = Math.max(maxRally, rally); rally = 0; if (e.fault === 2) faults4++; }
        if (e.type === 'over') overs++;
      }
      const b = s.ball;
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), 'NaN');
      assert.ok(b.x >= BALL_R - 0.01 && b.x <= W - BALL_R + 0.01, `x out ${b.x}`);
      assert.ok(b.y > -700 && b.y <= GROUND - BALL_R + 0.01, `y out ${b.y}`);
    }
    console.log(`${d0} vs ${d1}: hits=${hits} points=${points} 4-touch faults=${faults4} matches=${overs} longest rally=${maxRally}`);
    assert.ok(points >= 5, 'мало очок');
    assert.ok(hits > points * 2, 'мало ударів');
    assert.ok(overs >= 1, 'жоден матч не завершився');
  }
});

test('детермінованість: однакові введення — однаковий хеш; clone не ділить пам\'ять', () => {
  const run = () => {
    const s = createGame(15);
    const r = mulberry32(42);
    for (let f = 0; f < 5000; f++) step(s, (r() * 16) | 0, (r() * 16) | 0);
    return hashState(s);
  };
  assert.equal(run(), run());
  const s = createGame();
  const c = cloneState(s);
  step(c, 2, 2);
  assert.notEqual(hashState(s), hashState(c));
  assert.equal(s.frame, 0);
});

test('правило 3 торкань: четверте торкання — очко супернику', () => {
  // гравець 0 стоїть на місці під м'ячем — м'яч стрибає йому на голову
  const s = createGame(15, 0);
  const ev: GameEvent[] = [];
  for (let f = 0; f < 2000 && !ev.some(e => e.type === 'point'); f++) step(s, 0, 0, ev);
  const hits = ev.filter(e => e.type === 'hit').length;
  const pt = ev.find(e => e.type === 'point');
  assert.equal(hits, 4);
  assert.ok(pt && pt.type === 'point' && pt.winner === 1 && pt.fault === 2);
  assert.deepEqual(s.score, [0, 1]);
});

test('присідання підкидає м\'яч сильно вгору', () => {
  const s = createGame(15, 0);
  const ev: GameEvent[] = [];
  let pop: any = null;
  for (let f = 0; f < 300 && !pop; f++) {
    ev.length = 0;
    step(s, 8, 0, ev);
    pop = ev.find(e => e.type === 'hit');
  }
  assert.ok(pop && pop.pop, 'удар у присіді');
  assert.ok(s.ball.vy < -12, `vy=${s.ball.vy}`);
});

test('м\'яч може залетіти за верх екрана', () => {
  const s = createGame(15);
  const b0 = new Bot(0, 'hard', mulberry32(3)), b1 = new Bot(1, 'normal', mulberry32(4));
  let above = 0;
  for (let f = 0; f < 60 * 60 * 3; f++) { step(s, b0.input(s), b1.input(s)); if (s.ball.y < 0) above++; }
  assert.ok(above > 0, 'м\'яч жодного разу не вилетів вгору');
});

test('ривок: швидко переміщує, потім довгий підйом', () => {
  const s = createGame(15, 1);
  const x0 = s.players[0].x;
  step(s, 2, 0); // біжимо вправо
  step(s, 2 | 8, 0); // присісти під час бігу = ривок
  for (let i = 0; i < 10; i++) step(s, 2 | 8, 0);
  const k = s.players[0];
  assert.ok(k.x - x0 > 120, `dx=${k.x - x0}`);
  assert.ok(k.recover > 0 && k.crouch);
  for (let i = 0; i < 5; i++) step(s, 4, 0); // стрибок під час підйому не працює
  assert.equal(k.vy, 0);
});
