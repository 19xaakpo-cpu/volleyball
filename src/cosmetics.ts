// Вигляд мішків, м'ячів, реакції, локації та профілі гравців.

import type { NetShape } from './sim/game.ts';

export const SACK_COLORS = [
  '#d9a05b', '#c9b07a', '#b5835a', '#e8743b', '#d94b4b', '#e85a9b', '#9b5de5',
  '#3f8fd8', '#2bb3c0', '#4caf50', '#8bc34a', '#f4c430', '#f5f0e1', '#6d6d6d', '#2e2e3a',
];
export const ACCENT_COLORS = [
  '#e8743b', '#3f8fd8', '#ffd500', '#0057b7', '#d94b4b', '#ffffff', '#222222',
  '#4caf50', '#9b5de5', '#e85a9b', '#2bb3c0', '#8b4513',
];

export const PATTERNS: { id: string; name: string }[] = [
  { id: 'burlap', name: 'Мішковина' },
  { id: 'stripes', name: 'Смужки' },
  { id: 'vstripes', name: 'Вертикальні смуги' },
  { id: 'dots', name: 'Горошок' },
  { id: 'checks', name: 'Клітинка' },
  { id: 'vyshyvanka', name: 'Вишиванка' },
  { id: 'camo', name: 'Камуфляж' },
  { id: 'zigzag', name: 'Зигзаг' },
  { id: 'stars', name: 'Зірочки' },
  { id: 'patches', name: 'Латки' },
];

export const LOGOS = ['', '⭐', '❤️', '🔥', '⚡', '🌻', '🐱', '🐶', '🦊', '💀', '👑', '🍀', '🥔', '🧅', '🌰', '🐝', '🚀', '⚽', '🎯', '☢️', '🍉', '🐸', '🦉', '🇺🇦'];

/** Чим наповнений мішок (видно зверху і висипається при розгромному рахунку). */
export const FILLINGS: { id: string; name: string; emoji: string }[] = [
  { id: 'potato', name: 'Картопля', emoji: '🥔' },
  { id: 'onion', name: 'Цибуля', emoji: '🧅' },
  { id: 'beet', name: 'Буряк', emoji: '' },
  { id: 'carrot', name: 'Морква', emoji: '🥕' },
  { id: 'cabbage', name: 'Капуста', emoji: '🥬' },
  { id: 'garlic', name: 'Часник', emoji: '🧄' },
  { id: 'corn', name: 'Кукурудза', emoji: '🌽' },
  { id: 'pumpkin', name: 'Гарбузи', emoji: '🎃' },
  { id: 'apple', name: 'Яблука', emoji: '🍎' },
  { id: 'pear', name: 'Груші', emoji: '🍐' },
  { id: 'orange', name: 'Апельсини', emoji: '🍊' },
  { id: 'cherry', name: 'Вишні', emoji: '🍒' },
  { id: 'nuts', name: 'Каштани', emoji: '🌰' },
  { id: 'coal', name: 'Вугілля', emoji: '' },
  { id: 'socks', name: 'Шкарпетки', emoji: '🧦' },
];

export interface Reaction {
  id: string;
  name: string;
  emoji: string;
  text: string;
  anim: 'hop' | 'wiggle' | 'spin' | 'shake' | 'flat' | 'droop' | 'puff' | 'none';
  fx: 'confetti' | 'fireworks' | 'tears' | 'steam' | 'hearts' | 'notes' | 'sweat' | 'none';
}

export const REACTIONS: Reaction[] = [
  { id: 'none', name: 'Без реакції', emoji: '', text: '', anim: 'none', fx: 'none' },
  { id: 'hop', name: 'Стрибок радості', emoji: '🎉', text: 'Є-е-е!', anim: 'hop', fx: 'confetti' },
  { id: 'dance', name: 'Танець', emoji: '💃', text: 'Тиц-тиц!', anim: 'wiggle', fx: 'notes' },
  { id: 'spin', name: 'Пірует', emoji: '🌀', text: 'Оп-па!', anim: 'spin', fx: 'none' },
  { id: 'flex', name: 'Біцепс', emoji: '💪', text: 'Вчись!', anim: 'puff', fx: 'none' },
  { id: 'laugh', name: 'Регіт', emoji: '😂', text: 'Ха-ха-ха!', anim: 'shake', fx: 'none' },
  { id: 'cool', name: 'Окуляри', emoji: '😎', text: 'Легко.', anim: 'none', fx: 'none' },
  { id: 'kiss', name: 'Повітряний поцілунок', emoji: '😘', text: 'Чмок!', anim: 'hop', fx: 'hearts' },
  { id: 'fireworks', name: 'Салют', emoji: '🎆', text: 'Перемога!', anim: 'hop', fx: 'fireworks' },
  { id: 'cry', name: 'Сльози', emoji: '😭', text: 'Ну як так?!', anim: 'droop', fx: 'tears' },
  { id: 'angry', name: 'Лють', emoji: '😡', text: 'Грр!', anim: 'shake', fx: 'steam' },
  { id: 'faint', name: 'Знепритомніти', emoji: '😵', text: 'Ой…', anim: 'flat', fx: 'none' },
  { id: 'shrug', name: 'Буває', emoji: '🤷', text: 'Буває.', anim: 'none', fx: 'none' },
  { id: 'facepalm', name: 'Фейспалм', emoji: '🤦', text: 'Ех…', anim: 'droop', fx: 'none' },
  { id: 'sweat', name: 'Ледь не…', emoji: '😅', text: 'Фух…', anim: 'none', fx: 'sweat' },
  { id: 'revenge', name: 'Ще побачимо!', emoji: '😤', text: 'Ще побачимо!', anim: 'puff', fx: 'steam' },
];

