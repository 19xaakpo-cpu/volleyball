// Малювання мішка і м'яча (використовується у грі, у редакторі вигляду і в турнірній таблиці).

import type { BallDesign, Profile } from './cosmetics.ts';

export type Face = 'normal' | 'happy' | 'sad' | 'angry' | 'dizzy' | 'cool' | 'laugh' | 'kiss' | 'blink';

export interface SackOpts {
  face: number; // напрямок погляду/обличчя: 1 вправо, -1 вліво
  lookX: number;
  lookY: number;
  mood: Face;
  tint?: string; // напр. червоний при люті
}

let hatchPattern: CanvasPattern | null = null;
function hatch(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (hatchPattern) return hatchPattern;
  const p = document.createElement('canvas');
  p.width = p.height = 8;
  const c = p.getContext('2d')!;
  c.strokeStyle = 'rgba(60,35,10,0.16)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, 8); c.lineTo(8, 0);
  c.moveTo(-2, 2); c.lineTo(2, -2);
  c.moveTo(6, 10); c.lineTo(10, 6);
  c.stroke();
  c.strokeStyle = 'rgba(255,240,200,0.10)';
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(8, 8);
  c.stroke();
  hatchPattern = g.createPattern(p, 'repeat');
  return hatchPattern;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt; gg += (255 - gg) * amt; b += (255 - b) * amt;
  } else {
    r *= 1 + amt; gg *= 1 + amt; b *= 1 + amt;
  }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function drawPattern(g: CanvasRenderingContext2D, pr: Profile, x: number, y: number, rx: number, ry: number) {
  const a = pr.accent;
  const left = x - rx - 4, top = y - ry - 4, w = rx * 2 + 8, h = ry + 12;
  g.save();
  switch (pr.pattern) {
    case 'stripes':
      g.fillStyle = a;
      g.globalAlpha = 0.75;
      for (let yy = y - ry * 0.15; yy > top; yy -= ry * 0.3) g.fillRect(left, yy - ry * 0.08, w, ry * 0.12);
      break;
    case 'vstripes':
      g.fillStyle = a;
      g.globalAlpha = 0.7;
      for (let xx = x - rx; xx < x + rx; xx += rx * 0.38) g.fillRect(xx, top, rx * 0.16, h);
      break;
    case 'dots':
      g.fillStyle = a;
      g.globalAlpha = 0.8;
      for (let yy = y - 6, row = 0; yy > top; yy -= 14, row++) {
        for (let xx = left + (row % 2 ? 7 : 0); xx < left + w; xx += 14) {
          g.beginPath(); g.arc(xx, yy, 3.4, 0, Math.PI * 2); g.fill();
        }
      }
      break;
    case 'checks': {
      g.fillStyle = a;
      g.globalAlpha = 0.45;
      const s = 12;
      for (let yy = y, r = 0; yy > top - s; yy -= s, r++) {
        for (let xx = left, c = 0; xx < left + w; xx += s, c++) if ((r + c) % 2 === 0) g.fillRect(xx, yy - s, s, s);
      }
      g.globalAlpha = 0.25;
      for (let yy = y, r = 0; yy > top - s; yy -= s / 2, r++) g.fillRect(left, yy - 1, w, 2);
      break;
    }
    case 'vyshyvanka': {
      // орнамент хрестиком: ромби червоно-чорні
      const band = (cy: number, sz: number) => {
        g.globalAlpha = 0.95;
        for (let xx = left; xx < left + w; xx += sz * 2) {
          g.fillStyle = '#c8102e';
          g.beginPath();
          g.moveTo(xx + sz, cy - sz); g.lineTo(xx + sz * 2, cy); g.lineTo(xx + sz, cy + sz); g.lineTo(xx, cy);
          g.closePath(); g.fill();
          g.fillStyle = '#1a1a1a';
          g.fillRect(xx + sz - 2, cy - 2, 4, 4);
          g.fillStyle = a;
          g.fillRect(xx - 1.5, cy - 1.5, 3, 3);
        }
        g.fillStyle = '#1a1a1a';
        g.fillRect(left, cy - sz - 2, w, 1.5);
        g.fillRect(left, cy + sz + 0.5, w, 1.5);
      };
      band(y - ry * 0.4, 6);
      band(y - 7, 4);
      break;
    }
    case 'camo': {
      const blobs = [[-0.6, -0.3, 0.3], [0.1, -0.6, 0.28], [0.55, -0.25, 0.25], [-0.2, -0.1, 0.22], [0.3, -0.85, 0.2], [-0.5, -0.75, 0.2], [0.75, -0.6, 0.18]];
      const cols = [shade(pr.color, -0.35), a, shade(pr.color, 0.3)];
      blobs.forEach((bl, i) => {
        g.fillStyle = cols[i % 3];
        g.globalAlpha = 0.8;
        g.beginPath();
        g.ellipse(x + bl[0] * rx, y + bl[1] * ry, bl[2] * rx, bl[2] * ry * 0.7, i, 0, Math.PI * 2);
        g.fill();
      });
      break;
    }
    case 'zigzag':
      g.strokeStyle = a;
      g.lineWidth = 4;
      g.globalAlpha = 0.85;
      for (let yy = y - ry * 0.2; yy > top; yy -= ry * 0.35) {
        g.beginPath();
        for (let xx = left, i = 0; xx <= left + w + 10; xx += 10, i++) g.lineTo(xx, yy + (i % 2 ? -6 : 6));
        g.stroke();
      }
      break;
    case 'stars':
      g.fillStyle = a;
      g.globalAlpha = 0.9;
      for (let yy = y - 10, row = 0; yy > top; yy -= 18, row++) {
        for (let xx = left + (row % 2 ? 9 : 0); xx < left + w; xx += 18) star(g, xx, yy, 5);
      }
      break;
    case 'patches': {
      const ps = [[-0.55, -0.35, a], [0.35, -0.65, shade(pr.color, -0.3)], [0.5, -0.2, shade(a, 0.3)]] as const;
      for (const [px, py, c] of ps) {
        const cx = x + px * rx, cy = y + py * ry, s = rx * 0.32;
        g.globalAlpha = 0.95;
        g.fillStyle = c;
        g.fillRect(cx - s / 2, cy - s / 2.5, s, s * 0.8);
        g.setLineDash([2, 2]);
        g.strokeStyle = 'rgba(30,20,10,0.6)';
        g.lineWidth = 1;
        g.strokeRect(cx - s / 2 + 2, cy - s / 2.5 + 2, s - 4, s * 0.8 - 4);
        g.setLineDash([]);
      }
      break;
    }
  }
  g.restore();
}

