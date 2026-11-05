// Декорації локацій: статичний фон (кешується), анімовані деталі і "сітка".

import { GROUND, H, NET_TOP, NET_X, W } from './sim/game.ts';
import type { NetShape } from './sim/game.ts';
import { shade } from './draw.ts';

type G = CanvasRenderingContext2D;

// детермінований "рандом" для декорацій (щоб фон не мінявся між кадрами)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function txt(g: G, s: string, x: number, y: number, size: number, color: string, weight = 800, align: CanvasTextAlign = 'center', font = 'system-ui, sans-serif') {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

// ============ ПЛЯЖ ============

function beachStatic(g: G) {
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#2a3a74');
  sky.addColorStop(0.55, '#c86b78');
  sky.addColorStop(1, '#f7b26a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  const sun = g.createRadialGradient(W * 0.5, GROUND - 60, 10, W * 0.5, GROUND - 60, 170);
  sun.addColorStop(0, 'rgba(255,230,160,0.95)');
  sun.addColorStop(0.35, 'rgba(255,200,120,0.5)');
  sun.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, GROUND);
  // море
  const sea = g.createLinearGradient(0, GROUND - 70, 0, GROUND);
  sea.addColorStop(0, '#5a5f9e');
  sea.addColorStop(1, '#e69a7a');
  g.fillStyle = sea;
  g.fillRect(0, GROUND - 70, W, 70);
  g.fillStyle = 'rgba(255,220,170,0.5)';
  for (let i = 0; i < 40; i++) {
    const r = rng(i + 3);
    const x = W * 0.5 + (r() - 0.5) * 300, y = GROUND - 65 + r() * 60;
    g.fillRect(x, y, 10 + r() * 30, 2);
  }
  // пальми
  const palm = (x: number, h: number, lean: number) => {
    g.strokeStyle = '#3b2a3e';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(x, GROUND);
    g.quadraticCurveTo(x + lean * 0.3, GROUND - h * 0.6, x + lean, GROUND - h);
    g.stroke();
    g.fillStyle = '#3b2a3e';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI;
      g.beginPath();
      g.moveTo(x + lean, GROUND - h);
      g.quadraticCurveTo(x + lean + Math.cos(a) * 50, GROUND - h - 30 + Math.sin(a) * 10, x + lean + Math.cos(a) * 85, GROUND - h + 25);
      g.quadraticCurveTo(x + lean + Math.cos(a) * 45, GROUND - h - 10, x + lean, GROUND - h);
      g.fill();
    }
  };
  palm(60, 260, 30);
  palm(900, 230, -40);
  sand(g, '#f0cf8e', '#c99a5b');
}

function sand(g: G, c1: string, c2: string) {
  const s = g.createLinearGradient(0, GROUND, 0, H);
  s.addColorStop(0, c1);
  s.addColorStop(1, c2);
  g.fillStyle = s;
  g.fillRect(0, GROUND, W, H - GROUND);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(0, GROUND, W, 3);
}

function netMesh(g: G, half: number, tape: string, mesh: string, post: string) {
  const top = NET_TOP;
  g.fillStyle = post;
  g.fillRect(NET_X - 3, top - 4, 6, GROUND - top + 4);
  g.save();
  g.beginPath();
  g.rect(NET_X - half, top + 10, half * 2, GROUND - top - 10);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(NET_X - half, top, half * 2, GROUND - top);
  g.strokeStyle = mesh;
  g.lineWidth = 1;
  g.beginPath();
  for (let y = top + 10; y < GROUND; y += 8) {
    g.moveTo(NET_X - half, y);
    g.lineTo(NET_X + half, y + 4);
  }
  g.stroke();
  g.restore();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(NET_X, top + half, half, Math.PI, 0);
  g.lineTo(NET_X + half, top + 12);
  g.lineTo(NET_X - half, top + 12);
  g.fill();
  g.fillStyle = tape;
  g.fillRect(NET_X - half, top + 8, half * 2, 4);
}

// ============ КОРТ З ГЛЯДАЧАМИ ============
// Трибуни світлі й "далекі": глядачі дрібні, розмиті, у легкому серпанку —
// щоб на їхньому тлі добре читалися м'яч і темна сітка.

interface Fan { x: number; y: number; kind: number; phase: number; s: number }
const FAN_TOP = 200; // верх зони трибун (для офскрін-шару)
const fans: Fan[] = (() => {
  const r = rng(77);
  const out: Fan[] = [];
  const rows = [238, 276, 314, 352, 390];
  rows.forEach((ry, ri) => {
    for (let x = 14 + ri * 9; x < W - 10; x += 30 + r() * 8) {
      if (r() < 0.1) continue;
      out.push({ x, y: ry, kind: Math.floor(r() * 3), phase: r() * 6.28, s: 0.58 + ri * 0.05 + r() * 0.06 });
    }
  });
  return out;
})();

function courtStatic(g: G) {
  // стеля і стіна арени — світлі
  const wall = g.createLinearGradient(0, 0, 0, GROUND);
  wall.addColorStop(0, '#7d8aa3');
  wall.addColorStop(0.25, '#c8d0dd');
  wall.addColorStop(1, '#e9edf3');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, GROUND);
  // ферми стелі
  g.strokeStyle = 'rgba(70,80,100,0.35)';
  g.lineWidth = 2;
  for (let x = -40; x < W + 40; x += 80) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 60); g.lineTo(x + 80, 0); g.stroke();
  }
  g.fillStyle = 'rgba(70,80,100,0.4)';
  g.fillRect(0, 58, W, 4);
  // прожектори
  for (let i = 0; i < 6; i++) {
    const x = 80 + i * 160;
    const l = g.createRadialGradient(x, 40, 2, x, 40, 110);
    l.addColorStop(0, 'rgba(255,255,240,0.95)');
    l.addColorStop(0.2, 'rgba(255,255,230,0.35)');
    l.addColorStop(1, 'rgba(255,255,220,0)');
    g.fillStyle = l;
    g.fillRect(x - 110, 0, 220, 150);
    g.fillStyle = '#fffbe8';
    g.fillRect(x - 14, 34, 28, 9);
  }
  // банер
  g.fillStyle = '#c8102e';
  g.fillRect(170, 150, 620, 36);
  txt(g, 'МІШКОБОЛ · ВИЩА ЛІГА · ОВОЧЕБАЗА №1', W / 2, 169, 20, '#fff');
  // трибуни: світлі ряди сидінь, що йдуть угору
  for (let i = 0; i < 6; i++) {
    const y = 214 + i * 38;
    g.fillStyle = i % 2 ? '#f3f5f9' : '#e4e9f1';
    g.fillRect(0, y, W, 38);
    g.fillStyle = 'rgba(120,135,160,0.25)';
    g.fillRect(0, y + 34, W, 4);
    // спинки крісел
    g.fillStyle = 'rgba(160,175,200,0.45)';
    for (let x = 6 + (i % 2) * 15; x < W; x += 30) g.fillRect(x, y + 20, 20, 12);
  }
  // проходи між секторами
  g.fillStyle = 'rgba(200,208,222,0.9)';
  for (const x of [230, 720]) g.fillRect(x, 214, 18, 228);
  // рекламний борт перед трибуною
  g.fillStyle = '#1d3f8f';
  g.fillRect(0, 442, W, 30);
  g.fillStyle = '#f5c400';
  for (let x = 0; x < W; x += 240) {
    g.fillRect(x + 6, 448, 4, 18);
  }
  txt(g, 'КАРТОПЛЯ · ЦИБУЛЯ · БУРЯК · КАРТОПЛЯ · ЦИБУЛЯ · БУРЯК', W / 2, 457, 14, '#f5c400', 800);
  g.fillStyle = '#d7dce5';
  g.fillRect(0, 472, W, GROUND - 472);
  // паркет
  const fl = g.createLinearGradient(0, GROUND, 0, H);
  fl.addColorStop(0, '#e0974f');
  fl.addColorStop(1, '#b06a2e');
  g.fillStyle = fl;
  g.fillRect(0, GROUND, W, H - GROUND);
  g.strokeStyle = 'rgba(90,40,10,0.3)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x - 30, H); g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.fillRect(0, GROUND, W, 3);
  g.fillRect(NET_X - W * 0.18, GROUND + 18, 3, 30);
  g.fillRect(NET_X + W * 0.18, GROUND + 18, 3, 30);
}

