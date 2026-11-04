import {
  BALL_R, CROUCH_RX, CROUCH_RY, FAULT_TOUCHES, GROUND, H, MAX_TOUCHES, NET_HALF, NET_TOP, NET_X,
  PH_OVER, PH_POINT, PH_SERVE, SACK_RX, SACK_RY, W,
} from './sim/game.ts';
import type { GameEvent, GameState } from './sim/game.ts';

export interface DrawInfo {
  names: [string, string];
  /** чий це пристрій (для підписів "Ви") — -1 якщо обидва локальні */
  localSide: number;
  ping?: number;
  stalled?: boolean;
  debug?: string;
  hint?: string;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Popup { text: string; x: number; y: number; life: number; color: string }

const COLORS = [
  { body: '#d9a05b', dark: '#9c6a32', tint: '#e8743b', light: '#f3c98b' },
  { body: '#c9b07a', dark: '#857247', tint: '#3f8fd8', light: '#ecdcae' },
];

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
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shake = 0;
  private hatch: CanvasPattern | null = null;
  private time = 0;

  constructor(c: HTMLCanvasElement) {
    this.c = c;
    this.g = c.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.hatch = this.makeHatch();
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

  private makeHatch(): CanvasPattern | null {
    const p = document.createElement('canvas');
    p.width = p.height = 8;
    const g = p.getContext('2d')!;
    g.strokeStyle = 'rgba(60,35,10,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 8); g.lineTo(8, 0);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(6, 10); g.lineTo(10, 6);
    g.stroke();
    g.strokeStyle = 'rgba(255,240,200,0.12)';
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(8, 8);
    g.stroke();
    return this.g.createPattern(p, 'repeat');
  }

  onEvents(events: GameEvent[], s: GameState, localSide: number) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const n = 6 + Math.min(10, e.speed | 0);
          for (let i = 0; i < n; i++) this.spark(e.x, e.y, '#fff6d8', 3);
          if (e.speed > 14) this.shake = Math.max(this.shake, 4);
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
          const txt = e.fault === FAULT_TOUCHES ? '4 торкання!' : '+1';
          const x = e.winner === 0 ? W * 0.25 : W * 0.75;
          const mine = localSide === -1 || localSide === e.winner;
          this.popups.push({ text: txt, x, y: 150, life: 70, color: mine ? '#ffd76a' : '#ff8a7a' });
          break;
        }
      }
    }
    void s;
  }

  private spark(x: number, y: number, color: string, size: number, up = false) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 4;
    this.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: up ? -Math.abs(Math.sin(a) * sp) - 1 : Math.sin(a) * sp,
      life: 0, max: 20 + Math.random() * 20, color, size: size * (0.5 + Math.random()),
    });
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

    this.drawBackground();
    // тіні
    for (let p = 0; p < 2; p++) this.shadow(s.players[p].x, s.players[p].y, SACK_RX, 0.28);
    this.shadow(s.ball.x, s.ball.y + BALL_R, BALL_R * 0.9, 0.22);
    this.drawNet();
    for (let p = 0; p < 2; p++) this.drawSack(s, p);
    this.drawBall(s, dt);
    this.drawParticles();
    this.drawHud(s, info);
  }

  private drawBackground() {
    const g = this.g;
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#2a3a74');
    sky.addColorStop(0.55, '#c86b78');
    sky.addColorStop(1, '#f7b26a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, GROUND);
    // сонце
    const sun = g.createRadialGradient(W * 0.5, GROUND - 40, 10, W * 0.5, GROUND - 40, 160);
    sun.addColorStop(0, 'rgba(255,230,160,0.95)');
    sun.addColorStop(0.35, 'rgba(255,200,120,0.5)');
    sun.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, GROUND);
    // пагорби
    g.fillStyle = 'rgba(70,45,90,0.55)';
    g.beginPath();
    g.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, GROUND - 60 - Math.sin(x * 0.008) * 30 - Math.sin(x * 0.021) * 12);
    g.lineTo(W, GROUND);
    g.fill();
    g.fillStyle = 'rgba(50,30,70,0.6)';
    g.beginPath();
    g.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 30) g.lineTo(x, GROUND - 25 - Math.sin(x * 0.013 + 2) * 14);
    g.lineTo(W, GROUND);
    g.fill();
    // пісок
    const sand = g.createLinearGradient(0, GROUND, 0, H);
    sand.addColorStop(0, '#f0cf8e');
    sand.addColorStop(1, '#c99a5b');
    g.fillStyle = sand;
    g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(0, GROUND, W, 3);
    // межі (стіни)
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, 0, 3, GROUND);
    g.fillRect(W - 3, 0, 3, GROUND);
  }

  private shadow(x: number, y: number, r: number, a: number) {
    const g = this.g;
    const h = Math.max(0, GROUND - y);
    const k = Math.max(0.3, 1 - h / 400);
    g.fillStyle = `rgba(60,30,10,${a * k})`;
    g.beginPath();
    g.ellipse(x, GROUND + 4, r * k, 6 * k, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawNet() {
    const g = this.g;
    const top = NET_TOP;
    // стовп
    g.fillStyle = '#3b2f2a';
    g.fillRect(NET_X - 3, top - 4, 6, GROUND - top + 4);
    // сітка
    g.save();
    g.beginPath();
    g.rect(NET_X - NET_HALF, top + 10, NET_HALF * 2, GROUND - top - 10);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(NET_X - NET_HALF, top, NET_HALF * 2, GROUND - top);
    g.strokeStyle = 'rgba(255,255,255,0.65)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = top + 10; y < GROUND; y += 8) {
      g.moveTo(NET_X - NET_HALF, y);
      g.lineTo(NET_X + NET_HALF, y + 4);
    }
    g.stroke();
    g.restore();
    // верхній край
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(NET_X, top + NET_HALF, NET_HALF, Math.PI, 0);
    g.lineTo(NET_X + NET_HALF, top + 12);
    g.lineTo(NET_X - NET_HALF, top + 12);
    g.fill();
    g.fillStyle = '#e8463c';
    g.fillRect(NET_X - NET_HALF, top + 8, NET_HALF * 2, 4);
  }

  private drawSack(s: GameState, p: number) {
    const g = this.g;
    const k = s.players[p];
    const col = COLORS[p];
    // плавна анімація присідання і "сплющення" при приземленні
    const target = k.crouch ? 1 : 0;
    this.crouchVis[p] += (target - this.crouchVis[p]) * 0.45;
    if (this.prevVy[p] > 6 && k.vy === 0) this.squash[p] = Math.min(1, this.prevVy[p] / 18);
    this.prevVy[p] = k.vy;
    this.squash[p] *= 0.8;
    const c = this.crouchVis[p];
    let rx = SACK_RX + (CROUCH_RX - SACK_RX) * c;
    let ry = SACK_RY + (CROUCH_RY - SACK_RY) * c;
    rx *= 1 + this.squash[p] * 0.12;
    ry *= 1 - this.squash[p] * 0.15;
    // у польоті трохи витягуємо
    if (k.vy < -2) { ry *= 1.06; rx *= 0.96; }
    const x = k.x, y = k.y;

    g.save();
    // тіло
    g.beginPath();
    g.moveTo(x - rx, y);
    g.ellipse(x, y, rx, ry, 0, Math.PI, 0);
    g.quadraticCurveTo(x + rx * 0.5, y + 5, x, y + 3);
    g.quadraticCurveTo(x - rx * 0.5, y + 5, x - rx, y);
    g.closePath();
    const grad = g.createLinearGradient(x - rx, y - ry, x + rx * 0.6, y);
    grad.addColorStop(0, col.light);
    grad.addColorStop(0.5, col.body);
    grad.addColorStop(1, col.dark);
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.clip();
    if (this.hatch) {
      g.fillStyle = this.hatch;
      g.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, ry + 10);
    }
    // кольорова смуга-номер
    g.fillStyle = col.tint;
    g.globalAlpha = 0.85;
    g.fillRect(x - rx, y - ry * 0.32, rx * 2, ry * 0.16);
    g.globalAlpha = 1;
    g.restore();
    g.lineWidth = 2.5;
    g.strokeStyle = col.dark;
    g.stroke();
    // шов
    g.setLineDash([5, 5]);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(80,45,15,0.55)';
    g.beginPath();
    g.ellipse(x, y, rx * 0.82, ry * 0.82, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    g.setLineDash([]);
    // зав'язаний чубчик зверху
    const tx = x, ty = y - ry;
    g.fillStyle = col.body;
    g.strokeStyle = col.dark;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(tx - 4, ty + 3);
    g.quadraticCurveTo(tx - 14, ty - 12 - (1 - c) * 2, tx - 9, ty - 16);
    g.quadraticCurveTo(tx - 2, ty - 8, tx, ty - 3);
    g.quadraticCurveTo(tx + 2, ty - 8, tx + 9, ty - 16);
    g.quadraticCurveTo(tx + 14, ty - 12, tx + 4, ty + 3);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = col.tint;
    g.fillRect(tx - 6, ty - 2, 12, 5);

    // очі дивляться на м'яч
    const face = p === 0 ? 1 : -1;
    const ex = x + face * rx * 0.32;
    const ey = y - ry * 0.58;
    const bx = s.ball.x - ex, by = s.ball.y - ey;
    const bl = Math.hypot(bx, by) || 1;
    this.blink[p] -= 1;
    if (this.blink[p] < -200 - Math.random() * 300) this.blink[p] = 8;
    const open = this.blink[p] > 0 ? 0.15 : 1;
    for (const dx of [-11, 11]) {
      const cx = ex + dx, cy = ey;
      g.fillStyle = '#fffdf6';
      g.beginPath();
      g.ellipse(cx, cy, 8, 9 * open, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(60,30,10,0.6)';
      g.lineWidth = 1.2;
      g.stroke();
      if (open > 0.5) {
        g.fillStyle = '#23180f';
        g.beginPath();
        g.arc(cx + (bx / bl) * 3.5, cy + (by / bl) * 4, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(cx + (bx / bl) * 3.5 - 1.3, cy + (by / bl) * 4 - 1.5, 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // рот
    g.strokeStyle = 'rgba(60,30,10,0.75)';
    g.lineWidth = 2;
    g.beginPath();
    const my = ey + 15;
    if (s.phase === PH_OVER && s.winner === p) g.arc(ex, my - 3, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (s.phase === PH_POINT && s.lastPointBy !== p) g.arc(ex, my + 4, 5, 1.15 * Math.PI, 1.85 * Math.PI);
    else { g.moveTo(ex - 5, my); g.quadraticCurveTo(ex, my + 3, ex + 5, my); }
    g.stroke();
    g.restore();
  }

  private drawBall(s: GameState, dt: number) {
    const g = this.g;
    const b = s.ball;
    this.ballAngle += (b.vx / BALL_R) * dt * 60 * 0.5;
    g.save();
    g.translate(b.x, b.y);
    g.rotate(this.ballAngle);
    const r = BALL_R;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = '#fbfbf6';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#f4c430';
    g.beginPath();
    g.ellipse(-r * 0.2, -r * 0.9, r * 1.1, r * 0.55, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f6fd6';
    g.beginPath();
    g.ellipse(r * 0.6, r * 0.6, r * 0.9, r * 0.45, -0.9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,40,60,0.45)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(-r * 1.2, r * 0.2, r * 1.3, -0.6, 0.6);
    g.moveTo(r * 1.4, -r * 0.4);
    g.arc(r * 0.2, -r * 1.2, r * 1.3, 0.4, 1.6);
    g.stroke();
    g.restore();
    g.rotate(-this.ballAngle);
    const hl = g.createRadialGradient(-r * 0.4, -r * 0.45, 1, 0, 0, r);
    hl.addColorStop(0, 'rgba(255,255,255,0.6)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0)');
    hl.addColorStop(1, 'rgba(0,0,30,0.25)');
    g.fillStyle = hl;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(30,30,50,0.6)';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
  }

  private drawParticles() {
    const g = this.g;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.vx *= 0.96;
      if (p.life > p.max) { this.particles.splice(i, 1); continue; }
      g.globalAlpha = 1 - p.life / p.max;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
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
    // рахунок
    this.text(String(s.score[0]), NET_X - 60, 52, 54, COLORS[0].tint === '#e8743b' ? '#ffd3a8' : '#fff');
    this.text(String(s.score[1]), NET_X + 60, 52, 54, '#bfe0ff');
    this.text(':', NET_X, 48, 40, 'rgba(255,255,255,0.8)');
    const nm = (p: number) => info.localSide === p ? `${info.names[p]} (ви)` : info.names[p];
    this.text(nm(0), NET_X - 90, 92, 16, '#ffe2c4', 'right', 700);
    this.text(nm(1), NET_X + 90, 92, 16, '#d7ebff', 'left', 700);
    // лічильник торкань
    for (let p = 0; p < 2; p++) {
      const n = s.touchSide === p ? s.touches : 0;
      const cx = p === 0 ? W * 0.25 : W * 0.75;
      for (let i = 0; i < MAX_TOUCHES; i++) {
        const x = cx + (i - 1) * 20;
        g.beginPath();
        g.arc(x, 28, 6, 0, Math.PI * 2);
        g.fillStyle = i < n ? (n >= MAX_TOUCHES ? '#ff5a4f' : '#ffd76a') : 'rgba(255,255,255,0.18)';
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = 'rgba(20,15,40,0.5)';
        g.stroke();
      }
    }
    // спливаючі написи
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pp = this.popups[i];
      pp.life--;
      pp.y -= 0.6;
      if (pp.life <= 0) { this.popups.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, pp.life / 20);
      this.text(pp.text, pp.x, pp.y, 30, pp.color);
      g.globalAlpha = 1;
    }
    // повідомлення фаз
    if (s.phase === PH_SERVE && s.timer > 0) {
      const who = s.server;
      this.text('Подача', who === 0 ? W * 0.25 : W * 0.75, 120, 22, 'rgba(255,255,255,0.85)', 'center', 700);
    }
    if (s.phase === PH_OVER) {
      g.fillStyle = 'rgba(15,12,35,0.45)';
      g.fillRect(0, 150, W, 150);
      const winnerName = info.localSide === -1 ? `Переміг: ${info.names[s.winner]}` : info.localSide === s.winner ? 'Перемога! 🎉' : 'Поразка';
      this.text(winnerName, W / 2, 195, 44, '#ffd76a');
      if (s.timer === 0) {
        const r0 = s.ready[0] ? '✔' : '…', r1 = s.ready[1] ? '✔' : '…';
        this.text(`Стрибок — зіграти ще   ${info.names[0]} ${r0}   ${info.names[1]} ${r1}`, W / 2, 255, 18, '#fff', 'center', 700);
      }
    }
    if (info.stalled) this.text('Очікування суперника…', W / 2, H / 2 - 40, 24, '#fff', 'center', 700);
    if (info.hint) this.text(info.hint, W / 2, H - 22, 15, 'rgba(255,255,255,0.85)', 'center', 600);
    if (info.ping !== undefined) {
      const pc = info.ping < 80 ? '#9cff9c' : info.ping < 160 ? '#ffe28a' : '#ff9c8a';
      this.text(`пінг ${Math.round(info.ping)} мс`, W - 12, 20, 14, pc, 'right', 600);
    }
    if (info.debug) this.text(info.debug, W - 12, 40, 12, '#fff', 'right', 500);
  }
}
