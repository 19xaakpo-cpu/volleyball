import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSchedule, standings, simulateBotMatch } from '../src/tournament.ts';
import type { Tournament } from '../src/tournament.ts';
import { defaultProfile } from '../src/cosmetics.ts';

test('кругова система: кожен з кожним рівно N разів, ніхто не грає сам із собою', () => {
  for (let n = 3; n <= 8; n++) {
    for (let r = 1; r <= 4; r++) {
      const ids = Array.from({ length: n }, (_, i) => i);
      const ms = makeSchedule(ids, r);
      assert.equal(ms.length, (n * (n - 1)) / 2 * r);
      const cnt = new Map<string, number>();
      for (const m of ms) {
        assert.notEqual(m.a, m.b);
        const k = [Math.min(m.a, m.b), Math.max(m.a, m.b)].join('-');
        cnt.set(k, (cnt.get(k) ?? 0) + 1);
      }
      for (const v of cnt.values()) assert.equal(v, r);
      assert.equal(cnt.size, (n * (n - 1)) / 2);
    }
  }
});

test('таблиця: перемоги, потім різниця очок', () => {
  const t: Tournament = {
    players: [0, 1, 2].map((id) => ({ id, profile: defaultProfile(id), bot: '' as const })),
    matches: [
      { id: 0, round: 1, a: 0, b: 1, score: [15, 10], status: 'done' },
      { id: 1, round: 1, a: 1, b: 2, score: [15, 3], status: 'done' },
      { id: 2, round: 1, a: 2, b: 0, score: [15, 13], status: 'done' },
    ],
    rounds: 1, target: 15, location: 'beach',
  };
  const st = standings(t);
  assert.deepEqual(st.map((s) => s.id), [1, 0, 2]); // усі по 1 перемозі; різниця: 1:+7, 0:+3, 2:-10
});

test('симуляція матчу ботів дає коректний рахунок', () => {
  for (let i = 0; i < 200; i++) {
    const [a, b] = simulateBotMatch('hard', 'easy', 11);
    const w = Math.max(a, b), l = Math.min(a, b);
    assert.ok(w >= 11 && w - l >= 2 && (w === 11 || w - l === 2));
  }
});
