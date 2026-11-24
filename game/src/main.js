// Vice Harbor — the game itself. Nico Ferrer, broke and owing money across
// Puerto Brisa, runs jobs for fixer Marisol Vega: steal cars, move packages,
// lose the police. Free-roam between story jobs; the Reyes chop shop pays
// cash for any clean car you bring in, and the Brisa police answer every
// crime with a wanted level and a chase.
import { TILE, VIEW_W, VIEW_H, WORLD_W, WORLD_H, CAR_MODELS, PED_NAMES, PED_COLORS, CITY_NAME, HERO_NAME, FIXER_NAME } from './config.js';
import { buildWorld, collide, pointInBuilding, roadLines, WATER_TY } from './world.js';
import { mulberry32, pick, range } from './random.js';
import { Input } from './input.js';
import { drawWorld, drawHUD, drawTitle, drawWasted, drawComplete } from './render.js';
import { setupShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);

// ---------------------------------------------------------------- sound
const SFX = {
  ctx: null, muted: false,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  beep(freq, dur, type = 'square', vol = 0.05, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  shot() { this.beep(160, 0.09, 'sawtooth', 0.08, -110); },
  punch() { this.beep(90, 0.07, 'triangle', 0.09, -40); },
  cash() { this.beep(880, 0.07, 'square', 0.05); setTimeout(() => this.beep(1320, 0.1, 'square', 0.05), 60); },
  siren() { this.beep(660, 0.16, 'triangle', 0.028, 220); },
  crash() { this.beep(70, 0.15, 'sawtooth', 0.09, -30); },
  door() { this.beep(220, 0.06, 'square', 0.04, -60); },
};

// ---------------------------------------------------------------- state
let carId = 0;
const G = {
  state: SHOT ? 'play' : 'title',
  t: 0, dusk: 0, camera: { x: 0, y: 0 },
  world: buildWorld(SEED),
  rng: mulberry32(SEED * 977 + 13),
  cars: [], peds: [], bullets: [], effects: [],
  player: null, wanted: 0, seenTimer: 0, bust: 0,
  marker: null, markedCar: null, objective: '', prompt: null,
  dialogue: null, dialogueT: 0, toast: null,
  mission: -1, stage: 0, missionTimer: 0, packageCarried: false,
  storyDone: false, titleRng: mulberry32(42), hasSave: false,
  fireCd: 0, sirenCd: 0, trafficCd: 0, shotMode: !!SHOT,
};

function saveGame() {
  try {
    localStorage.setItem('viceHarborSaveV1', JSON.stringify({ cash: G.player.cash, mission: G.mission, storyDone: G.storyDone }));
    G.hasSave = true;
  } catch { /* private mode */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem('viceHarborSaveV1') || 'null');
    if (s) { G.hasSave = true; return s; }
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------- entities
function makeCar(x, y, ang, modelIdx, kind) {
  const model = CAR_MODELS[modelIdx];
  return {
    id: carId++, x, y, ang, speed: 0, model, color: model.color,
    kind, hp: 100, axis: null, lane: 0, dir: 1, targetSpeed: 0, dead: false,
  };
}

function spawnParked() {
  for (const s of G.world.lotSpots) {
    if (G.rng() < 0.62) G.cars.push(makeCar(s.x, s.y, s.ang, Math.floor(G.rng() * CAR_MODELS.length), 'parked'));
  }
  // a few cars parked along roadsides
  const { v } = roadLines();
  for (let i = 0; i < 16; i++) {
    const x = pick(G.rng, v) + (G.rng() < 0.5 ? -22 : 22);
    const y = range(G.rng, 80, (WATER_TY - 2) * TILE);
    if (!pointInBuilding(G.world, x, y)) G.cars.push(makeCar(x, y, Math.PI / 2, Math.floor(G.rng() * CAR_MODELS.length), 'parked'));
  }
}

function spawnTrafficCar(anywhere) {
  const lines = roadLines();
  const vertical = G.rng() < 0.5;
  const c = makeCar(0, 0, 0, Math.floor(G.rng() * CAR_MODELS.length), 'traffic');
  c.axis = vertical ? 'v' : 'h';
  c.dir = G.rng() < 0.5 ? 1 : -1;
  c.lane = pick(G.rng, vertical ? lines.v : lines.h);
  c.targetSpeed = range(G.rng, 95, 150);
  if (vertical) {
    c.x = c.lane + (c.dir > 0 ? -14 : 14);
    c.y = anywhere ? range(G.rng, 60, WORLD_H - 500) : (c.dir > 0 ? -40 : WORLD_H - 460);
    c.ang = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    c.y = c.lane + (c.dir > 0 ? 14 : -14);
    c.x = anywhere ? range(G.rng, 60, WORLD_W - 60) : (c.dir > 0 ? -40 : WORLD_W + 40);
    c.ang = c.dir > 0 ? 0 : Math.PI;
  }
  if (Math.hypot(c.x - G.player.x, c.y - G.player.y) < 130) return;
  G.cars.push(c);
}

function spawnPed(x, y, cop = false) {
  const p = {
    x, y, ang: range(G.rng, 0, 6.28), hp: 100, state: 'walk', t: 0,
    tx: x, ty: y, color: cop ? '#1a237e' : pick(G.rng, PED_COLORS),
    name: pick(G.rng, PED_NAMES), cop, dead: false, threatX: 0, threatY: 0, fireCd: 0,
  };
  G.peds.push(p);
  return p;
}

function spawnAmbientPeds() {
  for (let i = 0; i < 30; i++) {
    const x = range(G.rng, 60, WORLD_W - 60), y = range(G.rng, 60, (WATER_TY - 1) * TILE);
    if (!pointInBuilding(G.world, x, y)) spawnPed(x, y);
  }
  // Marisol waits outside her cantina
  const c = G.world.specials.cantina;
  const m = spawnPed(c.door.x + 18, c.door.y + 8);
  m.name = FIXER_NAME; m.color = '#8e24aa'; m.state = 'stand'; m.ang = Math.PI / 2;
}

function newPlayer() {
  const s = G.world.specials.safehouse;
  return {
    x: s.door.x, y: s.door.y + 16, ang: -Math.PI / 2, hp: 100, cash: 120,
    car: null, weapon: 'pistol', walk: 0,
  };
}

function resetWorld(save) {
  G.cars = []; G.peds = []; G.bullets = []; G.effects = [];
  G.wanted = 0; G.bust = 0; G.seenTimer = 0; G.markedCar = null; G.packageCarried = false;
  G.player = newPlayer();
  if (save) {
    G.player.cash = save.cash ?? 120;
    G.mission = save.mission ?? -1;
    G.storyDone = !!save.storyDone;
  } else {
    G.mission = -1; G.storyDone = false;
  }
  G.stage = 0;
  spawnParked();
  for (let i = 0; i < 13; i++) spawnTrafficCar(true);
  spawnAmbientPeds();
  setMissionMarker();
}

// ---------------------------------------------------------------- helpers
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (x, y, r) => Math.hypot(G.player.x - x, G.player.y - y) < r;

function say(speaker, text, dur = 5) {
  G.dialogue = { speaker, text };
  G.dialogueT = dur;
}
function toast(text, dur = 3) { G.toast = { text, t: dur }; }

function crime(amount, x, y) {
  // a crime only counts when someone is around to see it
  const witnessed = G.peds.some((p) => p.state !== 'down' && Math.hypot(p.x - x, p.y - y) < 230)
    || G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - x, c.y - y) < 340);
  if (witnessed || amount >= 2) {
    G.wanted = Math.min(5, G.wanted + amount);
    G.seenTimer = 0;
  }
}

