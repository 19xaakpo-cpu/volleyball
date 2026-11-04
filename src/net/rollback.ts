// Rollback-сесія (схема GGPO): обмінюємося лише введенням,
// свій хід застосовуємо одразу, хід суперника передбачаємо,
// а при помилці прогнозу відкочуємось і пересимульовуємо.

import { cloneState, createGame, hashState, step } from '../sim/game.ts';
import type { GameEvent, GameState, NetShape } from '../sim/game.ts';

export interface Transport {
  send(msg: NetMsg): void;
}

export type NetMsg =
  | { t: 'in'; s: number; i: number[]; a: number; f: number; adv: number }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'hash'; f: number; h: number };

const RING = 128;
const MAX_PREDICTION = 12;
const MAX_SEND = 64;
const HASH_EVERY = 60;

export interface SessionStats {
  rtt: number;
  rollbackFrames: number;
  stalled: boolean;
  desync: boolean;
  advantage: number;
  lastRecv: number;
}

export class RollbackSession {
  readonly local: number;
  readonly remote: number;
  state: GameState;
  /** номер кадру, який буде симульовано наступним */
  frame = 0;
  inputDelay: number;

  private localInputs = new Int32Array(RING).fill(-1);
  private localInputFrame = new Int32Array(RING).fill(-1);
  private remoteInputs = new Int32Array(RING);
  private remoteInputFrame = new Int32Array(RING).fill(-1);
  private usedRemote = new Int32Array(RING);
  private saved: (GameState | null)[] = new Array(RING).fill(null);
  private lastLocalInputFrame = -1;
  /** останній кадр, до якого включно маємо всі справжні введення суперника */
  remoteConfirmed = -1;
  /** до якого кадру суперник підтвердив наші введення */
  private remoteAck = -1;
  private rollbackFrom = -1;
  private maxSimulated = -1;
  private remoteFrame = 0;
  private remoteAdv = 0;
  private localAdv = 0;
  private skipCooldown = 0;

  private myHashes = new Map<number, number>();
  private theirHashes = new Map<number, number>();
  private hashedUpTo = 0;
  private outHashes: { f: number; h: number }[] = [];

  stats: SessionStats = { rtt: 0, rollbackFrames: 0, stalled: false, desync: false, advantage: 0, lastRecv: 0 };
  private transport: Transport;
  private now: () => number;
  private lastPing = -1e9;

  constructor(opts: { local: number; target: number; transport: Transport; inputDelay?: number; now?: () => number; net?: NetShape }) {
    this.local = opts.local;
    this.remote = 1 - opts.local;
    this.state = createGame(opts.target, 0, opts.net);
    this.transport = opts.transport;
    this.inputDelay = opts.inputDelay ?? 2;
    this.now = opts.now ?? (() => performance.now());
    this.stats.lastRecv = this.now();
    for (let f = 0; f < this.inputDelay; f++) this.setLocal(f, 0);
  }

  private setLocal(f: number, v: number) {
    const i = f % RING;
    this.localInputs[i] = v;
    this.localInputFrame[i] = f;
    this.lastLocalInputFrame = f;
  }

  private getLocal(f: number): number {
    const i = f % RING;
    return this.localInputFrame[i] === f ? this.localInputs[i] : 0;
  }

  private getRemote(f: number): number {
    if (f <= this.remoteConfirmed) {
      const i = f % RING;
      return this.remoteInputFrame[i] === f ? this.remoteInputs[i] : 0;
    }
    // прогноз: суперник тисне те саме, що в останньому відомому кадрі
    if (this.remoteConfirmed < 0) return 0;
    const i = this.remoteConfirmed % RING;
    return this.remoteInputs[i];
  }

  receive(msg: NetMsg) {
    this.stats.lastRecv = this.now();
    switch (msg.t) {
      case 'ping':
        this.transport.send({ t: 'pong', ts: msg.ts });
        return;
      case 'pong': {
        const rtt = this.now() - msg.ts;
        this.stats.rtt = this.stats.rtt === 0 ? rtt : this.stats.rtt * 0.8 + rtt * 0.2;
        return;
      }
      case 'hash':
        this.theirHashes.set(msg.f, msg.h);
        this.checkHash(msg.f);
        return;
      case 'in': {
        if (msg.a > this.remoteAck) this.remoteAck = msg.a;
        if (msg.f > this.remoteFrame) this.remoteFrame = msg.f;
        this.remoteAdv = msg.adv;
        for (let k = 0; k < msg.i.length; k++) {
          const f = msg.s + k;
          if (f <= this.remoteConfirmed) continue;
          if (f !== this.remoteConfirmed + 1) break; // пропуск — чекаємо повтору
          const idx = f % RING;
          this.remoteInputs[idx] = msg.i[k];
          this.remoteInputFrame[idx] = f;
          this.remoteConfirmed = f;
          if (f < this.frame && this.usedRemote[idx] !== msg.i[k]) {
            if (this.rollbackFrom < 0 || f < this.rollbackFrom) this.rollbackFrom = f;
          }
        }
        return;
      }
    }
  }

