// All drawing: the city from above, cars, people, weather of light, and the
// HUD — wanted stars, cash, health, mission text, dialogue and the minimap.
import { TILE, VIEW_W, VIEW_H, WORLD_W, WORLD_H, CITY_NAME, HERO_NAME } from './config.js';
import { TILES_X, TILES_Y, WATER_TY, isRoadTile } from './world.js';

export function drawWorld(ctx, G) {
  const cam = G.camera;
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(TILES_X - 1, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(TILES_Y - 1, Math.ceil((cam.y + VIEW_H) / TILE) + 1);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const px = tx * TILE, py = ty * TILE;
      if (ty >= WATER_TY) {
        ctx.fillStyle = (tx + ty) % 2 ? '#1565c0' : '#1668b8';
        ctx.fillRect(px, py, TILE, TILE);
      } else if (ty === WATER_TY - 1) {
        ctx.fillStyle = '#e8cf8f'; // promenade sand
        ctx.fillRect(px, py, TILE, TILE);
      } else if (isRoadTile(tx, ty)) {
        ctx.fillStyle = '#33363d';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#f7d154';
        // dashed centre lines
        if (tx % 5 === 0 && ty % 5 !== 0) ctx.fillRect(px + TILE / 2 - 2, py + 8, 4, 20), ctx.fillRect(px + TILE / 2 - 2, py + 38, 4, 20);
        if (ty % 5 === 0 && tx % 5 !== 0) ctx.fillRect(px + 8, py + TILE / 2 - 2, 20, 4), ctx.fillRect(px + 38, py + TILE / 2 - 2, 20, 4);
      } else {
        ctx.fillStyle = (tx + ty) % 2 ? '#7fae5a' : '#84b45e'; // grass / sidewalk base
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }

  // parking lot asphalt
  ctx.fillStyle = '#4a4d54';
  for (const s of G.world.lotSpots) { /* spots are drawn as bays below with the cars */ }
  for (const b of G.world.buildings) {
    // shadow + body + roof, a cheap 2.5D lift by floor count
    const lift = Math.min(14, b.floors * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5 - lift * 0.2, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if ((i * 7 + j * 13 + b.floors) % 3) ctx.fillRect(b.x + 12 + i * 26, b.y + 12 + j * 26, 9, 6);
    }
    if (b.name) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(b.name).width + 14;
      ctx.fillRect(b.x + b.w / 2 - w / 2, b.y + b.h - 24, w, 19);
      ctx.fillStyle = '#fff';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h - 10);
    }
  }

  for (const t of G.world.trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(t.x + 3, t.y + 5, t.r, t.r * 0.7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#43a047';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.62, 0, 7); ctx.fill();
  }
  for (const l of G.world.lamps) {
    ctx.fillStyle = '#263238';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    if (G.dusk > 0.35) {
      ctx.fillStyle = 'rgba(255,213,79,0.20)';
      ctx.beginPath(); ctx.arc(l.x, l.y, 20, 0, 7); ctx.fill();
    }
  }

  // mission marker: a pillar of light
  if (G.marker) {
    const m = G.marker;
    const pulse = 0.75 + Math.sin(G.t * 5) * 0.25;
    ctx.fillStyle = `rgba(255,213,79,${0.30 * pulse})`;
    ctx.fillRect(m.x - 16, m.y - 190, 32, 190);
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.arc(m.x, m.y, 13 + Math.sin(G.t * 5) * 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#5d4037';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', m.x, m.y + 5);
  }

  for (const fx of G.effects) drawEffect(ctx, fx);
  for (const c of G.cars) drawCar(ctx, c, G);
  for (const p of G.peds) drawPed(ctx, p, G);
  if (G.player.car === null) drawPlayer(ctx, G);
  for (const b of G.bullets) {
    ctx.strokeStyle = '#ffe082';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();

  // dusk tint
  if (G.dusk > 0.02) {
    ctx.fillStyle = `rgba(16,20,58,${(G.dusk * 0.34).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawEffect(ctx, fx) {
  const a = Math.max(0, fx.life / fx.max);
  if (fx.kind === 'muzzle') {
    ctx.fillStyle = `rgba(255,180,0,${a})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 7 * a + 2, 0, 7); ctx.fill();
  } else if (fx.kind === 'hit') {
    ctx.fillStyle = `rgba(183,28,28,${a * 0.8})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 5 * a + 1, 0, 7); ctx.fill();
  } else if (fx.kind === 'smoke') {
    ctx.fillStyle = `rgba(120,120,120,${a * 0.4})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, (1 - a) * 12 + 4, 0, 7); ctx.fill();
  } else if (fx.kind === 'cash') {
    ctx.fillStyle = `rgba(46,204,113,${a})`;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fx.text, fx.x, fx.y - (1 - a) * 26);
  }
}