function addCash(n, x, y) {
  G.player.cash += n;
  G.effects.push({ kind: 'cash', x: x ?? G.player.x, y: (y ?? G.player.y) - 18, life: 1.4, max: 1.4, text: (n >= 0 ? '+$' : '-$') + Math.abs(n) });
  if (n > 0) SFX.cash();
  saveGame();
}

function hurtPlayer(dmg) {
  const P = G.player;
  if (P.car) {
    P.car.hp -= dmg * 0.6;
    if (P.car.hp <= 0 && P.car.speed !== 0) { P.car.speed = 0; }
    P.hp -= dmg * 0.25;
  } else {
    P.hp -= dmg;
  }
  if (P.hp <= 0) doWasted(false);
}

function doWasted(busted) {
  const P = G.player;
  const fine = Math.floor(P.cash * (busted ? 0.15 : 0.1));
  P.cash -= fine;
  G.state = 'wasted';
  G.wastedKind = busted;
  G.wanted = 0; G.bust = 0;
  saveGame();
}

function respawn() {
  const P = G.player;
  const at = G.wastedKind ? G.world.specials.police : G.world.specials.safehouse;
  if (P.car) { P.car.driver = null; P.car = null; }
  P.x = at.door.x; P.y = at.door.y + 18; P.hp = 100;
  G.cars = G.cars.filter((c) => c.kind !== 'police');
  G.peds = G.peds.filter((p) => !p.cop);
  G.state = 'play';
}

