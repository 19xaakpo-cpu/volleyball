// Стан повітряної тривоги в Києві (для локації "Київ" — під час тривоги гра переходить у метро).
// Джерело: відкритий API ubilling.net.ua/aerialalerts. Воно не віддає CORS-заголовків,
// тому, якщо прямий запит заблоковано, пробуємо через публічний CORS-проксі.

const SOURCE = 'https://ubilling.net.ua/aerialalerts/';
const URLS = [SOURCE, 'https://api.allorigins.win/raw?url=' + encodeURIComponent(SOURCE)];
const REGION = 'м. Київ';

export type AlertState = 'unknown' | 'alert' | 'clear';

let state: AlertState = 'unknown';
let lastCheck = 0;
let inflight: Promise<AlertState> | null = null;

async function fetchOnce(): Promise<AlertState> {
  for (const u of URLS) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      const st = j?.states?.[REGION];
      if (st && typeof st.alertnow === 'boolean') return st.alertnow ? 'alert' : 'clear';
    } catch { /* пробуємо наступне джерело */ }
  }
  return 'unknown';
}

/** Повертає поточний відомий стан і, якщо минуло > 60 с, оновлює його у фоні. */
export function kyivAlert(): AlertState {
  const now = Date.now();
  if (!inflight && now - lastCheck > 60000) {
    lastCheck = now;
    inflight = fetchOnce().then((s) => {
      if (s !== 'unknown' || state === 'unknown') state = s;
      inflight = null;
      return s;
    });
  }
  return state;
}

export async function refreshKyivAlert(): Promise<AlertState> {
  lastCheck = 0;
  kyivAlert();
  if (inflight) await inflight;
  return state;
}
