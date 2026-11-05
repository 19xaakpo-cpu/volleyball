import {
  BALL_R, CROUCH_RX, CROUCH_RY, GROUND, H, MAX_TOUCHES, NET_X,
  PH_OVER, PH_POINT, PH_SERVE, SACK_RX, SACK_RY, W,
} from './sim/game.ts';
import type { GameEvent, GameState } from './sim/game.ts';
import { reactionById } from './cosmetics.ts';
import type { GameLook, Reaction } from './cosmetics.ts';
import { drawBall, drawFilling, drawSack } from './draw.ts';
import type { Face } from './draw.ts';
import { SceneRenderer } from './scenes.ts';

export interface DrawInfo {
  names: [string, string];
  /** чий це пристрій (для підписів "ви") — -1 якщо обидва локальні */
  localSide: number;
  ping?: number;
  stalled?: boolean;
  debug?: string;
  hint?: string;
  /** фактична сцена (напр. 'metro' під час тривоги в Києві) */
  scene: string;
  banner?: string;
  overText?: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number; kind: 'dot' | 'rect' | 'text'; text?: string; g: number;
}
interface Popup { text: string; x: number; y: number; life: number; color: string }
interface ActiveReaction { r: Reaction; t: number; dur: number }

const MOOD: Record<string, Face> = {
  hop: 'happy', dance: 'happy', spin: 'happy', flex: 'happy', fireworks: 'happy',
  laugh: 'laugh', cool: 'cool', kiss: 'kiss', cry: 'sad', facepalm: 'sad', angry: 'angry',
  revenge: 'angry', faint: 'dizzy', shrug: 'normal', sweat: 'normal',
};

