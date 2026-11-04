import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, W, H, GROUND, BALL_R, PH_OVER, cloneState, hashState } from '../src/sim/game.ts';
import type { GameEvent } from '../src/sim/game.ts';
import { Bot } from '../src/bot.ts';
import { mulberry32 } from './rng.ts';

test('бот проти бота: гра йде, м\'яч у межах, матчі завершуються', () => {
  for (const [d0, d1] of [['hard', 'hard'], ['normal', 'easy'], ['easy', 'hard']] as const) {
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
      assert.ok(b.y >= BALL_R - 0.01 && b.y <= GROUND - BALL_R + 0.01, `y out ${b.y}`);
      assert.ok(b.y <= H);
    }
    console.log(`${d0} vs ${d1}: hits=${hits} points=${points} 4-touch faults=${faults4} matches=${overs} longest rally=${maxRally}`);
    assert.ok(points >= 5, 'мало очок');
    assert.ok(hits > points * 2, 'мало ударів');
    if (d0 !== d1) assert.ok(overs >= 1, 'жоден матч не завершився');
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
