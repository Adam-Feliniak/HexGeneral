'use strict';
/* ============================================================
   SPRITE'Y — wczytywanie plików PNG z assets/ (generuje tools/gen-sprites.js)
   ============================================================ */

let SPR = null;

function loadSprite(name) {
  if (typeof Image === 'undefined') return { complete: false, naturalWidth: 0 };
  const img = new Image();
  img.src = 'assets/' + name + '.png';
  return img;
}

function loadSprites() {
  SPR = {
    tanks: [], soldiers: [], artillery: [], capitals: [],
    cities: [loadSprite('city_0'), loadSprite('city_1'), loadSprite('city_2')],
    cityPort: loadSprite('city_port'),
    crane: loadSprite('crane'),
    trees: [loadSprite('tree_0'), loadSprite('tree_1')],
    res: { oil: loadSprite('res_oil'), farm: loadSprite('res_farm'), mine: loadSprite('res_mine') },
    rocks: [loadSprite('rock_0'), loadSprite('rock_1')],
    hexSand: [0, 1, 2].map(v => loadSprite('hex_sand_' + v)),
    hexGrass: [0, 1, 2].map(v => loadSprite('hex_grass_' + v)),
    hexWater: [0, 1, 2].map(v => loadSprite('hex_water_' + v)),
    hexShallow: loadSprite('hex_shallow'),
    explosion: loadSprite('explosion'), // 6 klatek 48x48 obok siebie
  };
  SPR.ships = [];
  for (let i = 0; i < PLAYERS_DEF.length; i++) {
    SPR.tanks.push(loadSprite('tank_' + i));       // 4 klatki jazdy 48x28 obok siebie
    SPR.artillery.push(loadSprite('artillery_' + i));
    SPR.soldiers.push(loadSprite('soldier_' + i)); // 4 klatki 24x30 obok siebie
    SPR.capitals.push(loadSprite('capital_' + i));
    // klasy okrętów: barka / pancernik / lotniskowiec
    SPR.ships.push([loadSprite('ship0_' + i), loadSprite('ship1_' + i), loadSprite('ship2_' + i)]);
  }
}

function sprOk(img) { return !!img && img.complete && img.naturalWidth > 0; }