// ---------------------------------------------------------------- missions
function setMissionMarker() {
  const S = G.world.specials;
  const M = G.mission, st = G.stage;
  G.marker = null; G.objective = '';
  if (G.storyDone || M === -1 && !G.storyDone) {
    if (!G.storyDone) {
      G.marker = { x: S.cantina.door.x, y: S.cantina.door.y, label: 'Marisol' };
      G.objective = G.mission === -1 ? `Meet ${FIXER_NAME} at Cantina La Brisa` : G.objective;
    }
    if (G.mission === -1 && !G.storyDone) G.objective = `Meet ${FIXER_NAME} at Cantina La Brisa`;
    if (G.storyDone) G.objective = 'Free roam — the chop shop pays $90 for clean cars';
  }
  if (M === 0) {
    if (st === 0) { G.marker = { x: S.cantina.door.x, y: S.cantina.door.y }; G.objective = 'First Wheels: talk to Marisol'; }
    if (st === 1) { G.objective = 'First Wheels: steal any car'; G.marker = null; }
    if (st === 2) { G.marker = { x: S.chopshop.door.x, y: S.chopshop.door.y }; G.objective = 'First Wheels: deliver the car to Taller Reyes'; }
  }
  if (M === 1) {
    if (st === 0) { G.marker = { x: S.cantina.door.x, y: S.cantina.door.y }; G.objective = 'Package Run: talk to Marisol'; }
    if (st === 1) { G.marker = { x: S.warehouse.door.x, y: S.warehouse.door.y }; G.objective = 'Package Run: pick up the package at the warehouse'; }
    if (st === 2) { G.marker = { x: S.hotel.door.x, y: S.hotel.door.y }; G.objective = `Package Run: deliver to Hotel Duquesa — ${Math.max(0, Math.ceil(G.missionTimer))}s`; }
  }
  if (M === 2) {
    if (st === 0) { G.marker = { x: S.cantina.door.x, y: S.cantina.door.y }; G.objective = 'Heat: talk to Marisol'; }
    if (st === 1) { G.objective = 'Heat: lose the police (stars to zero)'; G.marker = null; }
    if (st === 2) { G.marker = { x: S.cantina.door.x, y: S.cantina.door.y }; G.objective = 'Heat: get back to Marisol, clean'; }
  }
  if (M === 3) {
    if (st === 0) { G.marker = { x: S.cantina.door.x, y: S.cantina.door.y }; G.objective = 'The Tiburon: talk to Marisol'; }
    if (st === 1) { G.objective = 'The Tiburon: steal the marked yellow coupe'; G.marker = null; }
    if (st === 2) { G.marker = { x: S.warehouse.door.x, y: S.warehouse.door.y }; G.objective = 'The Tiburon: deliver it to the harbor warehouse'; }
  }
  if (M === 4) {
    if (st === 0) { G.marker = { x: S.cantina.door.x, y: S.cantina.door.y }; G.objective = 'The Final Run: talk to Marisol'; }
    if (st === 1) { G.marker = { x: S.warehouse.door.x, y: S.warehouse.door.y }; G.objective = 'The Final Run: load up at the warehouse'; }
    if (st === 2) { G.marker = { x: 12.5 * TILE * 5, y: 3.5 * TILE * 5 }; G.objective = 'The Final Run: reach the buyer at Palmera Park — and live'; }
  }
}

function startStage(m, st) { G.mission = m; G.stage = st; setMissionMarker(); }

function missionTalk() {
  const M = G.mission === -1 ? 0 : G.mission;
  if (G.mission === -1) G.mission = 0;
  if (M === 0 && G.stage === 0) {
    say(FIXER_NAME, `Nico. You owe half of ${CITY_NAME} and your face is free advertising for the other half. Bring me a car — any car — to Taller Reyes. Steal it politely.`);
    startStage(0, 1);
  } else if (M === 1 && G.stage === 0) {
    say(FIXER_NAME, 'A package waits at the harbor warehouse. The Duquesa hotel pays well for discretion — and the police have been bored lately. Four minutes, no dents in the cargo.');
    startStage(1, 1);
  } else if (M === 2 && G.stage === 0) {
    say(FIXER_NAME, 'The Brisa police think you are their training dummy. Prove them wrong: shake a full three-star tail, then come back to me clean. No shortcuts through the park fountain, amor.');
    G.wanted = 3;
    startStage(2, 1);
  } else if (M === 3 && G.stage === 0) {
    say(FIXER_NAME, 'A collector lands tonight and wants a yellow Tiburon Coupe — one sits in the east lot, practically begging. Bring it to my warehouse. Its owner disagrees with this plan, so expect company.');
    const spot = G.world.lotSpots[G.world.lotSpots.length - 1];
    const car = makeCar(spot.x, spot.y, spot.ang, 3, 'parked');
    G.cars.push(car);
    G.markedCar = car;
    startStage(3, 1);
  } else if (M === 4 && G.stage === 0) {
    say(FIXER_NAME, 'Last one, Nico, and your slate is clean. A heavy package at the warehouse, a buyer waiting in Palmera Park, and every badge in Brisa between you and him. Drive like the tide is chasing you.');
    startStage(4, 1);
  }
}

function finishMission(reward, text) {
  addCash(reward);
  toast(text);
  say(FIXER_NAME, text);
  if (G.mission >= 4) {
    G.storyDone = true;
    G.mission = -1;
    G.state = 'complete';
  } else {
    G.mission += 1;
    G.stage = 0;
  }
  saveGame();
  setMissionMarker();
}