export class Renderer {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private crouchVis = [0, 0];
  private squash = [0, 0];
  private prevVy = [0, 0];
  private blink = [0, 0];
  private ballAngle = 0;
  private trail: { x: number; y: number }[] = [];
  private spills: { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; id: string; size: number }[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shake = 0;
  private time = 0;
  private reactions: (ActiveReaction | null)[] = [null, null];
  private scenes = new SceneRenderer();
  private bannerX = 0;
  look: GameLook;

  constructor(c: HTMLCanvasElement, look: GameLook) {
    this.c = c;
    this.g = c.getContext('2d')!;
    this.look = look;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.c.width = Math.round(w * this.dpr);
    this.c.height = Math.round(h * this.dpr);
    this.scale = Math.min(w / W, h / H);
    this.ox = (w - W * this.scale) / 2;
    this.oy = (h - H * this.scale) / 2;
  }

  reset() {
    this.reactions = [null, null];
    this.particles = [];
    this.spills = [];
    this.popups = [];
  }

  private react(p: number, id: string, dur: number) {
    const r = reactionById(id);
    this.reactions[p] = r.id === 'none' ? null : { r, t: 0, dur };
  }

  onEvents(events: GameEvent[], s: GameState, localSide: number) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          if (e.super) {
            for (let i = 0; i < 26; i++) this.spark(e.x, e.y, i % 2 ? '#ffd76a' : '#ff7a3c', 4);
            this.shake = Math.max(this.shake, e.spike ? 9 : 6);
            break;
          }
          const n = 6 + Math.min(10, e.speed | 0);
          for (let i = 0; i < n; i++) this.spark(e.x, e.y, e.pop ? '#bff3ff' : '#fff6d8', 3);
          if (e.speed > 14) this.shake = Math.max(this.shake, 4);
          break;
        }
        case 'jump': {
          if (e.super) {
            const k = s.players[e.p];
            for (let i = 0; i < 18; i++) this.spark(k.x + (Math.random() - 0.5) * 80, GROUND - 2, 'rgba(240,220,170,0.95)', 4, true);
          }
          break;
        }
        case 'dash': {
          const k = s.players[e.p];
          for (let i = 0; i < 12; i++) this.spark(k.x - e.dir * 30, GROUND - 4, 'rgba(230,210,170,0.9)', 4, true);
          break;
        }
        case 'floor':
          for (let i = 0; i < 16; i++) this.spark(e.x, GROUND - 2, '#e8cf98', 4, true);
          this.shake = Math.max(this.shake, 5);
          break;
        case 'net':
          for (let i = 0; i < 5; i++) this.spark(e.x, e.y, '#ffffff', 2);
          break;
        case 'point': {
          const pw = this.look.profiles[e.winner], pl = this.look.profiles[1 - e.winner];
          this.react(e.winner, pw.winPoint, 78);
          this.react(1 - e.winner, pl.losePoint, 78);
          // розгромний рахунок — з мішка того, хто програє, висипається начинка
          const gap = s.score[e.winner] - s.score[1 - e.winner];
          if (gap >= 4) this.spill(s, 1 - e.winner, Math.min(16, 4 + (gap - 4) * 3));
          this.scenes.cheer = 1;
          break;
        }
        case 'over': {
          const pw = this.look.profiles[e.winner], pl = this.look.profiles[1 - e.winner];
          this.react(e.winner, pw.winGame, 1e9);
          this.react(1 - e.winner, pl.loseGame, 1e9);
          this.scenes.cheer = 1;
          break;
        }
        case 'serve':
          this.reactions = [null, null];
          break;
      }
    }
  }

  private spill(s: GameState, p: number, n: number) {
    const k = s.players[p];
    const id = this.look.profiles[p].filling;
    for (let i = 0; i < n; i++) {
      this.spills.push({
        x: k.x + (Math.random() - 0.5) * 20, y: k.y - SACK_RY + 4,
        vx: (Math.random() - 0.5) * 7, vy: -4 - Math.random() * 5,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        life: 220 + Math.random() * 60, id, size: 16 + Math.random() * 6,
      });
    }
    if (this.spills.length > 80) this.spills.splice(0, this.spills.length - 80);
  }

  private drawSpills() {
    const g = this.g;
    for (let i = this.spills.length - 1; i >= 0; i--) {
      const o = this.spills[i];
      o.life--;
      if (o.life <= 0) { this.spills.splice(i, 1); continue; }
      o.vy += 0.35;
      o.x += o.vx;
      o.y += o.vy;
      o.rot += o.vr;
      const floor = GROUND - o.size * 0.35;
      if (o.y > floor) {
        o.y = floor;
        o.vy = -o.vy * 0.35;
        o.vx *= 0.75;
        o.vr *= 0.7;
        if (Math.abs(o.vy) < 0.8) o.vy = 0;
      }
      if (o.x < 10 || o.x > W - 10) o.vx = -o.vx;
      g.globalAlpha = Math.min(1, o.life / 40);
      drawFilling(g, o.id, o.x, o.y, o.size, o.rot);
    }
    g.globalAlpha = 1;
  }

  private spark(x: number, y: number, color: string, size: number, up = false) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 4;
    this.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: up ? -Math.abs(Math.sin(a) * sp) - 1 : Math.sin(a) * sp,
      life: 0, max: 20 + Math.random() * 20, color, size: size * (0.5 + Math.random()), kind: 'dot', g: 0.15,
    });
  }

  private fx(kind: string, x: number, top: number, face: number, t: number) {
    const R = Math.random;
    switch (kind) {
      case 'confetti':
        if (t % 3 === 0) for (let i = 0; i < 3; i++) this.particles.push({ x: x + (R() - 0.5) * 60, y: top - 10, vx: (R() - 0.5) * 5, vy: -3 - R() * 4, life: 0, max: 60, color: ['#ff5a4f', '#ffd76a', '#58b7ff', '#7bdc6b', '#e85a9b'][(R() * 5) | 0], size: 3 + R() * 2, kind: 'rect', g: 0.12 });
        break;
      case 'fireworks':
        if (t % 18 === 0) {
          const cx = x + (R() - 0.5) * 160, cy = top - 80 - R() * 80;
          const col = ['#ff5a4f', '#ffd76a', '#58b7ff', '#7bdc6b', '#e85a9b'][(R() * 5) | 0];
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2;
            this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * 3.5, vy: Math.sin(a) * 3.5, life: 0, max: 45, color: col, size: 2.5, kind: 'dot', g: 0.05 });
          }
        }
        break;
      case 'tears':
        if (t % 4 === 0) for (const s of [-1, 1]) this.particles.push({ x: x + face * 18 + s * 11, y: top + 30, vx: s * (1 + R()), vy: -1, life: 0, max: 40, color: '#6cc6ff', size: 3, kind: 'dot', g: 0.2 });
        break;
      case 'steam':
        if (t % 5 === 0) this.particles.push({ x: x + (R() - 0.5) * 20, y: top - 12, vx: (R() - 0.5) * 1.5, vy: -1.5 - R(), life: 0, max: 40, color: 'rgba(230,230,230,0.8)', size: 6 + R() * 4, kind: 'dot', g: -0.01 });
        break;
      case 'hearts':
        if (t % 9 === 0) this.particles.push({ x: x + face * 30, y: top + 10, vx: face * (1 + R()), vy: -1.5, life: 0, max: 60, color: '#ff4d6d', size: 18, kind: 'text', text: '❤', g: -0.01 });
        break;
      case 'notes':
        if (t % 10 === 0) this.particles.push({ x: x + (R() - 0.5) * 50, y: top - 5, vx: (R() - 0.5) * 2, vy: -1.2, life: 0, max: 60, color: '#fff', size: 18, kind: 'text', text: R() < 0.5 ? '♪' : '♫', g: -0.005 });
        break;
      case 'sweat':
        if (t % 14 === 0) this.particles.push({ x: x - face * 30, y: top + 15, vx: -face * 0.5, vy: 0, life: 0, max: 35, color: '#9fe0ff', size: 3.5, kind: 'dot', g: 0.15 });
        break;
    }
  }

  draw(s: GameState, info: DrawInfo, dt: number) {
    this.time += dt;
    const g = this.g;
    const cw = this.c.width / this.dpr, ch = this.c.height / this.dpr;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#141b31';
    g.fillRect(0, 0, cw, ch);

    let sx = 0, sy = 0;
    if (this.shake > 0.1) {
      sx = (Math.random() * 2 - 1) * this.shake;
      sy = (Math.random() * 2 - 1) * this.shake;
      this.shake *= 0.85;
    }
    g.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * (this.ox + sx * this.scale), this.dpr * (this.oy + sy * this.scale));
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();

    this.scenes.drawBack(g, info.scene, this.dpr * this.scale, this.time, [s.score[0], s.score[1]]);
    for (let p = 0; p < 2; p++) this.shadow(s.players[p].x, s.players[p].y, SACK_RX, 0.28);
    // тінь м'яча — завжди на підлозі, навіть коли м'яч над екраном
    this.shadow(s.ball.x, s.ball.y + BALL_R, BALL_R * 0.9, 0.3);
    this.scenes.drawNet(g, info.scene === 'metro' && this.look.location === 'kyiv' ? 'metro' : info.scene, s.net);
    this.drawSpills();
    for (let p = 0; p < 2; p++) this.drawPlayer(s, p);
    this.drawTrail(s);
    drawBall(g, this.look.ball, s.ball.x, s.ball.y, BALL_R, (this.ballAngle += (s.ball.vx / BALL_R) * dt * 30));
    this.drawParticles();
    if (s.ball.y < -BALL_R) this.offscreenMarker(s);
    if (info.banner) this.drawBanner(info.banner);
    this.drawHud(s, info);
    g.restore();
  }

  /** "Вогняний" слід за м'ячем, коли його розігнали суперударами. */
  private drawTrail(s: GameState) {
    const g = this.g;
    this.trail.push({ x: s.ball.x, y: s.ball.y });
    if (this.trail.length > 10) this.trail.shift();
    const k = (s.boost - 1) / 0.6; // 0..1
    if (k <= 0.01) return;
    for (let i = 0; i < this.trail.length - 1; i++) {
      const t = this.trail[i];
      const a = (i / this.trail.length) * 0.55 * Math.min(1, k + 0.25);
      g.fillStyle = `rgba(255,${(150 - k * 90) | 0},40,${a})`;
      g.beginPath();
      g.arc(t.x, t.y, BALL_R * (0.45 + (i / this.trail.length) * 0.5), 0, Math.PI * 2);
      g.fill();
    }
  }

  private offscreenMarker(s: GameState) {
    const g = this.g;
    const x = Math.max(20, Math.min(W - 20, s.ball.x));
    const h = Math.round(-s.ball.y / 10);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(x, 4); g.lineTo(x - 9, 18); g.lineTo(x + 9, 18);
    g.closePath();
    g.fill();
    drawBall(g, this.look.ball, x, 32, 9, this.ballAngle);
    this.text(`↑${h}`, x, 52, 12, '#fff', 'center', 700);
  }

  private drawBanner(text: string) {
    const g = this.g;
    g.fillStyle = 'rgba(160,20,20,0.85)';
    g.fillRect(0, H - 30, W, 26);
    g.save();
    g.beginPath();
    g.rect(0, H - 30, W, 26);
    g.clip();
    g.font = '700 15px system-ui, sans-serif';
    const tw = g.measureText(text).width + 80;
    this.bannerX -= 1.2;
    if (this.bannerX < -tw) this.bannerX += tw;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#fff';
    for (let x = this.bannerX; x < W; x += tw) g.fillText(text, x, H - 17);
    g.restore();
  }

  private shadow(x: number, y: number, r: number, a: number) {
    const g = this.g;
    const h = Math.max(0, GROUND - y);
    const k = Math.max(0.25, 1 - h / 700);
    g.fillStyle = `rgba(40,20,10,${a * k})`;
    g.beginPath();
    g.ellipse(x, GROUND + 4, r * k, 6 * k, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawPlayer(s: GameState, p: number) {
    const g = this.g;
    const k = s.players[p];
    const target = k.crouch ? 1 : 0;
    this.crouchVis[p] += (target - this.crouchVis[p]) * (k.recover > 0 ? 0.12 : 0.45);
    if (this.prevVy[p] > 6 && k.vy === 0) this.squash[p] = Math.min(1, this.prevVy[p] / 18);
    this.prevVy[p] = k.vy;
    this.squash[p] *= 0.8;
    const c = this.crouchVis[p];
    let rx = SACK_RX + (CROUCH_RX - SACK_RX) * c;
    let ry = SACK_RY + (CROUCH_RY - SACK_RY) * c;
    rx *= 1 + this.squash[p] * 0.12;
    ry *= 1 - this.squash[p] * 0.15;
    if (k.vy < -2) { ry *= 1.06; rx *= 0.96; }
    if (k.dash > 0) { rx *= 1.12; ry *= 0.9; }
    const face = p === 0 ? 1 : -1;

    let mood: Face = 'normal';
    let tint: string | undefined;
    let dx = 0, dy = 0, rot = 0, scx = 1, scy = 1;
    const ar = this.reactions[p];
    if (ar) {
      ar.t++;
      if (ar.t > ar.dur) this.reactions[p] = null;
      const t = ar.t;
      mood = MOOD[ar.r.id] ?? 'normal';
      if (ar.r.id === 'angry' || ar.r.id === 'revenge') tint = 'rgba(255,40,20,0.22)';
      switch (ar.r.anim) {
        case 'hop': dy = -Math.abs(Math.sin(t * 0.2)) * 26; break;
        case 'wiggle': rot = Math.sin(t * 0.35) * 0.22; dx = Math.sin(t * 0.35) * 6; break;
        case 'spin': rot = (t * 0.25) % (Math.PI * 2); break;
        case 'shake': dx = Math.sin(t * 1.6) * 4; break;
        case 'flat': scy = Math.max(0.45, 1 - t * 0.04); scx = 1 + (1 - scy) * 0.6; break;
        case 'droop': scy = 0.86; scx = 1.06; rot = face * -0.08; break;
        case 'puff': { const q = 1 + Math.abs(Math.sin(t * 0.15)) * 0.12; scx = q; scy = q; break; }
      }
      this.fx(ar.r.fx, k.x, k.y - ry, face, t);
    } else {
      this.blink[p] -= 1;
      if (this.blink[p] < -200 - Math.random() * 300) this.blink[p] = 8;
      if (this.blink[p] > 0) mood = 'blink';
      if (s.phase === PH_POINT && s.lastPointBy !== p) mood = 'sad';
    }

    g.save();
    g.translate(k.x + dx, k.y + dy);
    if (rot) { g.translate(0, -ry / 2); g.rotate(rot); g.translate(0, ry / 2); }
    g.scale(scx, scy);
    drawSack(g, this.look.profiles[p], 0, 0, rx, ry, {
      face, lookX: s.ball.x - (k.x + dx), lookY: s.ball.y - (k.y + dy), mood, tint,
    });
    g.restore();

  }

  private drawParticles() {
    const g = this.g;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= 0.97;
      if (p.life > p.max) { this.particles.splice(i, 1); continue; }
      g.globalAlpha = 1 - p.life / p.max;
      g.fillStyle = p.color;
      if (p.kind === 'rect') {
        g.fillRect(p.x, p.y, p.size, p.size * 1.6);
      } else if (p.kind === 'text') {
        g.font = `${p.size}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.text!, p.x, p.y);
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    g.globalAlpha = 1;
  }

  private text(t: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', weight = 800) {
    const g = this.g;
    g.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size / 7);
    g.strokeStyle = 'rgba(20,15,40,0.65)';
    g.strokeText(t, x, y);
    g.fillStyle = color;
    g.fillText(t, x, y);
  }

  private drawHud(s: GameState, info: DrawInfo) {
    const g = this.g;
    const [p0, p1] = this.look.profiles;
    this.text(String(s.score[0]), NET_X - 60, 52, 54, '#fff');
    this.text(String(s.score[1]), NET_X + 60, 52, 54, '#fff');
    this.text(':', NET_X, 48, 40, 'rgba(255,255,255,0.8)');
    g.fillStyle = p0.color;
    g.fillRect(NET_X - 104, 76, 88, 4);
    g.fillStyle = p1.color;
    g.fillRect(NET_X + 16, 76, 88, 4);
    const nm = (p: number) => (info.localSide === p ? `${info.names[p]} (ви)` : info.names[p]);
    this.text(nm(0), NET_X - 90, 96, 16, '#fff', 'right', 700);
    this.text(nm(1), NET_X + 90, 96, 16, '#fff', 'left', 700);
    for (let p = 0; p < 2; p++) {
      const n = s.touchSide === p ? s.touches : 0;
      const cx = p === 0 ? W * 0.25 : W * 0.75;
      for (let i = 0; i < MAX_TOUCHES; i++) {
        const x = cx + (i - 1) * 20;
        g.beginPath();
        g.arc(x, 28, 6, 0, Math.PI * 2);
        g.fillStyle = i < n ? (n >= MAX_TOUCHES ? '#ff5a4f' : '#ffd76a') : 'rgba(255,255,255,0.22)';
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = 'rgba(20,15,40,0.5)';
        g.stroke();
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pp = this.popups[i];
      pp.life--;
      pp.y -= 0.6;
      if (pp.life <= 0) { this.popups.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, pp.life / 20);
      this.text(pp.text, pp.x, pp.y, 30, pp.color);
      g.globalAlpha = 1;
    }
    if (s.phase === PH_SERVE && s.timer > 0) {
      this.text('Подача — дістаньте м\'яч стрибком', s.server === 0 ? W * 0.25 : W * 0.75, 125, 18, 'rgba(255,255,255,0.9)', 'center', 700);
    }
    if (s.boost > 1.01 && s.phase === 1) {
      this.text(`🔥 ×${s.boost.toFixed(2)}`, NET_X, 125, 18, '#ffb347', 'center', 800);
    }
    if (s.phase === PH_OVER) {
      g.fillStyle = 'rgba(15,12,35,0.45)';
      g.fillRect(0, 140, W, 120);
      const winnerName = info.localSide === -1 ? `Переміг: ${info.names[s.winner]}` : info.localSide === s.winner ? 'Перемога! 🎉' : 'Поразка';
      this.text(winnerName, W / 2, 180, 42, '#ffd76a');
      if (s.timer === 0) {
        const t = info.overText ?? `Стрибок — зіграти ще   ${info.names[0]} ${s.ready[0] ? '✔' : '…'}   ${info.names[1]} ${s.ready[1] ? '✔' : '…'}`;
        this.text(t, W / 2, 232, 18, '#fff', 'center', 700);
      }
    }
    if (info.stalled) this.text('Очікування суперника…', W / 2, H / 2 - 40, 24, '#fff', 'center', 700);
    if (info.hint) this.text(info.hint, W / 2, H - 22, 15, 'rgba(255,255,255,0.9)', 'center', 600);
    if (info.ping !== undefined) {
      const pc = info.ping < 80 ? '#9cff9c' : info.ping < 160 ? '#ffe28a' : '#ff9c8a';
      this.text(`пінг ${Math.round(info.ping)} мс`, W - 12, 20, 14, pc, 'right', 600);
    }
    if (info.debug) this.text(info.debug, W - 12, 40, 12, '#fff', 'right', 500);
  }
}
