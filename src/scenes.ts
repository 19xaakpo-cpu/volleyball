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

interface Fan { x: number; y: number; kind: number; phase: number; s: number }
const fans: Fan[] = (() => {
  const r = rng(77);
  const out: Fan[] = [];
  const rows = [300, 352, 404];
  rows.forEach((ry, ri) => {
    for (let x = 30 + ri * 14; x < W - 20; x += 46 + r() * 10) {
      if (r() < 0.12) continue;
      out.push({ x, y: ry, kind: Math.floor(r() * 3), phase: r() * 6.28, s: 0.85 + ri * 0.08 + r() * 0.1 });
    }
  });
  return out;
})();

function courtStatic(g: G) {
  const wall = g.createLinearGradient(0, 0, 0, GROUND);
  wall.addColorStop(0, '#101626');
  wall.addColorStop(1, '#25304f');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, GROUND);
  // прожектори
  for (let i = 0; i < 6; i++) {
    const x = 80 + i * 160;
    const l = g.createRadialGradient(x, 30, 2, x, 30, 120);
    l.addColorStop(0, 'rgba(255,255,230,0.9)');
    l.addColorStop(0.15, 'rgba(255,255,210,0.25)');
    l.addColorStop(1, 'rgba(255,255,200,0)');
    g.fillStyle = l;
    g.fillRect(x - 120, 0, 240, 160);
    g.fillStyle = '#fffbe0';
    g.fillRect(x - 14, 24, 28, 10);
  }
  // банер і табло
  g.fillStyle = '#c8102e';
  g.fillRect(140, 150, 680, 46);
  txt(g, 'МІШКОБОЛ · ВИЩА ЛІГА · ОВОЧЕБАЗА №1', W / 2, 174, 24, '#fff');
  g.fillStyle = '#0b0f1c';
  g.fillRect(W / 2 - 70, 210, 140, 56);
  g.strokeStyle = '#3d4a75';
  g.lineWidth = 3;
  g.strokeRect(W / 2 - 70, 210, 140, 56);
  // трибуни
  [300, 352, 404, 456].forEach((y, i) => {
    g.fillStyle = shade('#3a4670', -i * 0.08);
    g.fillRect(0, y + 10, W, 52);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(0, y + 10, W, 3);
  });
  // паркет
  const fl = g.createLinearGradient(0, GROUND, 0, H);
  fl.addColorStop(0, '#d98c4a');
  fl.addColorStop(1, '#a8622c');
  g.fillStyle = fl;
  g.fillRect(0, GROUND, W, H - GROUND);
  g.strokeStyle = 'rgba(90,40,10,0.35)';
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
  const bob = Math.sin(t * 2.2 + f.phase) * 1.5;
  const jump = cheer > 0 ? Math.abs(Math.sin(t * 9 + f.phase)) * 10 * cheer : 0;
  const x = f.x, y = f.y + 30 - bob - jump;
  const w = 17 * f.s, h = 26 * f.s;
  g.save();
  // мішок
  if (f.kind === 1) {
    // цибуля в червоній сітці
    g.fillStyle = '#e0a63a';
    for (const [ox, oy] of [[-6, -h + 6], [5, -h + 4], [0, -h - 2]]) {
      g.beginPath();
      g.ellipse(x + ox * f.s, y + oy, 7 * f.s, 8 * f.s, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c7362b';
    g.beginPath();
    g.ellipse(x, y - h * 0.45, w, h * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,200,180,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = -3; i <= 3; i++) {
      g.moveTo(x + i * 5 - 8, y - h);
      g.lineTo(x + i * 5 + 8, y);
    }
    g.stroke();
  } else {
    // мішковина: картопля або буряк зверху
    if (f.kind === 0) {
      g.fillStyle = '#a5773f';
      for (const [ox, oy] of [[-6, -h + 5], [6, -h + 6], [0, -h]]) {
        g.beginPath(); g.ellipse(x + ox * f.s, y + oy, 7 * f.s, 6 * f.s, 0.4, 0, Math.PI * 2); g.fill();
      }
    } else {
      g.fillStyle = '#4caf50';
      for (const a of [-0.5, 0, 0.5]) {
        g.beginPath();
        g.ellipse(x + a * 14, y - h - 8, 4, 10, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#7b1e45';
      for (const [ox, oy] of [[-6, -h + 5], [6, -h + 5]]) {
        g.beginPath(); g.arc(x + ox * f.s, y + oy, 7 * f.s, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#c9a26a';
    g.beginPath();
    g.ellipse(x, y - h * 0.45, w, h * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a6a3c';
    g.lineWidth = 1.5;
    g.stroke();
  }
  // очі
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x - 4, y - h * 0.55, 3, 0, Math.PI * 2); g.arc(x + 4, y - h * 0.55, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#222';
  g.beginPath(); g.arc(x - 4, y - h * 0.5, 1.5, 0, Math.PI * 2); g.arc(x + 4, y - h * 0.5, 1.5, 0, Math.PI * 2); g.fill();
  if (cheer > 0.3) {
    g.strokeStyle = '#3b1d10';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y - h * 0.32, 3, 0, Math.PI); g.stroke();
  }
  g.restore();
}

// ============ ЛИСИЧАНСЬК ============

function lysStatic(g: G) {
  const sky = g.createLinearGradient(0, 0, 0, 340);
  sky.addColorStop(0, '#6f9fd6');
  sky.addColorStop(1, '#e9e4cf');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  // хмари
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [cx, cy, s] of [[180, 80, 1], [560, 60, 1.3], [820, 110, 0.8]]) {
    for (const [ox, oy, r] of [[0, 0, 26], [28, -10, 30], [58, 0, 24], [30, 8, 26]]) {
      g.beginPath(); g.arc(cx + ox * s, cy + oy * s, r * s, 0, Math.PI * 2); g.fill();
    }
  }
  // протилежний (лівий) берег Сіверського Дінця: ліс
  g.fillStyle = '#5d7d4a';
  g.beginPath();
  g.moveTo(0, 350);
  for (let x = 0; x <= W; x += 12) g.lineTo(x, 330 - Math.abs(Math.sin(x * 0.07)) * 14 - Math.sin(x * 0.013) * 8);
  g.lineTo(W, 360);
  g.lineTo(0, 360);
  g.fill();
  // ріка
  const river = g.createLinearGradient(0, 355, 0, 395);
  river.addColorStop(0, '#7fa9c9');
  river.addColorStop(1, '#5b87ab');
  g.fillStyle = river;
  g.fillRect(0, 355, W, 40);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = 0; i < 30; i++) {
    const r = rng(i + 11);
    g.fillRect(r() * W, 360 + r() * 30, 16 + r() * 30, 1.5);
  }
  txt(g, 'Сіверський Донець', 300, 378, 12, 'rgba(255,255,255,0.75)', 600);
  // крейдяні схили правого берега
  g.fillStyle = '#e8e2d0';
  g.beginPath();
  g.moveTo(0, 395);
  g.lineTo(0, 380);
  g.lineTo(120, 372); g.lineTo(220, 392); g.lineTo(400, 384); g.lineTo(560, 396); g.lineTo(760, 378); g.lineTo(W, 386);
  g.lineTo(W, 400);
  g.fill();
  // трава схилу
  const grass = g.createLinearGradient(0, 395, 0, GROUND);
  grass.addColorStop(0, '#8aa45a');
  grass.addColorStop(1, '#6f8a42');
  g.fillStyle = grass;
  g.fillRect(0, 395, W, GROUND - 395);
  // далекі труби заводу
  for (const [x, h] of [[640, 120], [670, 150], [700, 110]]) {
    g.fillStyle = '#8a8580';
    g.fillRect(x, 340 - h, 12, h);
    g.fillStyle = '#c0392b';
    g.fillRect(x, 340 - h + 8, 12, 6);
    g.fillRect(x, 340 - h + 24, 12, 6);
  }
  // шахтний копер — Лисичанськ вважають колискою вугільної промисловості Донбасу
  const kx = 120, kb = GROUND - 30;
  g.strokeStyle = '#4a4440';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(kx - 40, kb); g.lineTo(kx - 8, kb - 220);
  g.moveTo(kx + 40, kb); g.lineTo(kx + 8, kb - 220);
  g.moveTo(kx + 40, kb); g.lineTo(kx + 95, kb - 170);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 7; i++) {
    const y1 = kb - i * 30, y2 = kb - (i + 1) * 30;
    const w1 = 40 - i * 4.6, w2 = 40 - (i + 1) * 4.6;
    g.moveTo(kx - w1, y1); g.lineTo(kx + w2, y2);
    g.moveTo(kx + w1, y1); g.lineTo(kx - w2, y2);
    g.moveTo(kx - w2, y2); g.lineTo(kx + w2, y2);
  }
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(kx, kb - 225, 22, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    g.beginPath(); g.moveTo(kx, kb - 225); g.lineTo(kx + Math.cos(a) * 22, kb - 225 + Math.sin(a) * 22); g.stroke();
  }
  g.fillStyle = '#7a3b2e';
  g.fillRect(kx - 55, kb - 40, 110, 42);
  g.fillStyle = '#e8d9a8';
  for (let i = 0; i < 4; i++) g.fillRect(kx - 45 + i * 26, kb - 30, 14, 14);
  // пам'ятник шахтарю-першопрохідцю
  const mx = 840, mb = GROUND - 26;
  g.fillStyle = '#8f8a82';
  g.fillRect(mx - 30, mb - 14, 60, 14);
  g.fillStyle = '#a49e94';
  g.fillRect(mx - 18, mb - 120, 36, 106);
  g.fillStyle = '#3d4a3a';
  // постать: тулуб, голова в касці, рука з лампою вгору
  g.beginPath();
  g.moveTo(mx - 14, mb - 120); g.lineTo(mx - 10, mb - 175); g.lineTo(mx + 10, mb - 175); g.lineTo(mx + 14, mb - 120);
  g.fill();
  g.beginPath(); g.arc(mx, mb - 186, 10, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(mx, mb - 192, 12, 5, 0, Math.PI, 0); g.fill();
  g.lineWidth = 7;
  g.strokeStyle = '#3d4a3a';
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(mx + 8, mb - 168); g.lineTo(mx + 26, mb - 210); g.stroke();
  g.beginPath(); g.moveTo(mx - 8, mb - 168); g.lineTo(mx - 20, mb - 135); g.stroke();
  g.lineCap = 'butt';
  g.fillStyle = '#f2c94c';
  g.beginPath(); g.arc(mx + 28, mb - 218, 6, 0, Math.PI * 2); g.fill();
  // стела на в'їзді
  g.fillStyle = '#6b6b6b';
  g.fillRect(560, GROUND - 60, 5, 40);
  g.fillRect(655, GROUND - 60, 5, 40);
  g.fillStyle = '#ffffff';
  g.fillRect(550, GROUND - 92, 120, 36);
  g.strokeStyle = '#1f4fa0';
  g.lineWidth = 3;
  g.strokeRect(552, GROUND - 90, 116, 32);
  txt(g, 'ЛИСИЧАНСЬК', 610, GROUND - 74, 15, '#1f4fa0', 900);
  // земля
  sand(g, '#a68a5b', '#7d6440');
}

// ============ КИЇВ, БАНКОВА ============

function kyivStatic(g: G) {
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#5b9be0');
  sky.addColorStop(1, '#cfe3f5');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  // Офіс Президента (Банкова, 11): сіра монументальна будівля
  const bx = 150, bw = 660, top = 150;
  g.fillStyle = '#9a9a96';
  g.fillRect(bx, top + 30, bw, GROUND - top - 30);
  g.fillStyle = '#a9a9a4';
  g.fillRect(bx + bw / 2 - 120, top, 240, GROUND - top);
  g.fillStyle = '#7f7f7a';
  g.fillRect(bx - 6, top + 24, bw + 12, 8);
  g.fillRect(bx + bw / 2 - 126, top - 6, 252, 8);
  // вікна
  g.fillStyle = '#4c5866';
  for (let fl = 0; fl < 7; fl++) {
    const y = top + 50 + fl * 38;
    if (y > GROUND - 70) break;
    for (let i = 0; i < 18; i++) {
      const x = bx + 18 + i * 36;
      if (x > bx + bw / 2 - 125 && x < bx + bw / 2 + 110) continue;
      g.fillRect(x, y, 16, 24);
    }
    for (let i = 0; i < 5; i++) g.fillRect(bx + bw / 2 - 100 + i * 44, y - 20, 18, 28);
  }
  // колони порталу
  g.fillStyle = '#c4c4bf';
  for (let i = 0; i < 6; i++) g.fillRect(bx + bw / 2 - 95 + i * 36, GROUND - 120, 14, 120);
  g.fillStyle = '#8e8e89';
  g.fillRect(bx + bw / 2 - 110, GROUND - 128, 220, 10);
  // флагшток
  g.fillStyle = '#555';
  g.fillRect(W / 2 - 2, top - 70, 4, 66);
  // "Будинок з химерами" — край справа
  g.fillStyle = '#5e5f66';
  g.fillRect(850, 210, 110, GROUND - 210);
  g.fillStyle = '#3c3d44';
  for (let fl = 0; fl < 6; fl++) for (let i = 0; i < 3; i++) g.fillRect(865 + i * 32, 235 + fl * 40, 14, 24);
  // химери на даху (жаби, слон)
  g.fillStyle = '#4a4b52';
  g.beginPath(); g.ellipse(880, 206, 12, 8, 0, Math.PI, 0); g.fill();
  g.beginPath(); g.arc(872, 199, 3, 0, Math.PI * 2); g.arc(888, 199, 3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(930, 202, 16, 12, 0, Math.PI, 0); g.fill();
  g.fillRect(942, 196, 6, 16);
  // табличка вулиці
  g.fillStyle = '#1b4f9c';
  g.fillRect(bx + 20, GROUND - 175, 110, 30);
  txt(g, 'вул. Банкова', bx + 75, GROUND - 160, 14, '#fff', 700);
  // каштани
  const chestnut = (x: number, s: number) => {
    g.fillStyle = '#5a3d2b';
    g.fillRect(x - 6, GROUND - 120 * s, 12, 120 * s);
    g.fillStyle = '#3f7d3a';
    for (const [ox, oy, r] of [[0, -150, 50], [-40, -120, 42], [40, -118, 44], [0, -100, 46]]) {
      g.beginPath(); g.arc(x + ox * s, GROUND + oy * s, r * s, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f5f0e0';
    for (let i = 0; i < 9; i++) {
      const r = rng(x + i);
      g.beginPath();
      g.ellipse(x + (r() - 0.5) * 110 * s, GROUND - (90 + r() * 90) * s, 3, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  chestnut(70, 1.1);
  chestnut(890, 0.95);
  // бруківка
  sand(g, '#8c8c8c', '#5f5f5f');
  g.strokeStyle = 'rgba(40,40,40,0.35)';
  g.lineWidth = 1;
  for (let y = GROUND + 10; y < H; y += 12) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    for (let x = (y / 12) % 2 ? 0 : 12; x < W; x += 24) { g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x, y); g.stroke(); }
  }
}

function kyivAnim(g: G, t: number) {
  // прапор, що майорить
  const fx = W / 2 + 2, fy = 150 - 70;
  for (let i = 0; i < 2; i++) {
    g.fillStyle = i === 0 ? '#0057b7' : '#ffd500';
    g.beginPath();
    for (let x = 0; x <= 60; x += 4) {
      const w = Math.sin(t * 5 - x * 0.12) * 3 * (x / 60);
      g.lineTo(fx + x, fy + i * 18 + w);
    }
    for (let x = 60; x >= 0; x -= 4) {
      const w = Math.sin(t * 5 - x * 0.12) * 3 * (x / 60);
      g.lineTo(fx + x, fy + (i + 1) * 18 + w);
    }
    g.closePath();
    g.fill();
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
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#8e9aa8');
  sky.addColorStop(1, '#c9cdd1');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  // п'ятиповерхівка
  const bx = 100, bw = 760, top = 120;
  g.fillStyle = '#c9b8a0';
  g.fillRect(bx, top, bw, GROUND - top);
  g.fillStyle = '#9e8e78';
  g.fillRect(bx - 6, top - 10, bw + 12, 12);
  const r = rng(5);
  for (let fl = 0; fl < 5; fl++) {
    const y = top + 20 + fl * 68;
    for (let i = 0; i < 12; i++) {
      const x = bx + 22 + i * 62;
      const lit = r() < 0.3;
      g.fillStyle = lit ? '#f3dc8a' : '#56606b';
      g.fillRect(x, y, 34, 40);
      g.fillStyle = '#efe9df';
      g.fillRect(x + 16, y, 2, 40);
      g.fillRect(x, y + 14, 34, 2);
      // балкони — різні, як у житті
      if (fl > 0 && r() < 0.45) {
        const kind = r();
        g.fillStyle = kind < 0.4 ? '#d5d0c4' : kind < 0.7 ? '#8fa3b5' : '#b07a52';
        g.fillRect(x - 6, y + 28, 46, 22);
        g.fillStyle = 'rgba(0,0,0,0.15)';
        g.fillRect(x - 6, y + 48, 46, 3);
        if (kind > 0.85) {
          // білизна
          g.strokeStyle = '#555';
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(x - 4, y + 22); g.lineTo(x + 38, y + 22); g.stroke();
          for (let k = 0; k < 3; k++) {
            g.fillStyle = ['#e85a9b', '#58b7ff', '#fff'][k];
            g.fillRect(x + k * 13, y + 22, 9, 12);
          }
        }
      }
      if (fl === 1 && i === 9) {
        // супутникова тарілка
        g.fillStyle = '#ddd';
        g.beginPath(); g.ellipse(x + 40, y + 6, 10, 14, -0.5, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // під'їзди
  for (const x of [250, 650]) {
    g.fillStyle = '#6b4a35';
    g.fillRect(x, GROUND - 70, 40, 70);
    g.fillStyle = '#8a8a8a';
    g.fillRect(x - 14, GROUND - 82, 68, 10);
  }
  // тополі
  for (const [x, h] of [[40, 300], [925, 260]]) {
    g.fillStyle = '#5a4a3a';
    g.fillRect(x - 5, GROUND - h * 0.4, 10, h * 0.4);
    g.fillStyle = '#5f7f4a';
    g.beginPath(); g.ellipse(x, GROUND - h * 0.62, 36, h * 0.42, 0, 0, Math.PI * 2); g.fill();
  }
  // асфальт
  sand(g, '#6f6f70', '#4f4f50');
  g.strokeStyle = 'rgba(30,30,30,0.6)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(300, GROUND + 4); g.lineTo(320, GROUND + 20); g.lineTo(310, GROUND + 40);
  g.moveTo(700, GROUND + 6); g.lineTo(680, GROUND + 26); g.lineTo(700, GROUND + 50);
  g.stroke();
  g.fillStyle = 'rgba(120,140,170,0.55)';
  g.beginPath(); g.ellipse(560, GROUND + 26, 60, 9, 0, 0, Math.PI * 2); g.fill();
  // сміттєві баки, переповнені
  for (let i = 0; i < 3; i++) {
    const x = 40 + i * 64;
    g.fillStyle = '#3f6b3f';
    g.beginPath();
    g.moveTo(x, GROUND - 4); g.lineTo(x - 4, GROUND - 62); g.lineTo(x + 56, GROUND - 62); g.lineTo(x + 52, GROUND - 4);
    g.fill();
    g.fillStyle = '#2f522f';
    g.fillRect(x - 6, GROUND - 66, 64, 6);
    // купа сміття над баком
    const rr = rng(i + 40);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = ['#222', '#3a3a5a', '#d8d0b0', '#5a3a2a', '#1f6fb8', '#ccc'][k % 6];
      g.beginPath();
      g.ellipse(x + 6 + rr() * 44, GROUND - 70 - rr() * 22, 10 + rr() * 6, 8 + rr() * 5, rr(), 0, Math.PI * 2);
      g.fill();
    }
  }
  // пакети й коробки на землі
  g.fillStyle = '#b08b5a';
  g.fillRect(232, GROUND - 26, 30, 24);
  g.fillStyle = '#222';
  g.beginPath(); g.ellipse(214, GROUND - 10, 14, 10, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(25, GROUND - 9, 12, 9, 0, 0, Math.PI * 2); g.fill();
}

function yardAnim(g: G, t: number) {
  // мухи над смітником
  g.fillStyle = '#111';
  for (let i = 0; i < 9; i++) {
    const x = 120 + Math.sin(t * (2 + i * 0.3) + i) * 70 + Math.sin(t * 7 + i * 2) * 8;
    const y = GROUND - 110 + Math.cos(t * (1.6 + i * 0.2) + i * 3) * 25;
    g.fillRect(x, y, 2.5, 2.5);
  }
  // кіт на баку
  const cx = 168, cy = GROUND - 92;
  g.fillStyle = '#e08a3a';
  g.beginPath(); g.ellipse(cx, cy, 16, 10, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 14, cy - 10, 8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(cx + 9, cy - 15); g.lineTo(cx + 11, cy - 24); g.lineTo(cx + 15, cy - 16); g.fill();
  g.beginPath(); g.moveTo(cx + 15, cy - 16); g.lineTo(cx + 19, cy - 24); g.lineTo(cx + 21, cy - 14); g.fill();
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
    case 'court':
      netMesh(g, net.half, '#ffffff', 'rgba(20,20,30,0.7)', '#1d3f8f');
      g.fillStyle = '#1d3f8f';
      g.fillRect(NET_X - 7, GROUND - 60, 14, 60);
      break;
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
        // "В'їзд заборонено"
        g.fillStyle = '#d6262b';
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#fff';
        g.fillRect(NET_X - net.cap * 0.65, capY - 3, net.cap * 1.3, 6);
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

export class SceneRenderer {
  private cache = new Map<string, HTMLCanvasElement>();
  private px = 0;
  cheer = 0;

  /** Фон (статичний + анімація). px — кількість пікселів на логічну одиницю. */
  drawBack(g: G, id: string, px: number, t: number) {
    if (px !== this.px) { this.cache.clear(); this.px = px; }
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
    g.drawImage(c, 0, 0, W, H);
    if (id === 'kyiv') kyivAnim(g, t);
    if (id === 'metro') metroAnim(g, t);
    if (id === 'yard') yardAnim(g, t);
    if (id === 'court') {
      for (const f of fans) drawFan(g, f, t, this.cheer);
      this.cheer = Math.max(0, this.cheer - 0.006);
    }
  }

  drawNet(g: G, id: string, net: NetShape) {
    drawNetFor(g, id, net);
  }
}