/** Малює мішок. (x, y) — середина низу. */
export function drawSack(g: CanvasRenderingContext2D, pr: Profile, x: number, y: number, rx: number, ry: number, o: SackOpts) {
  const dark = shade(pr.color, -0.38);
  g.save();
  // тіло
  const body = () => {
    g.beginPath();
    g.moveTo(x - rx, y);
    g.ellipse(x, y, rx, ry, 0, Math.PI, 0);
    g.quadraticCurveTo(x + rx * 0.5, y + 5, x, y + 3);
    g.quadraticCurveTo(x - rx * 0.5, y + 5, x - rx, y);
    g.closePath();
  };
  body();
  const grad = g.createLinearGradient(x - rx, y - ry, x + rx * 0.6, y);
  grad.addColorStop(0, shade(pr.color, 0.28));
  grad.addColorStop(0.5, pr.color);
  grad.addColorStop(1, shade(pr.color, -0.25));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  drawPattern(g, pr, x, y, rx, ry);
  const h = hatch(g);
  if (h) {
    g.fillStyle = h;
    g.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, ry + 10);
  }
  // смуга-пояс кольором акценту
  if (pr.pattern === 'burlap') {
    g.fillStyle = pr.accent;
    g.globalAlpha = 0.85;
    g.fillRect(x - rx, y - ry * 0.32, rx * 2, ry * 0.16);
    g.globalAlpha = 1;
  }
  if (o.tint) {
    g.fillStyle = o.tint;
    g.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, ry + 10);
  }
  // об'ємне затінення
  const vol = g.createRadialGradient(x - rx * 0.35, y - ry * 0.75, 2, x, y - ry * 0.4, rx * 1.3);
  vol.addColorStop(0, 'rgba(255,255,255,0.22)');
  vol.addColorStop(0.5, 'rgba(255,255,255,0)');
  vol.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = vol;
  g.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, ry + 10);
  g.restore();
  body();
  g.lineWidth = 2.5;
  g.strokeStyle = dark;
  g.stroke();
  // шов
  g.setLineDash([5, 5]);
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(40,25,10,0.45)';
  g.beginPath();
  g.ellipse(x, y, rx * 0.82, ry * 0.82, 0, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  g.setLineDash([]);
  // зав'язаний чубчик зверху
  const tx = x, ty = y - ry;
  g.fillStyle = pr.color;
  g.strokeStyle = dark;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(tx - 4, ty + 3);
  g.quadraticCurveTo(tx - 14, ty - 12, tx - 9, ty - 16);
  g.quadraticCurveTo(tx - 2, ty - 8, tx, ty - 3);
  g.quadraticCurveTo(tx + 2, ty - 8, tx + 9, ty - 16);
  g.quadraticCurveTo(tx + 14, ty - 12, tx + 4, ty + 3);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = pr.accent;
  g.fillRect(tx - 6, ty - 2, 12, 5);

  // лого — на "спині", подалі від обличчя
  if (pr.logo) {
    const lx = x - o.face * rx * 0.42, ly = y - ry * 0.36;
    const size = Math.max(10, Math.min(rx, ry) * 0.42);
    g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(pr.logo, lx, ly);
  }

  drawFace(g, x + o.face * rx * 0.32, y - ry * 0.58, o, Math.min(1, ry / 45));
  g.restore();
}