export function drawCar(ctx, c, G) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.ang);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-19, -9 + 4, 42, 20);
  ctx.fillStyle = c.kind === 'police' ? '#eceff1' : c.color;
  roundRect(ctx, -21, -10, 42, 20, 5); ctx.fill();
  if (c.kind === 'police') {
    ctx.fillStyle = '#0d47a1';
    ctx.fillRect(-21, -10, 42, 6); ctx.fillRect(-21, 4, 42, 6);
    const blink = Math.sin(G.t * 10 + c.id) > 0;
    ctx.fillStyle = blink ? '#ff1744' : '#2979ff';
    ctx.fillRect(-4, -4, 8, 3);
    ctx.fillStyle = blink ? '#2979ff' : '#ff1744';
    ctx.fillRect(-4, 1, 8, 3);
  }
  ctx.fillStyle = '#263238';
  roundRect(ctx, -6, -8, 15, 16, 3); ctx.fill(); // cabin
  ctx.fillStyle = 'rgba(179,229,252,0.85)';
  ctx.fillRect(6, -7, 4, 14); // windshield
  ctx.fillStyle = '#111';
  ctx.fillRect(-19, -12, 9, 4); ctx.fillRect(10, -12, 9, 4);
  ctx.fillRect(-19, 8, 9, 4); ctx.fillRect(10, 8, 9, 4);
  if (c.hp < 40) { ctx.fillStyle = 'rgba(60,60,60,0.5)'; ctx.beginPath(); ctx.arc(14, 0, 7, 0, 7); ctx.fill(); }
  ctx.restore();
  if (c === G.markedCar) {
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼', c.x, c.y - 24 + Math.sin(G.t * 5) * 3);
  }
}

function body(ctx, p, shirt, skin) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, 8, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(p.x, p.y, 7.5, 0, 7); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(p.x + Math.cos(p.ang) * 2.5, p.y + Math.sin(p.ang) * 2.5, 4.2, 0, 7); ctx.fill();
}

export function drawPed(ctx, p, G) {
  if (p.state === 'down') {
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    ctx.fillStyle = p.color;
    ctx.fillRect(-9, -4, 18, 8);
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(11, 0, 4, 0, 7); ctx.fill();
    ctx.restore();
    return;
  }
  body(ctx, p, p.color, '#f1c27d');
  if (p.cop) {
    ctx.fillStyle = '#0d47a1';
    ctx.beginPath(); ctx.arc(p.x, p.y, 8.5, Math.PI, 7); ctx.fill();
  }
}

export function drawPlayer(ctx, G) {
  const p = G.player;
  body(ctx, p, '#c0392b', '#e8b98a');
  // aim line of the pistol
  if (p.weapon === 'pistol') {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.ang) * 44, p.y + Math.sin(p.ang) * 44);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#212121';
    ctx.fillRect(p.x + Math.cos(p.ang) * 10 - 2, p.y + Math.sin(p.ang) * 10 - 2, 5, 5);
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function stars(ctx, x, y, n) {
  ctx.font = '26px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < n ? '#ffd54f' : 'rgba(255,255,255,0.18)';
    ctx.fillText('★', x - i * 28, y);
  }
}