function updateMissions(dt) {
  const S = G.world.specials;
  const P = G.player;
  const M = G.mission, st = G.stage;
  if (G.storyDone) return;
  if ((M === -1 || st === 0) && near(S.cantina.door.x, S.cantina.door.y, 44) && !P.car) {
    G.prompt = `Press E to talk to ${FIXER_NAME}`;
    if (input.hit('KeyE')) missionTalk();
    return;
  }
  if (M === 0 && st === 2 && P.car && near(S.chopshop.door.x, S.chopshop.door.y, 62)) {
    finishMission(300, 'First Wheels done — $300. The Reyes crew will buy clean cars from you now, $90 a piece.');
    return;
  }
  if (M === 1) {
    if (st === 1 && near(S.warehouse.door.x, S.warehouse.door.y, 52)) {
      G.packageCarried = true;
      G.missionTimer = 240;
      G.wanted = Math.max(G.wanted, 2);
      say('Warehouse hand', 'No names, no receipts. The hotel, fast — and friend, the patrols just woke up.');
      startStage(1, 2);
    } else if (st === 2) {
      G.missionTimer -= dt;
      setMissionMarker();
      if (G.missionTimer <= 0) {
        G.packageCarried = false;
        say(FIXER_NAME, 'Too slow, the buyer walked. We try again when the tide turns, Nico.');
        startStage(1, 0);
      } else if (near(S.hotel.door.x, S.hotel.door.y, 56)) {
        G.packageCarried = false;
        finishMission(450, 'Package delivered — $450. The Duquesa sends its regards and a dry towel.');
      }
    }
    return;
  }
  if (M === 2 && st === 1) {
    if (G.wanted <= 0.01) startStage(2, 2);
    return;
  }
  if (M === 2 && st === 2 && near(S.cantina.door.x, S.cantina.door.y, 44) && !P.car) {
    finishMission(600, 'Heat shaken — $600. Somewhere a police instructor is using you as a warning.');
    return;
  }
  if (M === 3 && st === 2 && P.car && near(S.warehouse.door.x, S.warehouse.door.y, 62)) {
    G.markedCar = null;
    finishMission(800, 'The Tiburon purrs in Marisol\'s warehouse — $800. The collector never asks where cars come from.');
    return;
  }
  if (M === 4) {
    if (st === 1 && near(S.warehouse.door.x, S.warehouse.door.y, 52)) {
      G.packageCarried = true;
      G.wanted = 4;
      say('Warehouse hand', 'Heavy, hot and very illegal-looking. Palmera Park, north-east. Go, go!');
      startStage(4, 2);
    } else if (st === 2 && near(12.5 * TILE * 5, 3.5 * TILE * 5, 70)) {
      G.packageCarried = false;
      finishMission(1500, 'The buyer counts the cash twice and smiles. $1,500 — the debt is dead, Nico. Harbor King.');
    }
    return;
  }
}

// ---------------------------------------------------------------- combat
function shoot(x, y, ang, from) {
  G.bullets.push({ x, y, vx: Math.cos(ang) * 640, vy: Math.sin(ang) * 640, from, life: 0.85 });
  G.effects.push({ kind: 'muzzle', x: x + Math.cos(ang) * 14, y: y + Math.sin(ang) * 14, life: 0.07, max: 0.07 });
}

