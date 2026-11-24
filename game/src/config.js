// Vice Harbor — world constants. Everything here is invented for this game:
// the city of Puerto Brisa, its people, its cars and its story are original.
export const TILE = 64;              // one city tile, in pixels
export const BLOCKS_X = 14;          // blocks across
export const BLOCKS_Y = 11;          // blocks down
export const ROAD_EVERY = 5;         // a road every 5 tiles
export const WORLD_W = BLOCKS_X * ROAD_EVERY * TILE;
export const WORLD_H = BLOCKS_Y * ROAD_EVERY * TILE;

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const CAR_MODELS = [
  { name: 'Comet Cabrio', color: '#e74c3c', speed: 265, accel: 210, grip: 3.4 },
  { name: 'Bison Pickup', color: '#7f8c9b', speed: 215, accel: 165, grip: 2.8 },
  { name: 'Palmera Sedan', color: '#3498db', speed: 240, accel: 185, grip: 3.1 },
  { name: 'Tiburon Coupe', color: '#f1c40f', speed: 285, accel: 235, grip: 3.6 },
  { name: 'Mercurio Van', color: '#95a5a6', speed: 195, accel: 150, grip: 2.5 },
  { name: 'Duquesa Classic', color: '#9b59b6', speed: 225, accel: 170, grip: 2.9 },
];

export const PED_NAMES = ['Luz', 'Marco', 'Iris', 'Tomas', 'Nadia', 'Felix', 'Rosa', 'Hugo', 'Alba', 'Dario', 'Mila', 'Santi'];
export const PED_COLORS = ['#e67e22', '#1abc9c', '#e84393', '#f39c12', '#6c5ce7', '#00b894', '#d63031', '#0984e3', '#fd79a8', '#b2bec3'];

export const CITY_NAME = 'Puerto Brisa';
export const HERO_NAME = 'Nico Ferrer';
export const FIXER_NAME = 'Marisol Vega';