export function reactionById(id: string): Reaction {
  return REACTIONS.find((r) => r.id === id) ?? REACTIONS[0];
}

export interface Profile {
  name: string;
  color: string;
  accent: string;
  pattern: string;
  logo: string;
  winPoint: string;
  losePoint: string;
  winGame: string;
  loseGame: string;
  filling: string;
}

export function defaultProfile(i: number): Profile {
  const presets: Partial<Profile>[] = [
    { name: 'Гравець 1', color: '#d9a05b', accent: '#e8743b', pattern: 'burlap', logo: '' },
    { name: 'Гравець 2', color: '#c9b07a', accent: '#3f8fd8', pattern: 'burlap', logo: '' },
  ];
  return {
    name: `Гравець ${i + 1}`,
    color: SACK_COLORS[(i * 4) % SACK_COLORS.length],
    accent: ACCENT_COLORS[(i * 5 + 1) % ACCENT_COLORS.length],
    pattern: 'burlap',
    logo: '',
    winPoint: 'hop',
    losePoint: 'shrug',
    winGame: 'fireworks',
    loseGame: 'cry',
    filling: i === 1 ? 'onion' : 'potato',
    ...(presets[i] ?? {}),
  };
}

const BOT_NAMES = ['Картопля', 'Цибулина', 'Буряк', 'Морква', 'Капуста', 'Квасоля', 'Гарбуз', 'Часник'];

export function randomProfile(name?: string): Profile {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const posR = ['hop', 'dance', 'spin', 'flex', 'laugh', 'cool', 'kiss'];
  const negR = ['cry', 'angry', 'faint', 'shrug', 'facepalm', 'sweat', 'revenge'];
  return {
    name: name ?? pick(BOT_NAMES),
    color: pick(SACK_COLORS),
    accent: pick(ACCENT_COLORS),
    pattern: pick(PATTERNS).id,
    logo: pick(LOGOS),
    winPoint: pick(posR),
    losePoint: pick(negR),
    winGame: pick(['fireworks', 'hop', 'dance', 'kiss']),
    loseGame: pick(['cry', 'faint', 'revenge', 'facepalm']),
    filling: pick(FILLINGS).id,
  };
}

export function botProfile(diff: string, seed = 0): Profile {
  const looks: Record<string, Partial<Profile>> = {
    easy: { name: 'Бот Картопля', color: '#b5835a', accent: '#8bc34a', pattern: 'patches', logo: '🥔' },
    normal: { name: 'Бот Цибуля', color: '#f4c430', accent: '#e8743b', pattern: 'stripes', logo: '🧅' },
    hard: { name: 'Бот Буряк', color: '#9b2d5a', accent: '#4caf50', pattern: 'zigzag', logo: '💀' },
  };
  const base = { ...defaultProfile(seed), ...looks[diff] };
  base.winPoint = 'laugh';
  base.losePoint = 'angry';
  base.winGame = 'flex';
  base.loseGame = 'faint';
  base.filling = diff === 'easy' ? 'potato' : diff === 'normal' ? 'onion' : 'beet';
  return base;
}