function scarePeds(x, y, r) {
  for (const p of G.peds) {
    if (p.state !== 'down' && !p.cop && Math.hypot(p.x - x, p.y - y) < r) {
      p.state = 'flee'; p.t = 2.4; p.threatX = x; p.threatY = y;
    }
  }
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (pointInBuilding(G.world, b.x, b.y)) { b.life = 0; continue; }
    if (b.from === 'player') {
      for (const p of G.peds) {
        if (p.state !== 'down' && Math.hypot(p.x - b.x, p.y - b.y) < 10) {
          p.hp -= 55; b.life = 0;
          G.effects.push({ kind: 'hit', x: p.x, y: p.y, life: 0.25, max: 0.25 });
          if (p.hp <= 0) { p.state = 'down'; crime(p.cop ? 2 : 2, p.x, p.y); }
          else crime(1, p.x, p.y);
          scarePeds(p.x, p.y, 200);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const c of G.cars) {
        if (c !== G.player.car && Math.hypot(c.x - b.x, c.y - b.y) < 22) {
          c.hp -= 14; b.life = 0;
          if (c.kind === 'police') crime(1.5, c.x, c.y);
          break;
        }
      }
    } else if (b.from === 'cop') {
      const P = G.player;
      const target = P.car || P;
      if (Math.hypot(target.x - b.x, target.y - b.y) < (P.car ? 24 : 10)) {
        hurtPlayer(7);
        b.life = 0;
        G.effects.push({ kind: 'hit', x: target.x, y: target.y, life: 0.25, max: 0.25 });
      }
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

// ---------------------------------------------------------------- updates
function updatePlayer(dt) {
  const P = G.player;
  const mouseWX = input.mouse.x + G.camera.x, mouseWY = input.mouse.y + G.camera.y;
  G.fireCd -= dt;
  if (P.car) {
    const c = P.car;
    const up = input.down('KeyW', 'ArrowUp'), dn = input.down('KeyS', 'ArrowDown');
    const lf = input.down('KeyA', 'ArrowLeft'), rt = input.down('KeyD', 'ArrowRight');
    if (up) c.speed += c.model.accel * dt;
    if (dn) c.speed -= (c.speed > 10 ? 260 : 120) * dt;
    c.speed -= c.speed * 0.7 * dt;
    if (!up && !dn) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 40 * dt);
    c.speed = Math.max(-c.model.speed * 0.42, Math.min(c.model.speed, c.speed));
    const steer = (lf ? -1 : 0) + (rt ? 1 : 0);
    if (steer && Math.abs(c.speed) > 4) c.ang += steer * c.model.grip * dt * Math.min(1, Math.abs(c.speed) / 130) * Math.sign(c.speed);
    const nx = c.x + Math.cos(c.ang) * c.speed * dt;
    const ny = c.y + Math.sin(c.ang) * c.speed * dt;
    const [rx, ry] = collide(G.world, nx, ny, 19);
    if (Math.hypot(rx - nx, ry - ny) > 2 && Math.abs(c.speed) > 90) { SFX.crash(); c.hp -= 6; crime(0.5, c.x, c.y); }
    if (Math.hypot(rx - nx, ry - ny) > 2) c.speed *= 0.45;
    c.x = rx; c.y = ry;
    P.x = c.x; P.y = c.y; P.ang = c.ang;
    if (c.hp <= 25 && G.rng() < dt * 6) G.effects.push({ kind: 'smoke', x: c.x + Math.cos(c.ang) * 16, y: c.y + Math.sin(c.ang) * 16, life: 0.7, max: 0.7 });
    if (input.hit('KeyE')) exitCar();
    return;
  }
  // on foot
  let mx = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
  const sprint = input.down('ShiftLeft', 'ShiftRight');
  const spd = sprint ? 238 : 152;
  if (mx || my) {
    const l = Math.hypot(mx, my);
    mx /= l; my /= l;
    P.walk += dt * (sprint ? 13 : 10);
    const [rx, ry] = collide(G.world, P.x + mx * spd * dt, P.y + my * spd * dt, 10);
    P.x = rx; P.y = ry;
  }
  P.ang = Math.atan2(mouseWY - P.y, mouseWX - P.x);
  // enter a car
  let bestCar = null, bestD = 52;
  for (const c of G.cars) {
    if (c.kind === 'police') continue;
    const d = Math.hypot(c.x - P.x, c.y - P.y);
    if (d < bestD) { bestD = d; bestCar = c; }
  }
  if (bestCar) {
    G.prompt = bestCar.kind === 'traffic' ? 'Press E to carjack' : `Press E to drive the ${bestCar.model.name}`;
    if (input.hit('KeyE')) enterCar(bestCar);
  }
  // punch / shoot
  const wantsFire = input.mouse.down || input.down('Space');
  if (wantsFire && G.fireCd <= 0) {
    if (P.weapon === 'pistol') {
      G.fireCd = 0.21;
      SFX.ensure(); SFX.shot();
      shoot(P.x, P.y, P.ang + range(G.rng, -0.03, 0.03), 'player');
      crime(0.5, P.x, P.y);
      scarePeds(P.x, P.y, 240);
    } else {
      G.fireCd = 0.32;
      SFX.punch();
      for (const p of G.peds) {
        if (p.state !== 'down' && Math.hypot(p.x - P.x, p.y - P.y) < 30) {
          p.hp -= 40;
          G.effects.push({ kind: 'hit', x: p.x, y: p.y, life: 0.2, max: 0.2 });
          if (p.hp <= 0) { p.state = 'down'; crime(2, p.x, p.y); }
          else { crime(1, p.x, p.y); p.state = 'flee'; p.t = 2; p.threatX = P.x; p.threatY = P.y; }
        }
      }
    }
  }
  if (input.hit('KeyQ')) {
    P.weapon = P.weapon === 'pistol' ? 'fists' : 'pistol';
    toast(P.weapon === 'pistol' ? 'Pistol out' : 'Fists up', 1.2);
  }
}

function enterCar(c) {
  const P = G.player;
  SFX.ensure(); SFX.door();
  if (c.kind === 'traffic') {
    const driver = spawnPed(c.x + 14, c.y + 10);
    driver.state = 'flee'; driver.t = 3; driver.threatX = P.x; driver.threatY = P.y;
    crime(1, c.x, c.y);
    toast('Carjacked!', 1.4);
  }
  if (G.mission === 0 && G.stage === 1) startStage(0, 2);
  if (G.markedCar === c && G.mission === 3 && G.stage === 1) {
    G.wanted = Math.max(G.wanted, 2);
    startStage(3, 2);
  }
  c.kind = 'player';
  c.driver = P;
  P.car = c;
}

function exitCar() {
  const P = G.player;
  const c = P.car;
  if (!c) return;
  SFX.door();
  const S = G.world.specials;
  // chop-shop sale: leave any ordinary car at Taller Reyes for cash
  const atChop = Math.hypot(c.x - S.chopshop.door.x, c.y - S.chopshop.door.y) < 74;
  const missionDelivery = (G.mission === 0 && G.stage === 2) || (G.mission === 3 && G.stage === 2);
  c.kind = 'parked';
  c.driver = null;
  P.car = null;
  const [rx, ry] = collide(G.world, c.x - Math.sin(c.ang) * 30, c.y + Math.cos(c.ang) * 30, 10);
  P.x = rx; P.y = ry;
  if (atChop && !missionDelivery && c.hp > 5) {
    G.cars = G.cars.filter((x) => x !== c);
    addCash(90, c.x, c.y);
    toast('Sold to Taller Reyes — $90', 2);
  }
}

function updateTraffic(dt) {
  const lines = roadLines();
  const P = G.player;
  for (const c of G.cars) {
    if (c.kind !== 'traffic') continue;
    // obstacle ahead?
    let blocked = false;
    const fx = c.x + Math.cos(c.ang) * 40, fy = c.y + Math.sin(c.ang) * 40;
    for (const o of G.cars) {
      if (o !== c && Math.hypot(o.x - fx, o.y - fy) < 26) { blocked = true; break; }
    }
    if (!blocked && Math.hypot(P.x - fx, P.y - fy) < 26 && !P.car) blocked = true;
    const want = blocked ? 0 : c.targetSpeed;
    c.speed += Math.sign(want - c.speed) * Math.min(Math.abs(want - c.speed), 190 * dt);
    const step = c.speed * dt;
    if (c.axis === 'v') {
      // approaching a cross street?
      for (const hy of lines.h) {
        if ((c.y - hy) * (c.y + Math.sign(c.dir) * step - hy) <= 0 && Math.abs(c.y - hy) < Math.abs(step) + 1) {
          if (G.rng() < 0.38) {
            c.axis = 'h'; c.lane = hy; c.y = hy + (c.dir > 0 ? 14 : -14);
            c.dir = G.rng() < 0.5 ? 1 : -1;
            c.x = c.lane === hy ? c.x : c.x;
            c.ang = c.dir > 0 ? 0 : Math.PI;
            c.y = hy + (c.dir > 0 ? 14 : -14);
            break;
          }
        }
      }
      c.y += Math.sign(c.dir) * step;
      c.x = c.lane + (c.dir > 0 ? -14 : 14);
      c.ang = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (c.y > (WATER_TY - 1) * TILE - 30 && c.dir > 0) { c.axis = 'h'; c.lane = lines.h[lines.h.length - 1]; c.dir = G.rng() < 0.5 ? 1 : -1; }
      if (c.y < -50 || c.y > WORLD_H) c.dead = true;
    } else {
      for (const vx of lines.v) {
        if ((c.x - vx) * (c.x + Math.sign(c.dir) * step - vx) <= 0 && Math.abs(c.x - vx) < Math.abs(step) + 1) {
          if (G.rng() < 0.38) {
            c.axis = 'v'; c.lane = vx;
            c.dir = G.rng() < 0.5 ? 1 : -1;
            c.ang = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            break;
          }
        }
      }
      c.x += Math.sign(c.dir) * step;
      c.y = c.lane + (c.dir > 0 ? 14 : -14);
      c.ang = c.dir > 0 ? 0 : Math.PI;
      if (c.x < -50 || c.x > WORLD_W + 50) c.dead = true;
    }
    // run over a pedestrian?
    for (const p of G.peds) {
      if (p.state !== 'down' && Math.abs(c.speed) > 55 && Math.hypot(p.x - c.x, p.y - c.y) < 20) {
        p.state = 'down'; p.hp = 0;
        G.effects.push({ kind: 'hit', x: p.x, y: p.y, life: 0.3, max: 0.3 });
      }
    }
  }
  G.cars = G.cars.filter((c) => !c.dead);
  G.trafficCd -= dt;
  const trafficCount = G.cars.filter((c) => c.kind === 'traffic').length;
  if (trafficCount < 13 && G.trafficCd <= 0) { spawnTrafficCar(false); G.trafficCd = 1.2; }
}

function updatePeds(dt) {
  const P = G.player;
  for (const p of G.peds) {
    if (p.state === 'down' || p.state === 'stand') continue;
    if (p.cop) { updateCopPed(p, dt); continue; }
    if (p.state === 'flee') {
      p.t -= dt;
      const a = Math.atan2(p.y - p.threatY, p.x - p.threatX);
      const [rx, ry] = collide(G.world, p.x + Math.cos(a) * 205 * dt, p.y + Math.sin(a) * 205 * dt, 8);
      p.x = rx; p.y = ry; p.ang = a;
      if (p.t <= 0) p.state = 'walk';
      continue;
    }
    // wander
    p.t -= dt;
    if (p.t <= 0 || Math.hypot(p.tx - p.x, p.ty - p.y) < 8) {
      p.t = range(G.rng, 2, 6);
      for (let i = 0; i < 8; i++) {
        const tx = p.x + range(G.rng, -260, 260), ty = p.y + range(G.rng, -260, 260);
        if (tx > 20 && ty > 20 && tx < WORLD_W - 20 && ty < (WATER_TY - 1) * TILE && !pointInBuilding(G.world, tx, ty)) { p.tx = tx; p.ty = ty; break; }
      }
    }
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    const [rx, ry] = collide(G.world, p.x + Math.cos(a) * 62 * dt, p.y + Math.sin(a) * 62 * dt, 8);
    p.x = rx; p.y = ry; p.ang = a;
    // run from a fast car bearing down
    const threat = (P.car && Math.abs(P.car.speed) > 120 && Math.hypot(P.car.x - p.x, P.car.y - p.y) < 90) ? P.car : null;
    if (threat) { p.state = 'flee'; p.t = 1.6; p.threatX = threat.x; p.threatY = threat.y; }
    void P;
  }
}

function updateCopPed(p, dt) {
  const P = G.player;
  const d = Math.hypot(P.x - p.x, P.y - p.y);
  p.ang = Math.atan2(P.y - p.y, P.x - p.x);
  if (G.wanted <= 0) { p.state = 'walk'; p.cop = false; p.color = pick(G.rng, PED_COLORS); return; }
  if (d > 130) {
    const [rx, ry] = collide(G.world, p.x + Math.cos(p.ang) * 168 * dt, p.y + Math.sin(p.ang) * 168 * dt, 8);
    p.x = rx; p.y = ry;
  } else if (G.wanted >= 3) {
    p.fireCd -= dt;
    if (p.fireCd <= 0 && d < 300) {
      p.fireCd = range(G.rng, 0.7, 1.3);
      SFX.shot();
      shoot(p.x, p.y, p.ang + range(G.rng, -0.09, 0.09), 'cop');
    }
  }
  // bust by contact
  if (!P.car && d < 24 && G.wanted > 0) G.bust = Math.min(1, G.bust + dt / 2.0);
}

function spawnPolice() {
  const S = G.world.specials;
  const c = makeCar(S.police.door.x, S.police.door.y - 30, -Math.PI / 2, 2, 'police');
  c.color = '#eceff1';
  c.targetSpeed = 300;
  G.cars.push(c);
  return c;
}

function updatePolice(dt) {
  const P = G.player;
  const want = G.wanted <= 0 ? 0 : Math.min(4, 1 + Math.floor(G.wanted));
  const cops = G.cars.filter((c) => c.kind === 'police');
  if (cops.length < want) { G.policeCd = (G.policeCd || 0) - dt; if (G.policeCd <= 0) { spawnPolice(); G.policeCd = 2.5; } }
  let anySee = false;
  for (const c of cops) {
    if (c.hp <= 0) { c.speed = 0; continue; }
    const tx = P.x + (P.car ? Math.cos(P.ang) * P.car.speed * 0.35 : 0);
    const ty = P.y + (P.car ? Math.sin(P.ang) * P.car.speed * 0.35 : 0);
    const d = Math.hypot(tx - c.x, ty - c.y);
    if (d < 330) anySee = true;
    const desired = Math.atan2(ty - c.y, tx - c.x);
    let turn = desired - c.ang;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    c.ang += Math.max(-2.6 * dt, Math.min(2.6 * dt, turn));
    const top = P.car ? 305 : 268;
    const wantSpeed = d > 60 ? top : top * 0.45;
    c.speed += Math.sign(wantSpeed - c.speed) * Math.min(Math.abs(wantSpeed - c.speed), 240 * dt);
    const nx = c.x + Math.cos(c.ang) * c.speed * dt;
    const ny = c.y + Math.sin(c.ang) * c.speed * dt;
    const [rx, ry] = collide(G.world, nx, ny, 19);
    if (Math.hypot(rx - nx, ry - ny) > 2) c.speed *= 0.5;
    c.x = rx; c.y = ry;
    // ram damage
    if (P.car && Math.hypot(P.car.x - c.x, P.car.y - c.y) < 38 && Math.abs(c.speed - P.car.speed) > 60) {
      P.car.hp -= 5; c.hp -= 3; SFX.crash();
    }
    // a stopped police car near an on-foot player disgorges an officer
    if (!P.car && d < 110 && Math.abs(c.speed) < 30 && !c.officerOut) {
      c.officerOut = true;
      spawnPed(c.x + 16, c.y + 12, true);
    }
    if (d > 1500 && G.wanted <= 0) c.dead = true;
    // bust by car proximity
    if (!P.car && d < 44 && Math.abs(c.speed) < 60) G.bust = Math.min(1, G.bust + dt / 2.4);
  }
  // heat decay
  if (G.wanted > 0) {
    if (anySee) G.seenTimer = 0;
    else {
      G.seenTimer += dt;
      if (G.seenTimer > 5) G.wanted = Math.max(0, G.wanted - dt * 0.14);
    }
  }
  if (G.bust > 0 && !cops.some((c) => Math.hypot(c.x - P.x, c.y - P.y) < 60) && !G.peds.some((p) => p.cop && Math.hypot(p.x - P.x, p.y - P.y) < 30)) {
    G.bust = Math.max(0, G.bust - dt * 0.8);
  }
  if (G.bust >= 1) doWasted(true);
  if (anySee && G.wanted >= 2) {
    G.sirenCd -= dt;
    if (G.sirenCd <= 0) { SFX.siren(); G.sirenCd = 0.9; }
  }
}

function updateCarCar(dt) {
  const cs = G.cars;
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < 37) {
        const push = (37 - d) / 2, ux = dx / d, uy = dy / d;
        if (a.kind !== 'player') { a.x -= ux * push; a.y -= uy * push; }
        if (b.kind !== 'player') { b.x += ux * push; b.y += uy * push; }
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 70) {
          a.hp -= 4; b.hp -= 4;
          if (a.kind === 'player' || b.kind === 'player') { SFX.crash(); crime(0.5, a.x, a.y); }
          a.speed *= 0.6; b.speed *= 0.6;
        }
      }
    }
  }
  void dt;
}

