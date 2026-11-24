// Puerto Brisa: a seeded grid city. Roads run every five tiles; between them
// sit blocks with buildings, parks, parking lots and a few named places the
// story uses — Marisol's cantina, the harbor warehouse, the police station,
// the Reyes chop shop, the Hotel Duquesa and Nico's safehouse. The south edge
// is the harbor: a promenade, then water.
import { TILE, BLOCKS_X, BLOCKS_Y, ROAD_EVERY, WORLD_W, WORLD_H } from './config.js';
import { mulberry32, pick, range } from './random.js';

export const TILES_X = BLOCKS_X * ROAD_EVERY;
export const TILES_Y = BLOCKS_Y * ROAD_EVERY;
export const WATER_TY = TILES_Y - 4; // first water row

export const isRoadTile = (tx, ty) => ty < WATER_TY - 1 && (tx % ROAD_EVERY === 0 || ty % ROAD_EVERY === 0);
export const isWaterTile = (tx, ty) => ty >= WATER_TY;
export const tileAt = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];

const BUILDING_COLORS = ['#8d6e63', '#78909c', '#a1887f', '#90a4ae', '#b0bec5', '#ffcc80', '#ffab91', '#ce93d8', '#81d4fa', '#a5d6a7', '#ffe082', '#bcaaa4'];
const ROOF_COLORS = ['#5d4037', '#455a64', '#6d4c41', '#546e7a', '#4e342e', '#795548'];

const SPECIALS = {
  safehouse: { bx: 1, by: 9, name: "Nico's Safehouse", color: '#4db6ac', roof: '#00695c' },
  cantina: { bx: 3, by: 3, name: 'Cantina La Brisa', color: '#ffb74d', roof: '#e65100' },
  warehouse: { bx: 11, by: 9, name: 'Harbor Warehouse', color: '#90a4ae', roof: '#37474f' },
  police: { bx: 7, by: 2, name: 'Brisa Police Station', color: '#64b5f6', roof: '#0d47a1' },
  chopshop: { bx: 10, by: 5, name: 'Taller Reyes', color: '#a1887f', roof: '#4e342e' },
  hotel: { bx: 5, by: 7, name: 'Hotel Duquesa', color: '#f48fb1', roof: '#880e4f' },
};
const PARKS = new Set(['2,6', '8,8', '12,3']);
const LOTS = new Set(['6,4', '12,7', '4,1']);

export function buildWorld(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const specials = {};
  const lotSpots = []; // parked-car spots {x, y, ang}

  for (let by = 0; by < BLOCKS_Y; by++) {
    for (let bx = 0; bx < BLOCKS_X; bx++) {
      const key = bx + ',' + by;
      const ox = bx * ROAD_EVERY * TILE + TILE; // skip the road tile
      const oy = by * ROAD_EVERY * TILE + TILE;
      const size = (ROAD_EVERY - 1) * TILE;     // 4 tiles of buildable block
      const special = Object.entries(SPECIALS).find(([, s]) => s.bx === bx && s.by === by);
      if (special) {
        const [id, s] = special;
        const b = { x: ox + 22, y: oy + 22, w: size - 44, h: size - 44, color: s.color, roof: s.roof, floors: 3, name: s.name, special: id };
        buildings.push(b);
        specials[id] = { x: b.x + b.w / 2, y: b.y + b.h + 26, door: { x: b.x + b.w / 2, y: b.y + b.h + 10 }, building: b };
        continue;
      }
      if (by >= WATER_TY / ROAD_EVERY - 0 && oy >= (WATER_TY - 1) * TILE) continue; // promenade row stays open
      if (PARKS.has(key)) {
        for (let i = 0; i < 9; i++) trees.push({ x: ox + range(rng, 24, size - 24), y: oy + range(rng, 24, size - 24), r: range(rng, 13, 20) });
        continue;
      }
      if (LOTS.has(key)) {
        for (let i = 0; i < 4; i++) lotSpots.push({ x: ox + 44 + i * 52, y: oy + 60, ang: Math.PI / 2 });
        for (let i = 0; i < 4; i++) lotSpots.push({ x: ox + 44 + i * 52, y: oy + size - 60, ang: -Math.PI / 2 });
        continue;
      }
      // ordinary block: 1-4 buildings with a sidewalk margin
      const n = rng() < 0.4 ? 1 : 2 + Math.floor(rng() * 3);
      const cell = size / (n === 1 ? 1 : 2);
      for (let i = 0; i < n; i++) {
        const cx = ox + (n === 1 ? 0 : (i % 2) * cell);
        const cy = oy + (n === 1 ? 0 : Math.floor(i / 2) * cell);
        const m = 13;
        buildings.push({
          x: cx + m, y: cy + m, w: cell - m * 2, h: cell - m * 2,
          color: pick(rng, BUILDING_COLORS), roof: pick(rng, ROOF_COLORS),
          floors: 2 + Math.floor(rng() * 7), name: null, special: null,
        });
      }
      if (rng() < 0.5) trees.push({ x: ox + range(rng, 16, size - 16), y: oy + range(rng, 16, size - 16), r: range(rng, 10, 15) });
    }
  }

  // street lamps along the roads
  for (let tx = 0; tx < TILES_X; tx += 2) {
    for (let ty = 0; ty < WATER_TY - 1; ty += 2) {
      if (isRoadTile(tx, ty)) lamps.push({ x: tx * TILE + 8, y: ty * TILE + 8 });
    }
  }

  return { buildings, trees, lamps, specials, lotSpots, seed };
}

// Circle vs buildings / water / world edge. Returns a corrected [x, y].
export function collide(world, x, y, r) {
  x = Math.max(r, Math.min(WORLD_W - r, x));
  y = Math.max(r, Math.min(WORLD_H - r, y));
  const waterY = WATER_TY * TILE;
  if (y > waterY - r) y = waterY - r;
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(b.x + b.w, x));
    const ny = Math.max(b.y, Math.min(b.y + b.h, y));
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) { y = b.y - r; continue; }
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    }
  }
  return [x, y];
}

export function pointInBuilding(world, x, y) {
  for (const b of world.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// Road center lines for traffic: pixel coordinates of each road's middle.
export function roadLines() {
  const v = [], h = [];
  for (let tx = 0; tx < TILES_X; tx += ROAD_EVERY) v.push(tx * TILE + TILE / 2);
  for (let ty = 0; ty < WATER_TY - 1; ty += ROAD_EVERY) h.push(ty * TILE + TILE / 2);
  return { v, h };
}

export function isOnRoad(x, y) {
  const [tx, ty] = tileAt(x, y);
  return isRoadTile(tx, ty);
}
