// Турнір за круговою системою (кожен з кожним, N кіл).

import type { Profile } from './cosmetics.ts';

export interface TPlayer {
  id: number;
  profile: Profile;
  bot: '' | 'easy' | 'normal' | 'hard';
  /** для мережевого турніру: peer-id учасника (порожній для бота) */
  peer?: string;
  left?: boolean;
}

export interface TMatch {
  id: number;
  round: number;
  a: number; // id гравця зліва
  b: number; // id гравця справа
  score: [number, number] | null;
  live?: [number, number];
  status: 'pending' | 'playing' | 'done';
  note?: string;
}

export interface Tournament {
  players: TPlayer[];
  matches: TMatch[];
  rounds: number;
  target: number;
  location: string;
}

/** Розклад: "метод кола". Кожне наступне коло — з поміняними сторонами. */
export function makeSchedule(ids: number[], rounds: number): TMatch[] {
  const list = [...ids];
  if (list.length % 2 === 1) list.push(-1); // "вільний" гравець
  const n = list.length;
  const out: TMatch[] = [];
  let mid = 0;
  for (let r = 0; r < rounds; r++) {
    const arr = [...list];
    for (let day = 0; day < n - 1; day++) {
      for (let i = 0; i < n / 2; i++) {
        const x = arr[i], y = arr[n - 1 - i];
        if (x === -1 || y === -1) continue;
        const swap = (day + r) % 2 === 1;
        out.push({ id: mid++, round: r + 1, a: swap ? y : x, b: swap ? x : y, score: null, status: 'pending' });
      }
      // обертаємо всіх, крім першого
      arr.splice(1, 0, arr.pop()!);
    }
  }
  return out;
}

export interface Standing {
  id: number;
  played: number;
  wins: number;
  losses: number;
  pf: number;
  pa: number;
}

export function standings(t: Tournament): Standing[] {
  const m = new Map<number, Standing>();
  for (const p of t.players) m.set(p.id, { id: p.id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0 });
  for (const x of t.matches) {
    if (!x.score) continue;
    const a = m.get(x.a)!, b = m.get(x.b)!;
    a.played++; b.played++;
    a.pf += x.score[0]; a.pa += x.score[1];
    b.pf += x.score[1]; b.pa += x.score[0];
    if (x.score[0] > x.score[1]) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
  }
  return [...m.values()].sort((p, q) =>
    q.wins - p.wins || (q.pf - q.pa) - (p.pf - p.pa) || q.pf - p.pf || p.id - q.id);
}

export function isFinished(t: Tournament) {
  return t.matches.every((m) => m.status === 'done');
}

export function nextLocalMatch(t: Tournament): TMatch | null {
  return t.matches.find((m) => m.status !== 'done') ?? null;
}

/** Швидкий результат матчу бот-проти-бота: розіграші з імовірністю за рівнем. */
export function simulateBotMatch(da: string, db: string, target: number): [number, number] {
  const skill: Record<string, number> = { easy: 1, normal: 1.6, hard: 2.4 };
  const pa = skill[da] / (skill[da] + skill[db]);
  const s: [number, number] = [0, 0];
  let serve = 0;
  for (let i = 0; i < 500; i++) {
    // перевага подачі невелика
    const p = pa + (serve === 0 ? 0.03 : -0.03);
    const w = Math.random() < p ? 0 : 1;
    s[w]++;
    serve = w;
    if (s[w] >= target && s[w] - s[1 - w] >= 2) break;
  }
  return s;
}

export function forfeitScore(target: number, winnerIsA: boolean): [number, number] {
  return winnerIsA ? [target, 0] : [0, target];
}