function updateCamera() {
  const P = G.player;
  G.camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, P.x - VIEW_W / 2));
  G.camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, P.y - VIEW_H / 2));
}

function update(dt) {
  G.t += dt;
  G.dusk = 0.5 + 0.5 * Math.sin(G.t * 0.021 - 1.2);
  if (G.dialogue) { G.dialogueT -= dt; if (G.dialogueT <= 0) G.dialogue = null; }
  if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
  for (const fx of G.effects) { fx.life -= dt; if (fx.kind === 'cash') fx.y -= 12 * dt; }
  G.effects = G.effects.filter((f) => f.life > 0);
  G.prompt = null;
  updatePlayer(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateCarCar(dt);
  updateBullets(dt);
  updateMissions(dt);
  // ambient ped respawn far away
  if (G.peds.filter((p) => !p.cop).length < 26 && G.rng() < dt * 0.5) {
    const x = G.player.x + range(G.rng, -900, 900), y = G.player.y + range(G.rng, -700, 700);
    if (x > 20 && y > 20 && x < WORLD_W - 20 && y < (WATER_TY - 1) * TILE && !pointInBuilding(G.world, x, y)) spawnPed(x, y);
  }
  // player-car wreck: fully dead cars stop
  if (G.player.car && G.player.car.hp <= 0) G.player.car.speed = 0;
  updateCamera();
}

// ---------------------------------------------------------------- flow
function startGame(save) {
  resetWorld(save);
  G.state = 'play';
  if (!save) {
    say(FIXER_NAME, `${HERO_NAME} lands in ${CITY_NAME} with $120 and a reputation. Marisol Vega — purple dress, cantina by the west market — has work. Go say hello.`, 8);
  } else {
    toast('Welcome back to ' + CITY_NAME, 2);
  }
}

let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
  last = ts;
  if (G.shotMode) {
    G.t += dt;
    updateCamera();
    drawWorld(ctx, G);
    drawHUD(ctx, G);
    input.endFrame();
    return;
  }
  if (input.hit('KeyM')) { SFX.muted = !SFX.muted; toast(SFX.muted ? 'Sound off' : 'Sound on', 1); }
  if (G.state === 'title') {
    G.t += dt;
    drawTitle(ctx, G);
    if (input.hit('Enter')) { SFX.ensure(); startGame(loadSave()); }
    if (input.hit('KeyN')) { try { localStorage.removeItem('viceHarborSaveV1'); } catch { /* ignore */ } G.hasSave = false; SFX.ensure(); startGame(null); }
  } else if (G.state === 'wasted') {
    drawWorld(ctx, G);
    drawHUD(ctx, G);
    drawWasted(ctx, G, G.wastedKind);
    if (input.hit('Enter')) respawn();
  } else if (G.state === 'complete') {
    drawWorld(ctx, G);
    drawHUD(ctx, G);
    drawComplete(ctx, G);
    if (input.hit('Enter')) { G.state = 'play'; setMissionMarker(); }
  } else if (G.state === 'paused') {
    drawWorld(ctx, G);
    drawHUD(ctx, G);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2);
    if (input.hit('KeyP', 'Escape')) G.state = 'play';
  } else {
    if (input.hit('KeyP', 'Escape')) { G.state = 'paused'; input.endFrame(); return; }
    update(dt);
    drawWorld(ctx, G);
    drawHUD(ctx, G);
  }
  input.endFrame();
}

// fit the canvas to the window keeping 16:9
function fit() {
  const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  canvas.style.width = Math.floor(VIEW_W * s) + 'px';
  canvas.style.height = Math.floor(VIEW_H * s) + 'px';
}
addEventListener('resize', fit);
fit();

G.hasSave = !!loadSave();
if (G.shotMode) {
  resetWorld(null);
  setupShot(G, SHOT, { makeCar, spawnPed });
  updateCamera();
}
requestAnimationFrame(frame);