  private simulate(f: number, events: GameEvent[] | null) {
    const idx = f % RING;
    this.saved[idx] = cloneState(this.state);
    const li = this.getLocal(f);
    const ri = this.getRemote(f);
    this.usedRemote[idx] = ri;
    if (this.local === 0) step(this.state, li, ri, events);
    else step(this.state, ri, li, events);
  }

  private checkHash(f: number) {
    const a = this.myHashes.get(f);
    const b = this.theirHashes.get(f);
    if (a !== undefined && b !== undefined) {
      if (a !== b) this.stats.desync = true;
      this.hashesCompared++;
      this.myHashes.delete(f);
      this.theirHashes.delete(f);
    }
  }

  /** Кількість перевірених хешів (для тестів). */
  hashesCompared = 0;

  /**
   * Викликається 60 разів на секунду. Повертає події нових кадрів (для звуку/ефектів).
   */
  tick(localInput: number): GameEvent[] {
    const events: GameEvent[] = [];
    const now = this.now();
    if (now - this.lastPing > 500) {
      this.lastPing = now;
      this.transport.send({ t: 'ping', ts: now });
    }

    // 1. Відкат, якщо прогноз виявився хибним
    this.stats.rollbackFrames = 0;
    if (this.rollbackFrom >= 0) {
      const from = this.rollbackFrom;
      this.rollbackFrom = -1;
      const snap = this.saved[from % RING];
      if (snap && snap.frame === from) {
        this.state = cloneState(snap);
        const to = this.frame;
        for (let f = from; f < to; f++) this.simulate(f, null);
        this.stats.rollbackFrames = to - from;
      }
    }

    // хеш стану для кадрів, де введення обох уже підтверджені
    for (;;) {
      const n = this.hashedUpTo + HASH_EVERY;
      if (n - 1 > this.remoteConfirmed || n >= this.frame) break;
      const snap = this.saved[n % RING];
      if (!snap || snap.frame !== n) { this.hashedUpTo = n; continue; }
      const h = hashState(snap);
      this.hashedUpTo = n;
      this.myHashes.set(n, h);
      this.outHashes.push({ f: n, h });
      this.checkHash(n);
    }

    // 2. Синхронізація часу: якщо ми суттєво попереду — пропускаємо кадр
    const rttFrames = this.stats.rtt / (1000 / 60);
    this.localAdv = this.frame - (this.remoteFrame + rttFrames / 2);
    this.stats.advantage = this.localAdv;
    let skip = false;
    if (this.skipCooldown > 0) this.skipCooldown--;
    else if (this.frame > 30 && (this.localAdv - this.remoteAdv) / 2 >= 1) {
      skip = true;
      this.skipCooldown = 6;
    }

    // 3. Чи можна йти вперед (не забігаємо далі ніж MAX_PREDICTION кадрів)
    const stalled = this.frame - this.remoteConfirmed > MAX_PREDICTION;
    this.stats.stalled = stalled;

    if (!stalled && !skip) {
      const lf = this.frame + this.inputDelay;
      if (lf > this.lastLocalInputFrame) this.setLocal(lf, localInput);
      const firstTime = this.frame > this.maxSimulated;
      this.simulate(this.frame, firstTime ? events : null);
      if (firstTime) this.maxSimulated = this.frame;
      this.frame++;
    }

    // 4. Надсилаємо наші введення, які суперник ще не підтвердив (надлишково — на випадок втрат)
    // завжди від першого непідтвердженого кадру (інакше в суперника з'явиться "дірка")
    const start = this.remoteAck + 1;
    const end = Math.min(this.lastLocalInputFrame, start + MAX_SEND - 1);
    const arr: number[] = [];
    for (let f = start; f <= end; f++) arr.push(this.getLocal(f));
    this.transport.send({ t: 'in', s: start, i: arr, a: this.remoteConfirmed, f: this.frame, adv: this.localAdv });

    // 5. Хеші для виявлення розсинхронізації
    for (const o of this.outHashes) this.transport.send({ t: 'hash', f: o.f, h: o.h });
    this.outHashes.length = 0;
    return events;
  }
}
