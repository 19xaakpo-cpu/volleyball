import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, W, GROUND, BALL_R, PH_OVER, PH_RALLY, cloneState, hashState } from '../src/sim/game.ts';
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
      assert.ok(b.y > -1600 && b.y <= GROUND - BALL_R + 0.01, `y out ${b.y}`);
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
  // подача: гравець 0 стрибає під м'ячем, далі стоїть — м'яч стрибає йому на голову
  const s = createGame(15, 0);
  const ev: GameEvent[] = [];
  for (let f = 0; f < 2000 && !ev.some(e => e.type === 'point'); f++) step(s, f < 3 ? 4 : 0, 0, ev);
  const hits = ev.filter(e => e.type === 'hit').length;
  const pt = ev.find(e => e.type === 'point');
  assert.equal(hits, 4);
  assert.ok(pt && pt.type === 'point' && pt.winner === 1 && pt.fault === 2);
  assert.deepEqual(s.score, [0, 1]);
});

test('присідання підкидає м\'яч сильно вгору', () => {
  const s = createGame(15, 0);
  s.phase = PH_RALLY;
  s.ball.x = s.players[0].x; s.ball.y = 330; s.ball.vx = 0; s.ball.vy = 3;
  const ev: GameEvent[] = [];
  for (let f = 0; f < 120; f++) {
    ev.length = 0;
    step(s, 8, 0, ev);
    const h = ev.find(e => e.type === 'hit');
    if (h && h.type === 'hit') { assert.ok(h.pop); assert.ok(s.ball.vy < -12, `vy=${s.ball.vy}`); return; }
  }
  assert.fail('удару в присіді не було');
});

test('подача: м\'яч висить; звичайний стрибок ледь дістає, суперстрибок — легко', () => {
  const s = createGame(15, 0);
  const y0 = s.ball.y;
  for (let f = 0; f < 200; f++) step(s, 0, 0);
  assert.equal(s.ball.y, y0, 'м\'яч не мав падати');
  // звичайний стрибок під м'ячем — дістає
  const a = createGame(15, 0);
  const ev: GameEvent[] = [];
  for (let f = 0; f < 60; f++) step(a, 4, 0, ev);
  assert.ok(ev.some(e => e.type === 'hit'), 'звичайний стрибок не дістав');
  // запас по висоті: верх мішка в апогеї звичайного стрибка ледь вище за низ м'яча
  const b = createGame(15, 0);
  let minTop = 1e9;
  for (let f = 0; f < 60; f++) { step(b, f < 1 ? 4 : 0, 1); minTop = Math.min(minTop, b.players[1].y - 58); }
  const superG = createGame(15, 0);
  const ev2: GameEvent[] = [];
  step(superG, 8, 0); step(superG, 4, 0, ev2);
  assert.ok(ev2.some(e => e.type === 'jump' && e.super), 'суперстрибок не спрацював');
});

test('суперстрибок у 1.8 раза вищий за звичайний', () => {
  const peak = (inputs: number[]) => {
    const s = createGame(15, 1);
    let min = 1e9;
    for (let f = 0; f < 120; f++) { step(s, inputs[f] ?? 0, 0); min = Math.min(min, s.players[0].y); }
    return GROUND - min;
  };
  const normal = peak([4]);
  const sup = peak([8, 4]);
  const r = sup / normal;
  assert.ok(r > 1.7 && r < 1.9, `ratio=${r}`);
});

test('суперудари пришвидшують м\'яч і накопичуються', () => {
  const s = createGame(15, 0);
  const ev: GameEvent[] = [];
  // суперстрибок прямо під висячим м'ячем на подачі
  step(s, 8, 0); step(s, 4, 0);
  for (let f = 0; f < 40; f++) { step(s, 0, 0, ev); if (ev.some(e => e.type === 'hit')) break; }
  const h = ev.find(e => e.type === 'hit');
  assert.ok(h && h.type === 'hit' && h.super, 'має бути суперудар');
  assert.ok(s.boost > 1.05, `boost=${s.boost}`);
  const sp = Math.hypot(s.ball.vx, s.ball.vy);
  assert.ok(sp >= 15, `speed=${sp}`);
});

test('м\'яч може залетіти за верх екрана', () => {
  const s = createGame(15);
  const b0 = new Bot(0, 'hard', mulberry32(3)), b1 = new Bot(1, 'normal', mulberry32(4));
  let above = 0;
  for (let f = 0; f < 60 * 60 * 3; f++) { step(s, b0.input(s), b1.input(s)); if (s.ball.y < 0) above++; }
  assert.ok(above > 0, 'м\'яч жодного разу не вилетів вгору');
});

test('ривок: подвійне натискання стрілки, потім довгий підйом; одинарне — ні', () => {
  const s = createGame(15, 1);
  const x0 = s.players[0].x;
  step(s, 2, 0); step(s, 0, 0); step(s, 2, 0); // вправо, відпустити, вправо
  for (let i = 0; i < 10; i++) step(s, 2, 0);
  const k = s.players[0];
  assert.ok(k.x - x0 > 120, `dx=${k.x - x0}`);
  assert.ok(k.recover > 0 && k.crouch);
  for (let i = 0; i < 5; i++) step(s, 4, 0); // стрибок під час підйому не працює
  assert.equal(k.vy, 0);
  // присідання під час бігу більше не дає ривка
  const t = createGame(15, 1);
  step(t, 2, 0); step(t, 2 | 8, 0);
  assert.equal(t.players[0].dash, 0);
  // повільне подвійне натискання — не ривок
  const u = createGame(15, 1);
  step(u, 2, 0);
  for (let i = 0; i < 20; i++) step(u, 0, 0);
  step(u, 2, 0);
  assert.equal(u.players[0].dash, 0);
});

test('гасіння — лише впритул до сітки; здалеку суперудар іде вгору', () => {
  const run = (sackX: number) => {
    const s = createGame(15, 0);
    s.phase = PH_RALLY;
    const k = s.players[0];
    k.x = sackX; k.y = 330; k.vy = -2; k.superAir = true;
    // м'яч збоку мішка з боку сітки
    s.ball.x = k.x + 58; s.ball.y = k.y - 20; s.ball.vx = -3; s.ball.vy = 1;
    const ev: GameEvent[] = [];
    for (let f = 0; f < 5; f++) { step(s, 0, 0, ev); if (ev.some(e => e.type === 'hit')) break; }
    const h = ev.find(e => e.type === 'hit');
    assert.ok(h && h.type === 'hit' && h.super, 'має бути суперудар');
    return { spike: h.spike, vy: s.ball.vy };
  };
  const near = run(480 - 6 - 52); // упритул до сітки
  assert.equal(near.spike, true);
  assert.ok(near.vy > 0, 'гасіння — вниз');
  const far = run(200);
  assert.equal(far.spike, false);
  assert.ok(far.vy < 0, 'здалеку — вгору');
});