export function drawHUD(ctx, G) {
  const P = G.player;
  // top-left: money + health
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 14, 12, 218, 64, 8); ctx.fill();
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('$' + P.cash.toLocaleString('en-US'), 26, 42);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, 26, 52, 150, 10, 5); ctx.fill();
  ctx.fillStyle = P.hp > 30 ? '#e74c3c' : '#ff1744';
  roundRect(ctx, 26, 52, Math.max(0, 150 * P.hp / 100), 10, 5); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(P.car ? P.car.model.name : (P.weapon === 'pistol' ? 'Pistol' : 'Fists'), 184, 62);

  stars(ctx, VIEW_W - 18, 40, Math.ceil(G.wanted));
  if (G.bust > 0.02) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, VIEW_W - 190, 52, 172, 16, 8); ctx.fill();
    ctx.fillStyle = '#ff5252';
    roundRect(ctx, VIEW_W - 190, 52, 172 * G.bust, 16, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', VIEW_W - 104, 64);
  }

  drawMinimap(ctx, G);

  // objective
  if (G.objective) {
    ctx.font = '16px system-ui, sans-serif';
    const w = ctx.measureText(G.objective).width + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, VIEW_W / 2 - w / 2, 14, w, 30, 8); ctx.fill();
    ctx.fillStyle = '#ffe082';
    ctx.textAlign = 'center';
    ctx.fillText(G.objective, VIEW_W / 2, 35);
  }

  // context prompt
  if (G.prompt) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const w = ctx.measureText(G.prompt).width + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, VIEW_W / 2 - w / 2, VIEW_H - 128, w, 32, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(G.prompt, VIEW_W / 2, VIEW_H - 106);
  }

  // dialogue
  if (G.dialogue) {
    const d = G.dialogue;
    ctx.fillStyle = 'rgba(5,8,20,0.82)';
    roundRect(ctx, 190, VIEW_H - 96, VIEW_W - 380, 82, 10); ctx.fill();
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 1.5;
    roundRect(ctx, 190, VIEW_H - 96, VIEW_W - 380, 82, 10); ctx.stroke();
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.speaker, 212, VIEW_H - 70);
    ctx.fillStyle = '#fff';
    ctx.font = '16px system-ui, sans-serif';
    wrapText(ctx, d.text, 212, VIEW_H - 46, VIEW_W - 424, 20);
  }

  if (G.toast) {
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,224,130,${Math.min(1, G.toast.t)})`;
    ctx.fillText(G.toast.text, VIEW_W / 2, 92);
  }
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawMinimap(ctx, G) {
  const S = 176, X = 14, Y = VIEW_H - S - 14;
  const kx = S / WORLD_W, ky = S / WORLD_H;
  ctx.fillStyle = 'rgba(6,10,24,0.78)';
  roundRect(ctx, X - 4, Y - 4, S + 8, S + 8, 8); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y, S, S); ctx.clip();
  ctx.fillStyle = '#2c4a2e';
  ctx.fillRect(X, Y, S, S);
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(X, Y + WATER_TY * TILE * ky, S, S);
  ctx.strokeStyle = '#565b66';
  ctx.lineWidth = 2;
  for (let tx = 0; tx < TILES_X; tx += 5) { ctx.beginPath(); ctx.moveTo(X + tx * TILE * kx, Y); ctx.lineTo(X + tx * TILE * kx, Y + S); ctx.stroke(); }
  for (let ty = 0; ty < WATER_TY; ty += 5) { ctx.beginPath(); ctx.moveTo(X, Y + ty * TILE * ky); ctx.lineTo(X + S, Y + ty * TILE * ky); ctx.stroke(); }
  if (G.marker) {
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.arc(X + G.marker.x * kx, Y + G.marker.y * ky, 4 + Math.sin(G.t * 5) * 1.2, 0, 7); ctx.fill();
  }
  for (const c of G.cars) {
    if (c.kind !== 'police') continue;
    ctx.fillStyle = Math.sin(G.t * 8 + c.id) > 0 ? '#ff5252' : '#42a5f5';
    ctx.fillRect(X + c.x * kx - 2, Y + c.y * ky - 2, 4, 4);
  }
  const P = G.player;
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.translate(X + P.x * kx, Y + P.y * ky);
  ctx.rotate(P.ang + Math.PI / 2);
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(CITY_NAME.toUpperCase(), X + 2, Y - 8);
}

export function drawTitle(ctx, G) {
  const grd = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grd.addColorStop(0, '#12082b');
  grd.addColorStop(0.55, '#4a1050');
  grd.addColorStop(1, '#0d2b45');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // sun + skyline silhouette
  ctx.fillStyle = '#ff9e57';
  ctx.beginPath(); ctx.arc(VIEW_W / 2, 300, 92, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a0f2e';
  const rng = G.titleRng;
  for (let x = 0; x < VIEW_W; x += 46) {
    const h = 90 + (rng() * 130);
    ctx.fillRect(x, 392 - h + 110, 44, h + 320);
  }
  ctx.fillStyle = '#0a0618';
  ctx.fillRect(0, 502, VIEW_W, VIEW_H - 502);
  ctx.fillStyle = '#ffd54f';
  ctx.font = 'italic bold 96px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('VICE HARBOR', VIEW_W / 2, 190);
  ctx.fillStyle = '#fff';
  ctx.font = '21px system-ui, sans-serif';
  ctx.fillText(`An open-world crime story in ${CITY_NAME}`, VIEW_W / 2, 232);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`${HERO_NAME} owes money all over town. ${'Marisol Vega'} has work — if he can drive, run and keep his nerve.`, VIEW_W / 2, 540);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = Math.sin(G.t * 3) > -0.3 ? '#ffe082' : 'rgba(255,224,130,0.35)';
  ctx.fillText(G.hasSave ? 'Press ENTER to continue — or N for a new game' : 'Press ENTER to start', VIEW_W / 2, 592);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('WASD / arrows: move & drive · E: enter or leave a car · Mouse: aim · Click / Space: punch or shoot · Shift: sprint · P: pause · M: mute', VIEW_W / 2, 632);
}

export function drawWasted(ctx, G, busted) {
  ctx.fillStyle = 'rgba(10,0,0,0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = busted ? '#64b5f6' : '#e53935';
  ctx.font = 'italic bold 84px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', VIEW_W / 2, VIEW_H / 2 - 10);
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(busted ? 'The Brisa police take you in. The hospital bill and the fine sting.' : 'You wake up outside the clinic, lighter in the pocket.', VIEW_W / 2, VIEW_H / 2 + 34);
  ctx.fillText('Press ENTER to carry on', VIEW_W / 2, VIEW_H / 2 + 66);
}

export function drawComplete(ctx, G) {
  ctx.fillStyle = 'rgba(4,20,10,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ffd54f';
  ctx.font = 'italic bold 58px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('HARBOR KING', VIEW_W / 2, VIEW_H / 2 - 16);
  ctx.fillStyle = '#fff';
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillText(`${HERO_NAME} paid his debts and then some. ${CITY_NAME} is yours to roam — the chop shop still pays for clean cars.`, VIEW_W / 2, VIEW_H / 2 + 26);
  ctx.fillText('Press ENTER to keep roaming', VIEW_W / 2, VIEW_H / 2 + 58);
}
