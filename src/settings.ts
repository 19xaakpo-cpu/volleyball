import { BALL_PRESETS, LOCATIONS, sanitizeBall } from './cosmetics.ts';
import type { BallDesign } from './cosmetics.ts';

export interface Settings {
  target: number;
  location: string;
  ballChoice: string; // 'default' | ключ пресету | 'custom'
  ballCustom: BallDesign;
}

const KEY = 'mishkobol-settings';

export function loadSettings(): Settings {
  const d: Settings = { target: 15, location: 'beach', ballChoice: 'default', ballCustom: { ...BALL_PRESETS.classic.ball } };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if ([7, 11, 15, 21].includes(j.target)) d.target = j.target;
      if (LOCATIONS.some((l) => l.id === j.location)) d.location = j.location;
      if (typeof j.ballChoice === 'string' && (j.ballChoice === 'default' || j.ballChoice === 'custom' || BALL_PRESETS[j.ballChoice])) d.ballChoice = j.ballChoice;
      d.ballCustom = sanitizeBall(j.ballCustom);
    }
  } catch { /* ignore */ }
  return d;
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
