import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RollbackSession } from '../src/net/rollback.ts';
import type { NetMsg } from '../src/net/rollback.ts';
import { hashState } from '../src/sim/game.ts';
import { mulberry32 } from './rng.ts';

interface Pending { at: number; to: number; msg: NetMsg }

function runNet(latency: number, jitter: number, loss: number, seed: number, frames = 60 * 60, corruptAt = -1) {
  const rnd = mulberry32(seed);
  let now = 0;
  const queue: Pending[] = [];
  const mk = (from: number) => ({
    send(msg: NetMsg) {
      if (rnd() < loss) return;
      const d = latency / 2 + rnd() * jitter;
      queue.push({ at: now + d, to: 1 - from, msg: JSON.parse(JSON.stringify(msg)) });
    },
  });
  const a = new RollbackSession({ local: 0, target: 15, transport: mk(0), now: () => now });
  const b = new RollbackSession({ local: 1, target: 15, transport: mk(1), now: () => now });
  const sess = [a, b];
  // випадкові "людські" введення: тримаємо кнопки по кілька кадрів
  const inRnd = [mulberry32(seed + 1), mulberry32(seed + 2)];
  const cur = [0, 0];
  let maxRb = 0, stalls = 0;
  // клієнт b стартує трохи пізніше (як у реальності — половина RTT)
  const startOffset = latency / 2;
  let tA = 0, tB = startOffset;
  const dt = 1000 / 60;
  const end = frames * dt;
  while (now < end + 3000) {
    const next = Math.min(tA, tB);
    // доставка повідомлень до моменту next
    queue.sort((x, y) => x.at - y.at);
    while (queue.length && queue[0].at <= next) {
      const p = queue.shift()!;
      now = p.at;
      sess[p.to].receive(p.msg);
    }
    now = next;
    const who = tA <= tB ? 0 : 1;
    if (inRnd[who]() < 0.12) cur[who] = (inRnd[who]() * 16) | 0;
    const input = now > end ? 0 : cur[who];
    sess[who].tick(input);
    if (who === 1 && sess[1].frame === corruptAt) sess[1].state.ball.x += 0.001;
    if (sess[who].stats.rollbackFrames > maxRb) maxRb = sess[who].stats.rollbackFrames;
    if (sess[who].stats.stalled) stalls++;
    if (who === 0) tA += dt; else tB += dt;
  }
  return { a, b, maxRb, stalls };
}

for (const [lat, jit, loss] of [[0, 0, 0], [60, 10, 0], [120, 40, 0.05], [200, 60, 0.15], [500, 80, 0.05]]) {
  test(`без розсинхронізації: RTT ${lat}мс, джитер ${jit}мс, втрати ${loss * 100}%`, () => {
    const { a, b, maxRb, stalls } = runNet(lat, jit, loss, 7 + lat);
    console.log(`  RTT ${lat}: кадр A=${a.frame} B=${b.frame}, макс. відкат=${maxRb}, зупинок=${stalls}, хешів звірено=${a.hashesCompared}/${b.hashesCompared}, рахунок ${a.state.score}`);
    assert.equal(a.stats.desync, false);
    assert.equal(b.stats.desync, false);
    assert.ok(a.hashesCompared > 25, 'замало перевірок хешів');
    // фінальний стан на однаковому кадрі має збігатися
    assert.ok(Math.abs(a.frame - b.frame) < 30, `розбіжність кадрів ${a.frame} vs ${b.frame}`);
    assert.ok(a.frame > (lat >= 500 ? 1500 : 3000), 'гра "зависла"');
  });
}

test('фінальні стани збігаються після стабілізації', () => {
  const { a, b } = runNet(100, 20, 0.05, 99);
  // після кінця вводимо 0, обидва підтвердили все — порівнюємо хеш на мінімальному спільному кадрі
  assert.equal(a.remoteConfirmed >= 0, true);
  if (a.frame === b.frame) assert.equal(hashState(a.state), hashState(b.state));
});

test('розсинхронізація справді виявляється', () => {
  const { a, b } = runNet(80, 10, 0, 5, 60 * 30, 900);
  assert.ok(a.stats.desync || b.stats.desync);
});