export function sanitizeProfile(p: any, fallback: Profile): Profile {
  if (!p || typeof p !== 'object') return fallback;
  const str = (v: any, d: string, max = 24) => (typeof v === 'string' ? v.slice(0, max) : d);
  const col = (v: any, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  return {
    name: str(p.name, fallback.name, 16).trim() || fallback.name,
    color: col(p.color, fallback.color),
    accent: col(p.accent, fallback.accent),
    pattern: PATTERNS.some((x) => x.id === p.pattern) ? p.pattern : fallback.pattern,
    logo: LOGOS.includes(p.logo) ? p.logo : fallback.logo,
    winPoint: REACTIONS.some((r) => r.id === p.winPoint) ? p.winPoint : fallback.winPoint,
    losePoint: REACTIONS.some((r) => r.id === p.losePoint) ? p.losePoint : fallback.losePoint,
    winGame: REACTIONS.some((r) => r.id === p.winGame) ? p.winGame : fallback.winGame,
    loseGame: REACTIONS.some((r) => r.id === p.loseGame) ? p.loseGame : fallback.loseGame,
    filling: FILLINGS.some((f) => f.id === p.filling) ? p.filling : fallback.filling,
  };
}

export function loadProfile(slot: number): Profile {
  const d = defaultProfile(slot);
  try {
    const raw = localStorage.getItem(`mishkobol-profile-${slot}`);
    if (raw) return sanitizeProfile(JSON.parse(raw), d);
  } catch { /* ignore */ }
  return d;
}

export function saveProfile(slot: number, p: Profile) {
  try { localStorage.setItem(`mishkobol-profile-${slot}`, JSON.stringify(p)); } catch { /* ignore */ }
}

// ---------- м'ячі ----------

export const BALL_PATTERNS: { id: string; name: string }[] = [
  { id: 'volley', name: 'Волейбольний' },
  { id: 'beach', name: 'Пляжний (сегменти)' },
  { id: 'band', name: 'Гумовий зі смугою' },
  { id: 'stripes', name: 'Смужки' },
  { id: 'dots', name: 'Горошок' },
  { id: 'soccer', name: 'Футбольний' },
  { id: 'tennis', name: 'Тенісний шов' },
  { id: 'solid', name: 'Однотонний' },
];

export const BALL_LOGOS = ['', 'М', '⭐', '🌰', '⛏️', '❤️', '🔥', '⚡', '🌻', '🇺🇦', '💀', '👁️', '😃'];

export interface BallDesign {
  pattern: string;
  c1: string; // основний
  c2: string;
  c3: string;
  logo: string;
}

export const BALL_PRESETS: Record<string, { name: string; ball: BallDesign }> = {
  beach: { name: 'Пляжний', ball: { pattern: 'beach', c1: '#fbfbf6', c2: '#ff6f3c', c3: '#2bb3c0', logo: '' } },
  pro: { name: 'Професійний', ball: { pattern: 'volley', c1: '#f5c400', c2: '#1d4fa0', c3: '#ffffff', logo: '' } },
  coal: { name: 'Шахтарський', ball: { pattern: 'band', c1: '#2e2e33', c2: '#f39c12', c3: '#2e2e33', logo: '⛏️' } },
  kyiv: { name: 'Київський', ball: { pattern: 'volley', c1: '#ffd500', c2: '#0057b7', c3: '#ffd500', logo: '🌰' } },
  metro: { name: 'Метро', ball: { pattern: 'solid', c1: '#d6262b', c2: '#ffffff', c3: '#d6262b', logo: 'М' } },
  rubber: { name: 'Гумовий з дитинства', ball: { pattern: 'band', c1: '#d94b4b', c2: '#f5f0e1', c3: '#3f6fd8', logo: '' } },
  classic: { name: 'Класичний', ball: { pattern: 'volley', c1: '#fbfbf6', c2: '#2f6fd6', c3: '#f4c430', logo: '' } },
  football: { name: 'Футбольний', ball: { pattern: 'soccer', c1: '#fbfbf6', c2: '#222222', c3: '#222222', logo: '' } },
  tennis: { name: 'Тенісний', ball: { pattern: 'tennis', c1: '#d7f04a', c2: '#ffffff', c3: '#d7f04a', logo: '' } },
};

// ---------- локації ----------

export interface Location {
  id: string;
  name: string;
  net: NetShape;
  ball: string; // пресет м'яча за замовчуванням
  netName: string;
}

export const LOCATIONS: Location[] = [
  { id: 'beach', name: '🏖️ Пляж', net: { half: 6, cap: 6 }, ball: 'beach', netName: 'волейбольна сітка' },
  { id: 'court', name: '🏟️ Корт із глядачами', net: { half: 5, cap: 5 }, ball: 'pro', netName: 'волейбольна сітка' },
  { id: 'lysychansk', name: '⛏️ Лисичанськ', net: { half: 9, cap: 9 }, ball: 'coal', netName: 'дерев\'яний стовп' },
  { id: 'kyiv', name: '🏙️ Київ, Хрещатик', net: { half: 4, cap: 17 }, ball: 'kyiv', netName: 'знак «Зупинку заборонено»' },
  { id: 'metro', name: '🚇 Метро «Хрещатик»', net: { half: 4, cap: 17 }, ball: 'metro', netName: 'покажчик «М»' },
  { id: 'yard', name: '🏚️ Двір хрущовки', net: { half: 15, cap: 15 }, ball: 'rubber', netName: 'стовпчик із шин' },
];

export function locationById(id: string): Location {
  return LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];
}

export interface GameLook {
  location: string;
  ball: BallDesign;
  profiles: [Profile, Profile];
}

export function resolveBall(choice: string, custom: BallDesign, location: string): BallDesign {
  if (choice === 'custom') return custom;
  if (choice !== 'default' && BALL_PRESETS[choice]) return BALL_PRESETS[choice].ball;
  return BALL_PRESETS[locationById(location).ball].ball;
}

export function sanitizeBall(b: any): BallDesign {
  const d = BALL_PRESETS.classic.ball;
  if (!b || typeof b !== 'object') return d;
  const col = (v: any, x: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : x);
  return {
    pattern: BALL_PATTERNS.some((p) => p.id === b.pattern) ? b.pattern : d.pattern,
    c1: col(b.c1, d.c1), c2: col(b.c2, d.c2), c3: col(b.c3, d.c3),
    logo: BALL_LOGOS.includes(b.logo) ? b.logo : '',
  };
}
