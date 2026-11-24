// Deterministic scenes for the entry's screenshots: ?shot=<name>&seed=<n>
// poses the game without any input, so each shot is a real render of the
// game's own code — the title-side arrival, a talk with Marisol, a police
// chase at three stars, and the warehouse pick-up.
import { TILE, FIXER_NAME, HERO_NAME, CITY_NAME } from './config.js';

export function setupShot(G, name, helpers) {
  const S = G.world.specials;
  const P = G.player;
  const { makeCar, spawnPed } = helpers;

  if (name === 'start') {
    P.x = S.safehouse.door.x - 60; P.y = S.safehouse.door.y + 60; P.ang = -Math.PI / 2;
    G.dialogue = { speaker: FIXER_NAME, text: `${HERO_NAME} lands in ${CITY_NAME} with $120 and a reputation. Marisol Vega — purple dress, cantina by the west market — has work. Go say hello.` };
    G.dialogueT = 999;
  }

  if (name === 'play') {
    P.x = S.cantina.door.x - 130; P.y = S.cantina.door.y + 46; P.ang = 0.4;
    const c1 = makeCar(S.cantina.door.x + 90, S.cantina.door.y + 120, 0.2, 0, 'parked');
    const c2 = makeCar(S.cantina.door.x - 220, S.cantina.door.y + 130, Math.PI, 2, 'parked');
    G.cars.push(c1, c2);
  }

  if (name === 'chase') {
    const roadY = 5 * TILE + TILE / 2 + 14; // a horizontal avenue
    const car = makeCar(6.2 * TILE * 5, roadY, 0, 3, 'player');
    car.speed = 240;
    G.cars.push(car);
    P.car = car; car.driver = P;
    P.x = car.x; P.y = car.y; P.ang = 0;
    const cop1 = makeCar(car.x - 150, roadY - 26, 0.15, 2, 'police');
    const cop2 = makeCar(car.x - 260, roadY + 30, -0.1, 2, 'police');
    G.cars.push(cop1, cop2);
    spawnPed(car.x + 150, roadY - 60);
    spawnPed(car.x + 210, roadY + 70);
    G.wanted = 3;
    G.objective = 'Heat: lose the police (stars to zero)';
    G.marker = null;
  }

  if (name === 'mission') {
    P.x = S.warehouse.door.x - 40; P.y = S.warehouse.door.y + 30; P.ang = -0.6;
    const van = makeCar(S.warehouse.door.x + 80, S.warehouse.door.y + 66, 0, 4, 'parked');
    G.cars.push(van);
    G.dialogue = { speaker: 'Warehouse hand', text: 'No names, no receipts. The hotel, fast — and friend, the patrols just woke up.' };
    G.dialogueT = 999;
    G.marker = { x: S.hotel.door.x, y: S.hotel.door.y };
    G.objective = 'Package Run: deliver to Hotel Duquesa — 231s';
    G.wanted = 2;
  }
}
