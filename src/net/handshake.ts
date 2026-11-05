// "Рукостискання" перед мережевим матчем: обмін налаштуваннями та виглядом мішків.

import { sanitizeBall, sanitizeProfile, defaultProfile, LOCATIONS } from '../cosmetics.ts';
import type { BallDesign, Profile } from '../cosmetics.ts';
import type { Link } from './peer.ts';
import type { NetMsg } from './rollback.ts';

export const PROTO = 2;
declare const __SIM_HASH__: string;
/** відбиток фізики: різні версії гри не повинні грати разом */
export const SIM_HASH: string = typeof __SIM_HASH__ !== 'undefined' ? __SIM_HASH__ : 'dev';

export interface MatchSetup {
  target: number;
  location: string;
  ball: BallDesign;
}

export interface HandshakeResult extends MatchSetup {
  side: number;
  delay: number;
  me: Profile;
  opp: Profile;
  early: NetMsg[];
}

function delayFor(rtt: number) {
  if (rtt < 50) return 1;
  if (rtt < 110) return 2;
  if (rtt < 200) return 3;
  return 4;
}

/** Сторона, що приймає з'єднання (грає зліва). */
export function handshakeHost(link: Link, setup: MatchSetup, me: Profile, extra: Record<string, unknown>,
  onStart: (r: HandshakeResult) => void, onFail: (why: string) => void) {
  let started = false;
  const hello = () => link.send({ t: 'hello', v: PROTO, sim: SIM_HASH, ...setup, profile: me, ts: performance.now(), ...extra });
  const iv = setInterval(hello, 200);
  hello();
  link.onMessage = (m: any) => {
    if (m?.t === 'ready' && !started) {
      started = true;
      clearInterval(iv);
      const delay = delayFor(performance.now() - m.ts);
      link.send({ t: 'start', delay, target: setup.target });
      onStart({ ...setup, side: 0, delay, me, opp: sanitizeProfile(m.profile, defaultProfile(1)), early: [] });
    } else if (m?.t === 'badver') {
      clearInterval(iv);
      onFail('Різні версії гри. Попросіть суперника оновити сторінку.');
      link.close();
    }
  };
  link.onClose = (r) => { clearInterval(iv); if (!started) onFail(r); };
  return () => clearInterval(iv);
}

/** Сторона, що підключається (грає справа). */
export function handshakeGuest(link: Link, me: Profile, onStart: (r: HandshakeResult) => void, onFail: (why: string) => void,
  onHello?: (m: any) => void) {
  let started = false;
  let hello: any = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  const early: NetMsg[] = [];
  link.onMessage = (m: any) => {
    if (!m || started) return;
    if (m.t === 'hello') {
      if (m.v !== PROTO || m.sim !== SIM_HASH) {
        link.send({ t: 'badver' });
        onFail('Різні версії гри. Оновіть сторінку (Ctrl+F5) і спробуйте ще раз.');
        return;
      }
      if (!hello) onHello?.(m);
      hello = m;
      const send = () => link.send({ t: 'ready', ts: hello.ts, profile: me });
      send();
      if (!iv) iv = setInterval(send, 250);
    } else if (m.t === 'start' && hello) {
      started = true;
      if (iv) clearInterval(iv);
      onStart({
        target: [7, 11, 15, 21].includes(m.target) ? m.target : 15,
        location: LOCATIONS.some((l) => l.id === hello.location) ? hello.location : 'beach',
        ball: sanitizeBall(hello.ball),
        side: 1,
        delay: Math.max(1, Math.min(4, m.delay | 0)),
        me,
        opp: sanitizeProfile(hello.profile, defaultProfile(0)),
        early,
      });
    } else if (m.t === 'in' || m.t === 'ping' || m.t === 'hash') {
      early.push(m);
    }
  };
  link.onClose = (r) => { if (iv) clearInterval(iv); if (!started) onFail(r); };
}