function drawFan(g: G, f: Fan, t: number, cheer: number) {
  const bob = Math.sin(t * 2.2 + f.phase) * 1.2;
  const jump = cheer > 0 ? Math.abs(Math.sin(t * 9 + f.phase)) * 8 * cheer : 0;
  const x = f.x, y = f.y + 30 - bob - jump;
  const w = 17 * f.s, h = 26 * f.s;
  if (f.kind === 1) {
    // цибуля в червоній сітці
    g.fillStyle = '#e0a63a';
    for (const [ox, oy] of [[-6, -h + 6], [5, -h + 4], [0, -h - 2]]) {
      g.beginPath(); g.ellipse(x + ox * f.s, y + oy * f.s, 7 * f.s, 8 * f.s, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#c7362b';
    g.beginPath(); g.ellipse(x, y - h * 0.45, w, h * 0.55, 0, 0, Math.PI * 2); g.fill();
  } else {
    if (f.kind === 0) {
      g.fillStyle = '#a5773f';
      for (const [ox, oy] of [[-6, -h + 5], [6, -h + 6], [0, -h]]) {
        g.beginPath(); g.ellipse(x + ox * f.s, y + oy * f.s, 7 * f.s, 6 * f.s, 0.4, 0, Math.PI * 2); g.fill();
      }
    } else {
      g.fillStyle = '#4caf50';
      for (const a of [-0.5, 0, 0.5]) {
        g.beginPath(); g.ellipse(x + a * 14 * f.s, y - h - 8 * f.s, 4 * f.s, 10 * f.s, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#7b1e45';
      for (const ox of [-6, 6]) { g.beginPath(); g.arc(x + ox * f.s, y - h + 5 * f.s, 7 * f.s, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = '#c9a26a';
    g.beginPath(); g.ellipse(x, y - h * 0.45, w, h * 0.55, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x - 4 * f.s, y - h * 0.55, 3 * f.s, 0, Math.PI * 2); g.arc(x + 4 * f.s, y - h * 0.55, 3 * f.s, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#222';
  g.beginPath(); g.arc(x - 4 * f.s, y - h * 0.5, 1.5 * f.s, 0, Math.PI * 2); g.arc(x + 4 * f.s, y - h * 0.5, 1.5 * f.s, 0, Math.PI * 2); g.fill();
}

// ============ ЛИСИЧАНСЬК (за фото: терикони і стела) ============

function cloud(g: G, x: number, y: number, s: number, dark: number) {
  const parts: [number, number, number][] = [[0, 0, 40], [38, -22, 46], [82, -8, 42], [118, 4, 34], [52, 14, 40], [-30, 12, 30], [10, 20, 34]];
  // тінь (низ хмари)
  for (const [ox, oy, r] of parts) {
    g.fillStyle = `rgba(${120 - dark * 40},${130 - dark * 40},${150 - dark * 30},0.9)`;
    g.beginPath(); g.arc(x + ox * s, y + (oy + 10) * s, r * s, 0, Math.PI * 2); g.fill();
  }
  for (const [ox, oy, r] of parts) {
    const gr = g.createRadialGradient(x + ox * s - r * s * 0.3, y + oy * s - r * s * 0.5, 2, x + ox * s, y + oy * s, r * s);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.7, '#eef2f8');
    gr.addColorStop(1, `rgba(${200 - dark * 50},${208 - dark * 50},${222 - dark * 40},0.95)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x + ox * s, y + oy * s, r * s, 0, Math.PI * 2); g.fill();
  }
}

/** Терикон: конус з борозенками ерозії від вершини до підніжжя. */
function terykon(g: G, ax: number, ay: number, left: number, right: number, base: number, seed: number, flat = 0) {
  const r = rng(seed);
  g.save();
  g.beginPath();
  g.moveTo(left, base);
  g.lineTo(ax - flat, ay);
  g.quadraticCurveTo(ax, ay - 3, ax + flat, ay);
  g.lineTo(right, base);
  g.closePath();
  const gr = g.createLinearGradient(left, 0, right, 0);
  gr.addColorStop(0, '#e6cc9f');
  gr.addColorStop(0.42, '#d6b684');
  gr.addColorStop(0.7, '#bf9a66');
  gr.addColorStop(1, '#a3804f');
  g.fillStyle = gr;
  g.fill();
  g.clip();
  // руді патьоки (горіла порода) у нижній правій частині
  for (let i = 0; i < 9; i++) {
    const t = 0.5 + r() * 0.45;
    const x = ax + (right - ax) * t * (0.4 + r() * 0.6);
    const y = ay + (base - ay) * (0.55 + r() * 0.35);
    const rr = g.createRadialGradient(x, y, 2, x, y, 40 + r() * 40);
    rr.addColorStop(0, 'rgba(178,82,45,0.28)');
    rr.addColorStop(1, 'rgba(178,72,38,0)');
    g.fillStyle = rr;
    g.beginPath(); g.ellipse(x, y, 70, 26, -0.4, 0, Math.PI * 2); g.fill();
  }
  // борозенки: від вершини вниз, злегка хвилясті
  const n = 46;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bx = left + (right - left) * t;
    const lightSide = bx < ax;
    g.strokeStyle = lightSide ? `rgba(130,95,55,${0.12 + r() * 0.14})` : `rgba(85,58,30,${0.14 + r() * 0.16})`;
    g.lineWidth = 0.7 + r() * 1.1;
    g.beginPath();
    const sx = ax + (bx - ax) * 0.08;
    const sy = ay + 6 + r() * 10;
    g.moveTo(sx, sy);
    const segs = 6;
    for (let k = 1; k <= segs; k++) {
      const u = k / segs;
      const x = sx + (bx - sx) * u + (r() - 0.5) * 3 * u;
      const y = sy + (base - sy) * u;
      g.lineTo(x, y);
    }
    g.stroke();
    // світлі гребені між борозенками
    if (lightSide && i % 2 === 0) {
      g.strokeStyle = 'rgba(240,222,190,0.25)';
      g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(sx + 1, sy); g.lineTo(bx + 2, base); g.stroke();
    }
  }
  // затінення правого схилу
  const sh = g.createLinearGradient(ax, 0, right, 0);
  sh.addColorStop(0, 'rgba(40,25,10,0)');
  sh.addColorStop(1, 'rgba(40,25,10,0.18)');
  g.fillStyle = sh;
  g.fillRect(ax, ay - 5, right - ax, base - ay + 5);
  g.restore();
}

function birch(g: G, x: number, base: number, h: number, seed: number) {
  const r = rng(seed);
  g.strokeStyle = '#f2efe6';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, base); g.lineTo(x + 3, base - h); g.stroke();
  g.fillStyle = '#2d2a26';
  for (let y = base - 8; y > base - h; y -= 9) g.fillRect(x - 1 + (r() < 0.5 ? 0 : 1.5), y, 2.5, 1.6);
  g.strokeStyle = 'rgba(240,236,225,0.9)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = base - h * (0.35 + r() * 0.6);
    g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + 2 + (r() - 0.5) * 26, y - 10 - r() * 10); g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = ['#e0b33c', '#c9962a', '#e8c65a', '#9a8a3a'][i % 4];
    g.globalAlpha = 0.75;
    g.beginPath();
    g.arc(x + (r() - 0.5) * 30, base - h * (0.4 + r() * 0.6), 2 + r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Об'ємні літери: синій верх, жовтий низ, синя "товщина" — як на справжній стелі. */
function blockText(g: G, s: string, x: number, y: number, size: number, depth: number) {
  g.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  for (let d = depth; d > 0; d--) {
    g.fillStyle = d === depth ? '#2a6fb0' : '#3f8fd0';
    g.fillText(s, x - d * 0.9, y + d * 0.55);
  }
  g.save();
  g.fillStyle = '#f2c230';
  g.fillText(s, x, y);
  g.beginPath();
  g.rect(x - 5, y - size, 2000, size * 0.52);
  g.clip();
  g.fillStyle = '#56b4e9';
  g.fillText(s, x, y);
  g.restore();
}

function stela(g: G) {
  // стела на в'їзді: літери на клиноподібній основі, стовп "1710" з гербом
  const bx = 22, by = 462;
  // дерев'яний стовп ЛЕП з дротами
  g.fillStyle = '#6b5a48';
  g.fillRect(188, by - 150, 8, 150);
  g.strokeStyle = 'rgba(40,40,40,0.75)';
  g.lineWidth = 1;
  for (const dy of [0, 10]) {
    g.beginPath(); g.moveTo(0, by - 160 + dy); g.quadraticCurveTo(100, by - 132 + dy, 192, by - 146 + dy); g.quadraticCurveTo(320, by - 128 + dy, 440, by - 165 + dy); g.stroke();
  }
  // бетонний стовп
  g.fillStyle = '#e9e7df';
  g.fillRect(196, by - 140, 22, 140);
  g.fillStyle = '#cfccc2';
  g.fillRect(214, by - 140, 4, 140);
  // герб: жовта рамка, синє поле, золотий кінь (шаховий), стрічка з назвою
  const hx = 207, hy = by - 158;
  g.fillStyle = '#e7b52a';
  g.beginPath();
  g.moveTo(hx - 17, hy - 20); g.lineTo(hx + 17, hy - 20); g.lineTo(hx + 17, hy + 4);
  g.quadraticCurveTo(hx + 17, hy + 22, hx, hy + 28); g.quadraticCurveTo(hx - 17, hy + 22, hx - 17, hy + 4);
  g.closePath(); g.fill();
  g.fillStyle = '#3f8fd0';
  g.beginPath();
  g.moveTo(hx - 13, hy - 16); g.lineTo(hx + 13, hy - 16); g.lineTo(hx + 13, hy + 3);
  g.quadraticCurveTo(hx + 13, hy + 18, hx, hy + 23); g.quadraticCurveTo(hx - 13, hy + 18, hx - 13, hy + 3);
  g.closePath(); g.fill();
  g.fillStyle = '#f2c230';
  g.beginPath();
  g.moveTo(hx - 6, hy + 14); g.lineTo(hx - 5, hy + 2); g.quadraticCurveTo(hx - 8, hy - 4, hx - 2, hy - 11);
  g.lineTo(hx + 1, hy - 14); g.lineTo(hx + 3, hy - 9); g.quadraticCurveTo(hx + 9, hy - 6, hx + 8, hy - 1);
  g.lineTo(hx + 3, hy - 2); g.quadraticCurveTo(hx + 1, hy + 4, hx + 6, hy + 14);
  g.closePath(); g.fill();
  g.fillStyle = '#56b4e9';
  g.beginPath(); g.moveTo(hx - 22, hy - 26); g.quadraticCurveTo(hx, hy - 33, hx + 22, hy - 26); g.lineTo(hx + 20, hy - 19); g.quadraticCurveTo(hx, hy - 26, hx - 20, hy - 19); g.closePath(); g.fill();
  g.font = '700 5px system-ui, sans-serif';
  g.fillStyle = '#1f4f80';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Лисичанськ', hx, hy - 25);
  // "1710"
  g.fillStyle = '#e9e7df';
  g.fillRect(186, by - 98, 46, 22);
  blockText(g, '1710', 190, by - 79, 18, 3);
  // клиноподібна основа з літерами
  g.fillStyle = '#3f8fd0';
  g.beginPath();
  g.moveTo(bx, by); g.lineTo(bx + 30, by - 32); g.lineTo(bx + 36, by - 32); g.lineTo(bx + 14, by);
  g.closePath(); g.fill();
  g.fillStyle = '#d8d4c8';
  g.fillRect(bx + 14, by - 4, 318, 6);
  blockText(g, 'ЛИСИЧАНСЬК', bx + 30, by - 4, 34, 6);
}

function lysStatic(g: G) {
  // небо з купчастими хмарами
  const sky = g.createLinearGradient(0, 0, 0, 440);
  sky.addColorStop(0, '#5f9fe6');
  sky.addColorStop(0.6, '#a9cdf2');
  sky.addColorStop(1, '#d6e4f2');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  // смугасті хмари праворуч
  for (let i = 0; i < 14; i++) {
    const r = rng(i + 200);
    const x = 420 + r() * 560, y = 40 + r() * 260;
    const gr = g.createLinearGradient(0, y - 12, 0, y + 14);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(1, 'rgba(150,165,190,0.8)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, 70 + r() * 90, 10 + r() * 9, -0.05, 0, Math.PI * 2); g.fill();
  }
  // велика купчаста хмара ліворуч, з темною основою
  cloud(g, 40, 230, 1.6, 1);
  cloud(g, 150, 160, 1.3, 0.6);
  cloud(g, 330, 260, 1.0, 0.8);
  cloud(g, 60, 80, 1.0, 0.2);
  g.fillStyle = 'rgba(95,105,125,0.55)';
  g.beginPath(); g.ellipse(170, 330, 260, 40, 0, 0, Math.PI * 2); g.fill();
  // далекий обрій: місто ліворуч, труба й багатоповерхівки праворуч, вишка
  g.fillStyle = '#7b8a7a';
  g.fillRect(0, 418, W, 30);
  g.fillStyle = '#dcdcd6';
  for (const [x, w, h] of [[905, 22, 16], [930, 30, 12]] as const) g.fillRect(x, 418 - h, w, h);
  g.fillStyle = '#8a3c2c';
  g.fillRect(890, 368, 5, 52);
  g.strokeStyle = '#a33';
  g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(160, 420); g.lineTo(166, 360); g.lineTo(172, 420); g.moveTo(162, 400); g.lineTo(170, 400); g.moveTo(164, 380); g.lineTo(168, 380); g.stroke();
  for (const [x, c] of [[40, '#e6e1d6'], [70, '#c44'], [96, '#e6e1d6']] as const) { g.fillStyle = c; g.fillRect(x, 430, 22, 12); }
  // другий терикон (позаду, пласкіший, з конструкцією на вершині)
  terykon(g, 745, 268, 560, 980, 452, 31, 22);
  g.strokeStyle = '#444';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(735, 270); g.lineTo(742, 246); g.lineTo(752, 270); g.moveTo(742, 246); g.lineTo(770, 252); g.moveTo(742, 246); g.lineTo(720, 256); g.stroke();
  // головний терикон — правильний конус
  terykon(g, 455, 168, 175, 770, 458, 17);
  // кущі й осінній степ біля підніжжя
  for (let i = 0; i < 60; i++) {
    const r = rng(i + 400);
    g.fillStyle = ['#7d8a3a', '#a07a2a', '#6a7a35', '#b8852f'][i % 4];
    g.beginPath(); g.ellipse(r() * W, 450 + r() * 14, 8 + r() * 14, 5 + r() * 6, 0, 0, Math.PI * 2); g.fill();
  }
  const steppe = g.createLinearGradient(0, 455, 0, GROUND);
  steppe.addColorStop(0, '#a87c45');
  steppe.addColorStop(1, '#8a5f33');
  g.fillStyle = steppe;
  g.fillRect(0, 458, W, GROUND - 458);
  g.strokeStyle = 'rgba(200,150,80,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const r = rng(i + 900);
    const x = r() * W, y = 462 + r() * 28;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); g.stroke();
  }
  // берізки ліворуч
  birch(g, 352, 462, 104, 1);
  birch(g, 372, 462, 84, 2);
  birch(g, 392, 462, 114, 3);
  stela(g);
  sand(g, '#8f6a3e', '#6d4e2c');
}

// ============ КИЇВ, ХРЕЩАТИК (за фото) ============

const VPX = NET_X, VPY = 330; // точка сходу — над сіткою, тож подвійна суцільна веде прямо до неї

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Фасад сталінки в перспективі між x0 (ближче) і x1 (далі). */
function stalinka(g: G, x0: number, top0: number, x1: number, top1: number, floors: number, seed: number) {
  const r = rng(seed);
  const b0 = 470, b1 = VPY + 22;
  // стіна
  g.beginPath();
  g.moveTo(x0, top0); g.lineTo(x1, top1); g.lineTo(x1, b1); g.lineTo(x0, b0); g.closePath();
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, '#e6d8bd');
  gr.addColorStop(1, '#d3c4a6');
  g.fillStyle = gr;
  g.fill();
  // гранітний низ (2 поверхи)
  const gfr = 0.24;
  g.beginPath();
  g.moveTo(x0, lerp(b0, top0, gfr)); g.lineTo(x1, lerp(b1, top1, gfr)); g.lineTo(x1, b1); g.lineTo(x0, b0); g.closePath();
  g.fillStyle = '#9a7d64';
  g.fill();
  // карниз
  g.fillStyle = '#b9a888';
  g.beginPath();
  g.moveTo(x0, top0 - 10); g.lineTo(x1, top1 - 3); g.lineTo(x1, top1 + 2); g.lineTo(x0, top0 + 8); g.closePath(); g.fill();
  // вікна по перспективній сітці
  const cols = Math.round((x1 - x0) / 14);
  for (let c = 0; c < cols; c++) {
    const t0 = (c + 0.25) / cols, t1 = (c + 0.7) / cols;
    // перспективне стиснення: ближні колонки ширші
    const p0 = 1 - Math.pow(1 - t0, 1.6), p1 = 1 - Math.pow(1 - t1, 1.6);
    const xa = lerp(x0, x1, p0), xb = lerp(x0, x1, p1);
    const topA = lerp(top0, top1, p0), topB = lerp(top0, top1, p1);
    const botA = lerp(b0, b1, p0), botB = lerp(b0, b1, p1);
    for (let f = 0; f < floors; f++) {
      const u0 = 0.06 + (f / floors) * 0.7, u1 = u0 + 0.7 / floors * 0.62;
      const ya0 = lerp(topA, botA, u0), ya1 = lerp(topA, botA, u1);
      const yb0 = lerp(topB, botB, u0), yb1 = lerp(topB, botB, u1);
      g.fillStyle = r() < 0.15 ? '#8fa6b8' : '#5d6b78';
      g.beginPath(); g.moveTo(xa, ya0); g.lineTo(xb, yb0); g.lineTo(xb, yb1); g.lineTo(xa, ya1); g.closePath(); g.fill();
    }
    // вітрини внизу
    const ya0 = lerp(topA, botA, 0.82), ya1 = lerp(topA, botA, 0.97);
    const yb0 = lerp(topB, botB, 0.82), yb1 = lerp(topB, botB, 0.97);
    g.fillStyle = '#3d4650';
    g.beginPath(); g.moveTo(xa, ya0); g.lineTo(xb, yb0); g.lineTo(xb, yb1); g.lineTo(xa, ya1); g.closePath(); g.fill();
  }
  // пілястри
  g.strokeStyle = 'rgba(255,248,230,0.35)';
  g.lineWidth = 1.5;
  for (let c = 0; c <= cols; c += 3) {
    const p = 1 - Math.pow(1 - c / cols, 1.6);
    const x = lerp(x0, x1, p);
    g.beginPath(); g.moveTo(x, lerp(top0, top1, p) + 8); g.lineTo(x, lerp(b0, b1, p) - (lerp(b0, b1, p) - lerp(top0, top1, p)) * gfr); g.stroke();
  }
}

function lamp(g: G, x: number, base: number, s: number) {
  g.fillStyle = '#5c5f63';
  g.fillRect(x - 2 * s, base - 120 * s, 4 * s, 120 * s);
  g.fillRect(x - 6 * s, base - 14 * s, 12 * s, 14 * s);
  g.strokeStyle = '#5c5f63';
  g.lineWidth = 2 * s;
  g.beginPath();
  g.moveTo(x - 16 * s, base - 108 * s); g.quadraticCurveTo(x, base - 126 * s, x + 16 * s, base - 108 * s);
  g.stroke();
  g.fillStyle = '#f4f2ea';
  for (const dx of [-16, 0, 16]) {
    g.beginPath(); g.arc(x + dx * s, base - (dx === 0 ? 128 : 104) * s, 5 * s, 0, Math.PI * 2); g.fill();
  }
}

function chestnutTree(g: G, x: number, base: number, s: number, seed: number) {
  const r = rng(seed);
  g.fillStyle = '#4a3527';
  g.fillRect(x - 4 * s, base - 70 * s, 8 * s, 70 * s);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = ['#4f7d36', '#5f8f3c', '#3e6a2c', '#c27b2c', '#8a9a3a'][i % 5];
    g.beginPath();
    g.arc(x + (r() - 0.5) * 90 * s, base - (70 + r() * 80) * s, (9 + r() * 10) * s, 0, Math.PI * 2);
    g.fill();
  }
}

function kyivStatic(g: G) {
  const sky = g.createLinearGradient(0, 0, 0, VPY);
  sky.addColorStop(0, '#5aa0ea');
  sky.addColorStop(1, '#cfe3f7');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  // Будинок профспілок: скляний фасад з екранами та вежа з годинником
  g.fillStyle = '#c9ced4';
  g.fillRect(390, 258, 230, 80);
  g.fillStyle = '#2f4f8f';
  g.fillRect(398, 266, 214, 60);
  g.strokeStyle = 'rgba(200,220,255,0.35)';
  g.lineWidth = 1;
  for (let x = 398; x < 612; x += 9) { g.beginPath(); g.moveTo(x, 266); g.lineTo(x, 326); g.stroke(); }
  for (let y = 266; y < 326; y += 7) { g.beginPath(); g.moveTo(398, y); g.lineTo(612, y); g.stroke(); }
  // рекламні екрани
  g.fillStyle = '#d8dde4';
  g.fillRect(540, 272, 62, 40);
  g.fillStyle = '#e8743b';
  g.fillRect(544, 276, 54, 32);
  g.fillStyle = '#ffd56a';
  g.fillRect(548, 288, 30, 6);
  // вежа
  g.fillStyle = '#e8eaee';
  g.fillRect(455, 168, 46, 92);
  g.fillStyle = '#c8ccd2';
  g.fillRect(493, 168, 8, 92);
  g.fillStyle = '#b0b6bf';
  g.fillRect(450, 160, 56, 10);
  g.fillRect(462, 140, 32, 22);
  g.fillStyle = '#7d8691';
  g.fillRect(476, 116, 4, 26);
  g.fillStyle = '#d6262b';
  g.beginPath(); g.arc(478, 114, 3, 0, Math.PI * 2); g.fill();
  // місце під табло (саме табло з рахунком малюється анімованим шаром)
  g.fillStyle = '#20262e';
  g.fillRect(458, 178, 40, 34);
  // будівлі праворуч у глибині
  g.fillStyle = '#d9cdb6';
  g.beginPath(); g.moveTo(620, 290); g.lineTo(700, 250); g.lineTo(700, 352); g.lineTo(620, 345); g.fill();
  // ліві сталінки (ближня — велика)
  stalinka(g, 0, 10, 300, 200, 7, 3);
  stalinka(g, 300, 200, 392, 252, 7, 4);
  // дорога в перспективі
  g.fillStyle = '#7d8086';
  g.beginPath(); g.moveTo(-200, H); g.lineTo(VPX - 40, VPY + 12); g.lineTo(VPX + 60, VPY + 12); g.lineTo(W + 260, H); g.closePath(); g.fill();
  // тротуари
  g.fillStyle = '#a8a39a';
  g.beginPath(); g.moveTo(0, 470); g.lineTo(390, VPY + 22); g.lineTo(VPX - 40, VPY + 12); g.lineTo(-200, H); g.lineTo(0, H); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(W, 455); g.lineTo(640, VPY + 16); g.lineTo(VPX + 60, VPY + 12); g.lineTo(W + 260, H); g.closePath(); g.fill();
  // розмітка: пунктири до точки сходу і подвійна суцільна посередині
  const toVP = (bx: number, t: number) => [lerp(bx, VPX, t), lerp(H, VPY + 12, t)];
  g.strokeStyle = 'rgba(245,245,245,0.9)';
  for (const bx of [-60, 180, 780, 1020]) {
    for (let k = 0; k < 14; k++) {
      const t0 = 1 - Math.pow(1 - k / 14, 1) , t1 = t0 + 0.035;
      const [xa, ya] = toVP(bx, t0), [xb, yb] = toVP(bx, Math.min(0.98, t1));
      g.lineWidth = lerp(5, 1, t0);
      g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.stroke();
    }
  }
  for (const off of [-7, 7]) {
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(VPX + off, H); g.lineTo(VPX + off * 0.15, VPY + 14); g.stroke();
  }
  // стрілки на смугах
  g.fillStyle = 'rgba(245,245,245,0.85)';
  for (const [x, y] of [[300, 470], [640, 470]] as const) {
    g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 10, y); g.lineTo(x + 4, y); g.lineTo(x + 4, y + 12); g.lineTo(x - 4, y + 12); g.lineTo(x - 4, y); g.lineTo(x - 10, y); g.closePath(); g.fill();
  }
  // каштани і ліхтарі праворуч (у перспективі)
  for (const [x, s, seed] of [[690, 0.55, 1], [760, 0.75, 2], [870, 1.05, 3]] as const) chestnutTree(g, x, lerp(352, 470, (x - 640) / 320), s, seed);
  for (const [x, s] of [[640, 0.45], [720, 0.62], [820, 0.85], [940, 1.15]] as const) lamp(g, x, lerp(350, 476, (x - 620) / 330), s);
  for (const [x, s] of [[360, 0.5], [250, 0.7], [110, 1.0]] as const) lamp(g, x, lerp(345, 478, (390 - x) / 300), s);
  // синій покажчик над дорогою
  g.fillStyle = '#5c5f63';
  g.fillRect(668, 270, 3, 70);
  g.fillStyle = '#1f5fbf';
  g.fillRect(546, 262, 126, 22);
  g.strokeStyle = '#fff';
  g.lineWidth = 1;
  g.strokeRect(548, 264, 122, 18);
  txt(g, '↑ Майдан Незалежності', 609, 273, 9, '#fff', 700);
  // святкові гірлянди через вулицю
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 1.2;
  for (const [y0, x0, x1, n] of [[60, 0, 760, 9], [130, 180, 640, 7], [190, 320, 600, 6]] as const) {
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * w;
      g.beginPath(); g.moveTo(a, y0); g.quadraticCurveTo(a + w / 2, y0 + w * 0.35, a + w, y0); g.stroke();
      g.beginPath(); g.moveTo(a, y0 + 3); g.quadraticCurveTo(a + w / 2, y0 + w * 0.28, a + w, y0 + 3); g.stroke();
      // сніжинка
      const sx = a + w / 2, sy = y0 + w * 0.3;
      for (let k = 0; k < 3; k++) {
        const an = (k * Math.PI) / 3;
        g.beginPath(); g.moveTo(sx - Math.cos(an) * 6, sy - Math.sin(an) * 6); g.lineTo(sx + Math.cos(an) * 6, sy + Math.sin(an) * 6); g.stroke();
      }
    }
  }
  // асфальт ігрової зони
  const road = g.createLinearGradient(0, GROUND, 0, H);
  road.addColorStop(0, '#7a7d83');
  road.addColorStop(1, '#5d6066');
  g.fillStyle = road;
  g.fillRect(0, GROUND, W, H - GROUND);
  g.fillStyle = 'rgba(245,245,245,0.9)';
  g.fillRect(NET_X - 9, GROUND, 4, H - GROUND);
  g.fillRect(NET_X + 5, GROUND, 4, H - GROUND);
}

function kyivAnim(g: G, t: number, score: [number, number]) {
  // табло на вежі Будинку профспілок показує рахунок матчу (по черзі з часом)
  const showTime = Math.floor(t / 6) % 3 === 2;
  g.fillStyle = '#11161c';
  g.fillRect(460, 180, 36, 30);
  g.font = '800 14px "Courier New", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ff5a3c';
  if (showTime) {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    g.font = '800 11px "Courier New", monospace';
    g.fillText(`${hh}${t % 1 < 0.5 ? ':' : ' '}${mm}`, 478, 195);
  } else {
    g.fillText(`${score[0]}:${score[1]}`, 478, 195);
  }
}

// ============ МЕТРО «ХРЕЩАТИК» ============

function metroStatic(g: G) {
  // склепіння
  g.fillStyle = '#1d1b1a';
  g.fillRect(0, 0, W, GROUND);
  const vault = g.createLinearGradient(0, 0, 0, 200);
  vault.addColorStop(0, '#d9d2c3');
  vault.addColorStop(1, '#b9b0a0');
  g.fillStyle = vault;
  g.beginPath();
  g.moveTo(0, 200);
  g.quadraticCurveTo(W / 2, -60, W, 200);
  g.lineTo(W, 0);
  g.lineTo(0, 0);
  g.fill();
  g.fillStyle = '#cfc6b4';
  g.beginPath();
  g.moveTo(0, 210);
  g.quadraticCurveTo(W / 2, -40, W, 210);
  g.lineTo(W, 200);
  g.quadraticCurveTo(W / 2, -60, 0, 200);
  g.fill();
  // колійна стіна: світла кераміка з орнаментом
  g.fillStyle = '#ece6d6';
  g.fillRect(0, 200, W, 230);
  g.strokeStyle = 'rgba(150,140,120,0.35)';
  g.lineWidth = 1;
  for (let y = 210; y < 430; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, 200); g.lineTo(x, 430); g.stroke(); }
  // орнаментальна смуга
  g.fillStyle = '#9b6b3a';
  g.fillRect(0, 232, W, 22);
  g.fillStyle = '#e3b04b';
  for (let x = 6; x < W; x += 28) {
    g.beginPath();
    g.moveTo(x, 243); g.lineTo(x + 8, 235); g.lineTo(x + 16, 243); g.lineTo(x + 8, 251);
    g.fill();
  }
  // назва станції
  g.fillStyle = '#2a2a2a';
  g.fillRect(W / 2 - 170, 280, 340, 56);
  txt(g, 'ХРЕЩАТИК', W / 2, 309, 40, '#f4efe2', 900);
  txt(g, '→ Майдан Незалежності', 120, 300, 14, '#2a2a2a', 700);
  txt(g, '← Арсенальна', 840, 300, 14, '#2a2a2a', 700);
  // колійна яма
  g.fillStyle = '#2b2725';
  g.fillRect(0, 430, W, 30);
  g.fillStyle = '#6b6b6b';
  g.fillRect(0, 448, W, 4);
  // платформа
  g.fillStyle = '#e6c84a';
  g.fillRect(0, 460, W, 6);
  sand(g, '#8b8580', '#5e5955');
  g.fillStyle = '#b5ada3';
  g.fillRect(0, 466, W, GROUND - 466);
  g.strokeStyle = 'rgba(60,55,50,0.4)';
  for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, 466); g.lineTo(x, GROUND); g.stroke(); }
  // світильники
  for (let i = 0; i < 6; i++) {
    const x = 80 + i * 160;
    g.strokeStyle = '#3a3a3a';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, 40 + Math.abs(i - 2.5) * 22); g.lineTo(x, 120); g.stroke();
    const l = g.createRadialGradient(x, 128, 2, x, 128, 70);
    l.addColorStop(0, 'rgba(255,240,200,0.9)');
    l.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = l;
    g.fillRect(x - 70, 60, 140, 140);
    g.fillStyle = '#f7e9c3';
    g.beginPath(); g.ellipse(x, 126, 16, 9, 0, 0, Math.PI * 2); g.fill();
  }
}

function metroAnim(g: G, t: number) {
  // поїзд проїжджає кожні 22 с
  const period = 22;
  const p = (t % period) / 6; // 0..1 проїзд за 6 с
  if (p < 1) {
    const len = 900;
    const x = -len + p * (W + len * 2);
    g.save();
    g.beginPath();
    g.rect(0, 340, W, 120);
    g.clip();
    for (let c = 0; c < 5; c++) {
      const cx = x + c * 190;
      g.fillStyle = '#2f6f8f';
      g.fillRect(cx, 362, 182, 92);
      g.fillStyle = '#e8e2c8';
      g.fillRect(cx, 400, 182, 8);
      g.fillStyle = '#bfe3ef';
      for (let w = 0; w < 4; w++) g.fillRect(cx + 14 + w * 42, 372, 28, 22);
      g.fillStyle = '#1f2a33';
      g.fillRect(cx + 70, 410, 40, 44);
    }
    g.restore();
  }
}

// ============ ДВІР ХРУЩОВКИ ============

function yardStatic(g: G) {
  // похмуре небо
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#8d98a6');
  sky.addColorStop(0.6, '#b9c0c8');
  sky.addColorStop(1, '#cdd1d4');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  for (let i = 0; i < 8; i++) {
    const r = rng(i + 300);
    g.fillStyle = 'rgba(120,130,145,0.35)';
    g.beginPath(); g.ellipse(r() * W, 30 + r() * 80, 120 + r() * 120, 14 + r() * 10, 0, 0, Math.PI * 2); g.fill();
  }
  // панельна п'ятиповерхівка
  const bx = 70, bw = 820, top = 92, fh = 70;
  g.fillStyle = '#c6c1b4';
  g.fillRect(bx, top, bw, GROUND - top);
  // стики панелей
  const pw = 68;
  g.strokeStyle = 'rgba(90,85,75,0.45)';
  g.lineWidth = 1.5;
  for (let x = bx; x <= bx + bw; x += pw) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, GROUND); g.stroke(); }
  for (let y = top; y < GROUND; y += fh) { g.beginPath(); g.moveTo(bx, y); g.lineTo(bx + bw, y); g.stroke(); }
  // плями і потіки на панелях
  for (let i = 0; i < 40; i++) {
    const r = rng(i + 50);
    g.fillStyle = `rgba(110,100,85,${0.06 + r() * 0.1})`;
    g.fillRect(bx + r() * bw, top + r() * (GROUND - top - 60), 4 + r() * 40, 10 + r() * 50);
  }
  // дах
  g.fillStyle = '#6f6a62';
  g.fillRect(bx - 8, top - 10, bw + 16, 12);
  g.fillStyle = '#8a857c';
  g.fillRect(bx + 120, top - 26, 40, 16);
  g.fillRect(bx + 620, top - 22, 30, 12);
  // антени
  g.strokeStyle = '#555';
  g.lineWidth = 1.2;
  for (const x of [bx + 200, bx + 470, bx + 700]) {
    g.beginPath(); g.moveTo(x, top - 10); g.lineTo(x, top - 46); g.moveTo(x - 14, top - 40); g.lineTo(x + 14, top - 40); g.moveTo(x - 10, top - 32); g.lineTo(x + 10, top - 32); g.stroke();
  }
  const r = rng(5);
  const floors = 5;
  const cols = Math.floor(bw / pw);
  for (let f = 0; f < floors; f++) {
    const y = top + 14 + f * fh;
    if (y + 46 > GROUND - 70 && f === floors - 1) { /* перший поверх — нижче */ }
    for (let c = 0; c < cols; c++) {
      const x = bx + c * pw + 14;
      const isEntrance = f === floors - 1 && (c === 3 || c === 8);
      if (isEntrance) continue;
      const pvc = r() < 0.6;
      const lit = r() < 0.22;
      // віконна рама
      g.fillStyle = pvc ? '#f4f4f2' : '#8a6a4a';
      g.fillRect(x - 2, y - 2, 44, 46);
      // скло з відблиском
      const gl = g.createLinearGradient(x, y, x + 40, y + 42);
      gl.addColorStop(0, lit ? '#f8e7a8' : '#6f7f8e');
      gl.addColorStop(1, lit ? '#e3c46a' : '#3f4b57');
      g.fillStyle = gl;
      g.fillRect(x, y, 40, 42);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(x, y + 42); g.lineTo(x + 14, y); g.lineTo(x + 22, y); g.lineTo(x + 8, y + 42); g.fill();
      // імпости
      g.fillStyle = pvc ? '#f4f4f2' : '#8a6a4a';
      g.fillRect(x + 19, y, 2.5, 42);
      if (!pvc) g.fillRect(x, y + 14, 40, 2.5);
      // штори
      if (r() < 0.45) {
        g.fillStyle = ['#c9a8a0', '#e6d9b8', '#9fb4c8', '#d6b3c9'][Math.floor(r() * 4)];
        g.globalAlpha = 0.75;
        g.fillRect(x + 1, y + 1, 9, 40);
        g.fillRect(x + 30, y + 1, 9, 40);
        g.globalAlpha = 1;
      }
      // підвіконня
      g.fillStyle = '#9a958a';
      g.fillRect(x - 4, y + 44, 48, 3);
      // балкони: засклені, відкриті з мотлохом, з металевими листами
      if (f < floors - 1 && r() < 0.42) {
        const kind = r();
        const by = y + 30;
        if (kind < 0.35) {
          // заскленений білим ПВХ
          g.fillStyle = '#efefec';
          g.fillRect(x - 10, by - 26, 60, 46);
          g.fillStyle = '#8796a4';
          for (let k = 0; k < 3; k++) g.fillRect(x - 7 + k * 19, by - 23, 16, 22);
          g.fillStyle = '#d9d7d0';
          g.fillRect(x - 10, by, 60, 20);
        } else if (kind < 0.65) {
          // старий, обшитий профлистом
          g.fillStyle = ['#7f98a8', '#a0866a', '#8aa07a'][Math.floor(r() * 3)];
          g.fillRect(x - 10, by, 60, 20);
          g.strokeStyle = 'rgba(0,0,0,0.18)';
          g.lineWidth = 1;
          for (let k = 0; k < 60; k += 4) { g.beginPath(); g.moveTo(x - 10 + k, by); g.lineTo(x - 10 + k, by + 20); g.stroke(); }
          // мотлох: коробки, лижі, банки
          g.fillStyle = '#b08b5a';
          g.fillRect(x - 6, by - 12, 14, 12);
          g.strokeStyle = '#3a6fb0';
          g.lineWidth = 2;
          g.beginPath(); g.moveTo(x + 40, by - 24); g.lineTo(x + 44, by); g.stroke();
        } else {
          // відкритий з ґратками і білизною
          g.strokeStyle = '#4a4a4a';
          g.lineWidth = 1.2;
          g.strokeRect(x - 10, by, 60, 18);
          for (let k = 0; k < 60; k += 6) { g.beginPath(); g.moveTo(x - 10 + k, by); g.lineTo(x - 10 + k, by + 18); g.stroke(); }
          g.beginPath(); g.moveTo(x - 8, by - 14); g.lineTo(x + 48, by - 14); g.stroke();
          for (let k = 0; k < 4; k++) {
            g.fillStyle = ['#e85a9b', '#58b7ff', '#ffffff', '#f2c230'][k];
            g.fillRect(x - 4 + k * 13, by - 14, 9, 13);
          }
        }
        g.fillStyle = '#a7a297';
        g.fillRect(x - 12, by + 20, 64, 3);
      }
      // кондиціонер / тарілка
      if (r() < 0.12) {
        g.fillStyle = '#ececea';
        g.fillRect(x + 42, y + 18, 18, 14);
        g.fillStyle = '#9a9a98';
        g.beginPath(); g.arc(x + 51, y + 25, 4, 0, Math.PI * 2); g.fill();
      } else if (r() < 0.06) {
        g.fillStyle = '#dedede';
        g.beginPath(); g.ellipse(x + 50, y + 10, 8, 11, -0.5, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // під'їзди: козирок, металеві двері, домофон, лампа, табличка
  for (const c of [3, 8]) {
    const x = bx + c * pw + 8;
    const y = GROUND - 78;
    g.fillStyle = '#9a958a';
    g.fillRect(x - 14, y - 6, 80, 9);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(x - 14, y + 3, 80, 4);
    g.fillStyle = '#5a3c2c';
    g.fillRect(x + 8, y + 10, 36, 68);
    g.fillStyle = '#4a3022';
    g.fillRect(x + 12, y + 14, 28, 60);
    g.fillStyle = '#bbb';
    g.fillRect(x + 34, y + 38, 3, 10);
    g.fillStyle = '#303030';
    g.fillRect(x + 48, y + 30, 8, 12);
    g.fillStyle = '#f7e9a8';
    g.beginPath(); g.arc(x + 26, y + 6, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1f4f9c';
    g.fillRect(x + 50, y + 12, 14, 9);
  }
  // дроти
  g.strokeStyle = 'rgba(40,40,40,0.6)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 150); g.quadraticCurveTo(480, 200, W, 140); g.stroke();
  g.beginPath(); g.moveTo(0, 160); g.quadraticCurveTo(480, 214, W, 152); g.stroke();
  // дерева: береза і тополя з об'ємною кроною
  const crown = (x: number, y: number, w: number, h: number, seed: number) => {
    const rr = rng(seed);
    for (let i = 0; i < 90; i++) {
      const a = rr() * Math.PI * 2, d = Math.sqrt(rr());
      const px = x + Math.cos(a) * w * d, py = y + Math.sin(a) * h * d;
      const light = (py - (y - h)) / (2 * h);
      g.fillStyle = `rgb(${70 + (1 - light) * 40 | 0},${100 + (1 - light) * 45 | 0},${55 + (1 - light) * 20 | 0})`;
      g.beginPath(); g.arc(px, py, 5 + rr() * 7, 0, Math.PI * 2); g.fill();
    }
  };
  g.fillStyle = '#5a4a3a';
  g.fillRect(28, 210, 9, GROUND - 210);
  crown(32, 200, 46, 120, 9);
  g.fillStyle = '#efece4';
  g.fillRect(925, 250, 7, GROUND - 250);
  g.fillStyle = '#2b2b2b';
  for (let y = 260; y < GROUND; y += 14) g.fillRect(925, y, 4, 2);
  crown(928, 260, 40, 70, 11);
  // низенький зелений паркан
  g.strokeStyle = '#3f6b3f';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(560, GROUND - 30); g.lineTo(880, GROUND - 30); g.stroke();
  for (let x = 560; x <= 880; x += 16) {
    g.beginPath(); g.moveTo(x, GROUND - 34); g.lineTo(x, GROUND - 4); g.stroke();
    g.beginPath(); g.moveTo(x, GROUND - 30); g.quadraticCurveTo(x + 8, GROUND - 40, x + 16, GROUND - 30); g.stroke();
  }
  // лавка
  g.fillStyle = '#7a5a3a';
  g.fillRect(690, GROUND - 40, 90, 6);
  g.fillRect(690, GROUND - 56, 90, 5);
  g.fillStyle = '#3a3a3a';
  g.fillRect(696, GROUND - 34, 4, 30);
  g.fillRect(770, GROUND - 34, 4, 30);
  // бетонна огорожа смітника і баки
  g.fillStyle = '#a19c92';
  g.fillRect(10, GROUND - 88, 230, 10);
  g.fillRect(10, GROUND - 88, 10, 88);
  g.fillStyle = 'rgba(60,55,50,0.25)';
  for (let x = 20; x < 240; x += 40) g.fillRect(x, GROUND - 88, 1.5, 10);
  for (let i = 0; i < 3; i++) {
    const x = 34 + i * 66;
    const rust = rng(i + 70);
    // корпус контейнера
    const cg = g.createLinearGradient(x, 0, x + 56, 0);
    cg.addColorStop(0, '#3f6b45');
    cg.addColorStop(1, '#2b4a30');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(x, GROUND - 6); g.lineTo(x - 5, GROUND - 66); g.lineTo(x + 61, GROUND - 66); g.lineTo(x + 56, GROUND - 6);
    g.fill();
    // іржа
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(150,80,35,${0.25 + rust() * 0.3})`;
      g.fillRect(x + rust() * 50, GROUND - 60 + rust() * 50, 3 + rust() * 8, 2 + rust() * 6);
    }
    g.fillStyle = '#20381f';
    g.fillRect(x - 7, GROUND - 70, 70, 6);
    // відкрита кришка
    g.fillStyle = '#2f5232';
    g.beginPath(); g.moveTo(x - 7, GROUND - 70); g.lineTo(x - 2, GROUND - 98); g.lineTo(x + 6, GROUND - 98); g.lineTo(x + 2, GROUND - 70); g.fill();
    // коліщата
    g.fillStyle = '#222';
    g.beginPath(); g.arc(x + 6, GROUND - 4, 4, 0, Math.PI * 2); g.arc(x + 50, GROUND - 4, 4, 0, Math.PI * 2); g.fill();
    // купа сміття над баком: пакети з вузлами, коробки
    const rr = rng(i + 40);
    for (let k = 0; k < 9; k++) {
      const px = x + 4 + rr() * 50, py = GROUND - 74 - rr() * 26;
      const col = ['#1e1e22', '#3a3a5a', '#e8e4d8', '#1f6fb8', '#202020', '#c9c3b0'][k % 6];
      const bag = g.createRadialGradient(px - 4, py - 5, 1, px, py, 14);
      bag.addColorStop(0, shade(col.length === 7 ? col : '#202020', 0.35));
      bag.addColorStop(1, col);
      g.fillStyle = bag;
      g.beginPath(); g.ellipse(px, py, 11 + rr() * 6, 9 + rr() * 5, rr(), 0, Math.PI * 2); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.moveTo(px - 3, py - 9); g.lineTo(px, py - 15); g.lineTo(px + 3, py - 9); g.fill();
    }
    g.fillStyle = '#b08b5a';
    g.fillRect(x + 30, GROUND - 100, 22, 16);
    g.strokeStyle = 'rgba(80,55,30,0.6)';
    g.strokeRect(x + 30, GROUND - 100, 22, 16);
  }
  // мотлох навколо: старий матрац, пакети, коробка
  g.fillStyle = '#d7cdb2';
  g.save();
  g.translate(245, GROUND - 4);
  g.rotate(-0.25);
  g.fillRect(0, -70, 26, 70);
  g.strokeStyle = 'rgba(120,100,70,0.5)';
  for (let y = -66; y < 0; y += 10) { g.beginPath(); g.moveTo(2, y); g.lineTo(24, y); g.stroke(); }
  g.restore();
  for (const [x, c] of [[22, '#1e1e22'], [288, '#3a3a5a'], [300, '#e8e4d8']] as const) {
    g.fillStyle = c;
    g.beginPath(); g.ellipse(x, GROUND - 9, 12, 9, 0, 0, Math.PI * 2); g.fill();
  }
  // асфальт з латками, тріщинами, бордюром і калюжею
  const asph = g.createLinearGradient(0, GROUND, 0, H);
  asph.addColorStop(0, '#6c6d70');
  asph.addColorStop(1, '#4c4d50');
  g.fillStyle = asph;
  g.fillRect(0, GROUND, W, H - GROUND);
  g.fillStyle = '#9a978f';
  g.fillRect(0, GROUND, W, 4);
  g.fillStyle = 'rgba(40,40,42,0.6)';
  g.fillRect(380, GROUND + 14, 90, 22);
  g.fillRect(760, GROUND + 22, 60, 16);
  g.strokeStyle = 'rgba(25,25,25,0.7)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(140, GROUND + 6); g.lineTo(160, GROUND + 18); g.lineTo(150, GROUND + 34); g.lineTo(170, GROUND + 48);
  g.moveTo(640, GROUND + 6); g.lineTo(624, GROUND + 22); g.lineTo(642, GROUND + 44);
  g.stroke();
  const pud = g.createLinearGradient(0, GROUND + 18, 0, GROUND + 36);
  pud.addColorStop(0, 'rgba(170,185,200,0.7)');
  pud.addColorStop(1, 'rgba(120,135,150,0.5)');
  g.fillStyle = pud;
  g.beginPath(); g.ellipse(560, GROUND + 28, 64, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5f7f3a';
  for (let i = 0; i < 30; i++) {
    const rr = rng(i + 600);
    const x = rr() * W;
    g.beginPath(); g.moveTo(x, GROUND + 4); g.lineTo(x + 2, GROUND - 4 - rr() * 5); g.lineTo(x + 4, GROUND + 4); g.fill();
  }
}

function yardAnim(g: G, t: number) {
  // мухи над смітником
  g.fillStyle = '#111';
  for (let i = 0; i < 9; i++) {
    const x = 130 + Math.sin(t * (2 + i * 0.3) + i) * 80 + Math.sin(t * 7 + i * 2) * 8;
    const y = GROUND - 120 + Math.cos(t * (1.6 + i * 0.2) + i * 3) * 25;
    g.fillRect(x, y, 2.5, 2.5);
  }
  // рудий кіт на кришці баку
  const cx = 168, cy = GROUND - 112;
  g.fillStyle = '#e08a3a';
  g.beginPath(); g.ellipse(cx, cy, 16, 10, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 14, cy - 10, 8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(cx + 9, cy - 15); g.lineTo(cx + 11, cy - 24); g.lineTo(cx + 15, cy - 16); g.fill();
  g.beginPath(); g.moveTo(cx + 15, cy - 16); g.lineTo(cx + 19, cy - 24); g.lineTo(cx + 21, cy - 14); g.fill();
  g.fillStyle = '#b8682a';
  g.fillRect(cx - 6, cy - 6, 3, 10);
  g.fillRect(cx + 2, cy - 7, 3, 10);
  g.strokeStyle = '#e08a3a';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 14, cy);
  g.quadraticCurveTo(cx - 30, cy - 10 + Math.sin(t * 3) * 8, cx - 28, cy - 24 + Math.sin(t * 3) * 6);
  g.stroke();
  g.lineCap = 'butt';
}

// ============ "СІТКИ" ============

function drawNetFor(g: G, id: string, net: NetShape) {
  const capY = NET_TOP + net.cap;
  switch (id) {
    case 'beach':
      netMesh(g, net.half, '#e8463c', 'rgba(255,255,255,0.65)', '#3b2f2a');
      break;
    case 'court': {
      // темна сітка з чорною облямівкою — контрастна на світлих трибунах
      const top = NET_TOP;
      g.fillStyle = '#16213f';
      g.fillRect(NET_X - 4, top - 4, 8, GROUND - top + 4);
      g.fillStyle = 'rgba(10,14,30,0.55)';
      g.fillRect(NET_X - net.half, top + 10, net.half * 2, GROUND - top - 70);
      g.strokeStyle = '#0b1020';
      g.lineWidth = 1.2;
      g.beginPath();
      for (let y = top + 10; y < GROUND - 60; y += 7) { g.moveTo(NET_X - net.half, y); g.lineTo(NET_X + net.half, y + 3.5); }
      g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(NET_X, top + net.half, net.half, Math.PI, 0); g.lineTo(NET_X + net.half, top + 12); g.lineTo(NET_X - net.half, top + 12); g.fill();
      g.strokeStyle = '#0b1020';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#e8463c';
      g.fillRect(NET_X - 9, GROUND - 60, 18, 60);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(NET_X - 9, GROUND - 60, 5, 60);
      break;
    }
    case 'lysychansk': {
      // старий дерев'яний стовп
      const h = net.half;
      const wood = g.createLinearGradient(NET_X - h, 0, NET_X + h, 0);
      wood.addColorStop(0, '#5c3d24');
      wood.addColorStop(0.5, '#8a5f3a');
      wood.addColorStop(1, '#4e331e');
      g.fillStyle = wood;
      g.fillRect(NET_X - h, capY, h * 2, GROUND - capY);
      g.beginPath(); g.arc(NET_X, capY, net.cap, Math.PI, 0); g.fill();
      g.strokeStyle = 'rgba(40,20,5,0.5)';
      g.lineWidth = 1;
      for (let y = capY + 10; y < GROUND; y += 23) { g.beginPath(); g.moveTo(NET_X - h + 2, y); g.lineTo(NET_X + h - 3, y + 6); g.stroke(); }
      g.fillStyle = '#777';
      g.fillRect(NET_X - h - 1, capY + 40, h * 2 + 2, 5);
      g.fillRect(NET_X - h - 1, GROUND - 40, h * 2 + 2, 5);
      break;
    }
    case 'kyiv':
    case 'metro': {
      g.fillStyle = '#6d6d6d';
      g.fillRect(NET_X - net.half, capY, net.half * 2, GROUND - capY);
      g.fillStyle = '#4a4a4a';
      g.fillRect(NET_X - 10, GROUND - 6, 20, 6);
      g.beginPath();
      g.arc(NET_X, capY, net.cap, 0, Math.PI * 2);
      if (id === 'kyiv') {
        // "Зупинку заборонено" — як на фото Хрещатика
        g.fillStyle = '#1f5fbf';
        g.fill();
        g.strokeStyle = '#d6262b';
        g.lineWidth = 4;
        g.stroke();
        g.lineWidth = 3.5;
        const k = net.cap * 0.62;
        g.beginPath();
        g.moveTo(NET_X - k, capY - k); g.lineTo(NET_X + k, capY + k);
        g.moveTo(NET_X + k, capY - k); g.lineTo(NET_X - k, capY + k);
        g.stroke();
        g.strokeStyle = '#fff';
        g.lineWidth = 1;
        g.beginPath(); g.arc(NET_X, capY, net.cap + 2, 0, Math.PI * 2); g.stroke();
      } else {
        g.fillStyle = '#fff';
        g.fill();
        g.strokeStyle = '#d6262b';
        g.lineWidth = 3;
        g.stroke();
        txt(g, 'М', NET_X, capY + 1, net.cap * 1.25, '#d6262b', 900);
      }
      break;
    }
    case 'yard': {
      // стовпчик зі старих шин, пофарбованих у двір'ї
      const h = net.half;
      const n = 5;
      const th = (GROUND - capY) / n;
      for (let i = 0; i < n; i++) {
        const y = GROUND - (i + 1) * th;
        g.fillStyle = i % 2 ? '#f2f2f2' : '#d94b4b';
        g.beginPath();
        g.roundRect(NET_X - h, y, h * 2, th - 1, 7);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(NET_X - h + 2, y + th / 2 - 2, h * 2 - 4, 3);
      }
      g.fillStyle = '#d94b4b';
      g.beginPath(); g.arc(NET_X, capY, net.cap, Math.PI, 0); g.fill();
      g.fillStyle = '#2a2a2a';
      g.beginPath(); g.ellipse(NET_X, capY, net.cap * 0.5, 4, 0, 0, Math.PI * 2); g.fill();
      break;
    }
  }
}

// ============ API ============

const statics: Record<string, (g: G) => void> = {
  beach: beachStatic, court: courtStatic, lysychansk: lysStatic, kyiv: kyivStatic, metro: metroStatic, yard: yardStatic,
};

/** Локації з готовими картинками-фонами (public/bg/<id>.webp). */
const PHOTO_BG = new Set(['beach', 'kyiv', 'metro']);
const photos = new Map<string, HTMLImageElement>();
function photo(id: string): HTMLImageElement | null {
  if (!PHOTO_BG.has(id)) return null;
  let im = photos.get(id);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = `bg/${id}.webp`;
    photos.set(id, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

export class SceneRenderer {
  private cache = new Map<string, HTMLCanvasElement>();
  private px = 0;
  private fanLayer: HTMLCanvasElement | null = null;
  cheer = 0;

  /** Фон (статичний + анімація). px — кількість пікселів на логічну одиницю. */
  drawBack(g: G, id: string, px: number, t: number, score: [number, number] = [0, 0]) {
    if (px !== this.px) { this.cache.clear(); this.px = px; this.fanLayer = null; }
    let c = this.cache.get(id);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.ceil(W * px);
      c.height = Math.ceil(H * px);
      const cg = c.getContext('2d')!;
      cg.scale(px, px);
      (statics[id] ?? beachStatic)(cg);
      this.cache.set(id, c);
    }
    const ph = photo(id);
    if (ph) {
      // готова картинка замість намальованого фону
      g.drawImage(ph, 0, 0, W, H);
      return;
    }
    g.drawImage(c, 0, 0, W, H);
    if (id === 'kyiv') kyivAnim(g, t, score);
    if (id === 'metro') metroAnim(g, t);
    if (id === 'yard') yardAnim(g, t);
    if (id === 'court') this.drawFans(g, t);
  }

  /** Глядачі — окремим шаром, розмиті й у серпанку, щоб здавалися далекими. */
  private drawFans(g: G, t: number) {
    const lh = 260;
    if (!this.fanLayer) {
      this.fanLayer = document.createElement('canvas');
      this.fanLayer.width = Math.ceil(W * this.px);
      this.fanLayer.height = Math.ceil(lh * this.px);
    }
    const fl = this.fanLayer;
    const fg = fl.getContext('2d')!;
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.clearRect(0, 0, fl.width, fl.height);
    fg.setTransform(this.px, 0, 0, this.px, 0, -FAN_TOP * this.px);
    for (const f of fans) drawFan(fg, f, t, this.cheer);
    this.cheer = Math.max(0, this.cheer - 0.006);
    g.save();
    g.filter = 'blur(1.4px) saturate(0.7)';
    g.globalAlpha = 0.85;
    g.drawImage(fl, 0, FAN_TOP, W, lh);
    g.restore();
    g.fillStyle = 'rgba(236,240,247,0.42)';
    g.fillRect(0, FAN_TOP + 10, W, 232);
  }

  drawNet(g: G, id: string, net: NetShape) {
    drawNetFor(g, id, net);
  }
}