function drawFace(g: CanvasRenderingContext2D, ex: number, ey: number, o: SackOpts, k: number) {
  const bx = o.lookX - ex, by = o.lookY - ey;
  const bl = Math.hypot(bx, by) || 1;
  const lx = (bx / bl) * 3.5, ly = (by / bl) * 4;
  const mood = o.mood;
  const sp = 11 * Math.max(0.8, k);
  for (const dx of [-sp, sp]) {
    const cx = ex + dx, cy = ey;
    if (mood === 'cool') continue;
    if (mood === 'dizzy') {
      g.strokeStyle = '#23180f';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(cx - 5, cy - 5); g.lineTo(cx + 5, cy + 5);
      g.moveTo(cx + 5, cy - 5); g.lineTo(cx - 5, cy + 5);
      g.stroke();
      continue;
    }
    if (mood === 'laugh') {
      g.strokeStyle = '#23180f';
      g.lineWidth = 2.4;
      g.beginPath();
      g.arc(cx, cy + 2, 5, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      continue;
    }
    const open = mood === 'blink' ? 0.15 : 1;
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
      g.arc(cx + lx, cy + ly, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(cx + lx - 1.3, cy + ly - 1.5, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    // брови
    if (mood === 'angry' || mood === 'sad') {
      g.strokeStyle = '#23180f';
      g.lineWidth = 2.5;
      g.beginPath();
      const inner = dx < 0 ? 1 : -1; // внутрішній край брови
      const yIn = mood === 'angry' ? cy - 8 : cy - 13;
      const yOut = mood === 'angry' ? cy - 13 : cy - 9;
      g.moveTo(cx + inner * 7, yIn);
      g.lineTo(cx - inner * 7, yOut);
      g.stroke();
    }
  }
  if (mood === 'cool') {
    g.fillStyle = '#111';
    g.beginPath();
    g.roundRect(ex - sp - 9, ey - 6, 18, 11, 4);
    g.roundRect(ex + sp - 9, ey - 6, 18, 11, 4);
    g.fill();
    g.fillRect(ex - sp + 6, ey - 4, sp * 2 - 12, 2.5);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(ex - sp - 5, ey - 4, 5, 2);
    g.fillRect(ex + sp - 5, ey - 4, 5, 2);
  }
  // рот
  g.strokeStyle = 'rgba(60,30,10,0.8)';
  g.lineWidth = 2;
  const my = ey + 15;
  g.beginPath();
  switch (mood) {
    case 'happy':
    case 'cool':
      g.arc(ex, my - 3, 7, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      break;
    case 'laugh':
      g.fillStyle = '#5a1e1e';
      g.arc(ex, my - 2, 8, 0, Math.PI);
      g.closePath();
      g.fill();
      break;
    case 'sad':
      g.arc(ex, my + 5, 6, 1.15 * Math.PI, 1.85 * Math.PI);
      g.stroke();
      break;
    case 'angry':
      g.moveTo(ex - 7, my + 2); g.lineTo(ex - 3, my - 1); g.lineTo(ex + 1, my + 2); g.lineTo(ex + 5, my - 1); g.lineTo(ex + 8, my + 2);
      g.stroke();
      break;
    case 'dizzy':
      g.ellipse(ex, my + 1, 4, 5, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'kiss':
      g.fillStyle = '#d94b6a';
      g.ellipse(ex, my, 4, 3.5, 0, 0, Math.PI * 2);
      g.fill();
      break;
    default:
      g.moveTo(ex - 5, my); g.quadraticCurveTo(ex, my + 3, ex + 5, my);
      g.stroke();
  }
}

// ---------- м'яч ----------

export function drawBall(g: CanvasRenderingContext2D, d: BallDesign, x: number, y: number, r: number, angle: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = d.c1;
  g.fill();
  g.save();
  g.clip();
  switch (d.pattern) {
    case 'volley':
      g.fillStyle = d.c3;
      g.beginPath();
      g.ellipse(-r * 0.2, -r * 0.9, r * 1.1, r * 0.55, 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = d.c2;
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
      break;
    case 'beach':
      for (let i = 0; i < 6; i++) {
        g.fillStyle = [d.c1, d.c2, d.c3][i % 3];
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
        g.closePath();
        g.fill();
      }
      g.fillStyle = d.c1;
      g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.fill();
      break;
    case 'band':
      g.fillStyle = d.c2;
      g.fillRect(-r, -r * 0.22, r * 2, r * 0.44);
      g.fillStyle = d.c3;
      g.fillRect(-r, -r * 0.08, r * 2, r * 0.16);
      break;
    case 'stripes':
      g.fillStyle = d.c2;
      for (let i = -3; i <= 3; i += 2) g.fillRect(-r, i * r * 0.28 - r * 0.12, r * 2, r * 0.26);
      break;
    case 'dots':
      g.fillStyle = d.c2;
      for (const [px, py] of [[0, 0], [-0.6, -0.5], [0.6, -0.4], [-0.5, 0.6], [0.55, 0.6], [0, -0.95], [0, 0.95]]) {
        g.beginPath(); g.arc(px * r, py * r, r * 0.2, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'soccer': {
      g.fillStyle = d.c2;
      const pent = (cx: number, cy: number, s: number) => {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          g.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
        }
        g.closePath();
        g.fill();
      };
      pent(0, 0, r * 0.35);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3);
      }
      break;
    }
    case 'tennis':
      g.strokeStyle = d.c2;
      g.lineWidth = r * 0.14;
      g.beginPath();
      g.arc(-r * 1.15, 0, r * 0.85, -0.9, 0.9);
      g.stroke();
      g.beginPath();
      g.arc(r * 1.15, 0, r * 0.85, Math.PI - 0.9, Math.PI + 0.9);
      g.stroke();
      break;
  }
  if (d.logo) {
    g.fillStyle = d.c2;
    if (d.logo === 'М') {
      g.font = `900 ${r * 1.15}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('М', 0, r * 0.06);
    } else {
      g.font = `${r * 0.95}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(d.logo, 0, r * 0.05);
    }
  }
  g.restore();
  g.rotate(-angle);
  const hl = g.createRadialGradient(-r * 0.4, -r * 0.45, 1, 0, 0, r);
  hl.addColorStop(0, 'rgba(255,255,255,0.6)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0)');
  hl.addColorStop(1, 'rgba(0,0,30,0.28)');
  g.fillStyle = hl;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(30,30,50,0.6)';
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
}
