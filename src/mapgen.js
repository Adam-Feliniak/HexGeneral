'use strict';
/* ============================================================
   GENERATOR MAPY — kontynenty, stolice, miasta, złoża, wybrzeże
   ============================================================ */

function generateMap(playerCount = PLAYERS_DEF.length, seed = null) {
  const rand = seed != null ? makeRng(seed) : Math.random;
  let land = [];
  for (let r = 0; r < MAP_H; r++) {
    land.push(Array.from({ length: MAP_W }, () => rand() < 0.58));
  }
  // automat komórkowy — wygładzenie kontynentów
  for (let it = 0; it < 3; it++) {
    const next = land.map(row => row.slice());
    for (let r = 0; r < MAP_H; r++) {
      for (let c = 0; c < MAP_W; c++) {
        let n = 0, tot = 0;
        for (const [nc, nr] of neighborCoords(c, r)) {
          if (!inBounds(nc, nr)) continue;
          tot++;
          if (land[nr][nc]) n++;
        }
        if (n > tot / 2) next[r][c] = true;
        else if (n < tot / 2) next[r][c] = false;
      }
    }
    land = next;
  }
  // wymuś ląd wokół stolic
  for (const [cc, cr] of CAPITAL_SPOTS.slice(0, playerCount)) {
    for (let r = 0; r < MAP_H; r++) {
      for (let c = 0; c < MAP_W; c++) {
        if (hexDist(c, r, cc, cr) <= 2) land[r][c] = true;
      }
    }
  }

  const tiles = [];
  for (let r = 0; r < MAP_H; r++) {
    const row = [];
    for (let c = 0; c < MAP_W; c++) {
      row.push({
        c, r,
        land: land[r][c],
        city: null,       // { name, capitalOf, port }
        resource: null,   // 'oil' | 'farm' | 'mine'
        road: null,       // { owner, city, path } — droga wytyczona przy zajęciu złoża
        owner: -1,
        army: null,       // { player, str, vet, movesUsed }
        shade: rnd(-1, 1, rand), // drobna wariacja koloru terenu
      });
    }
    tiles.push(row);
  }

  // stolice
  const names = shuffle(CITY_NAMES.slice(), rand);
  PLAYERS_DEF.slice(0, playerCount).forEach((p, i) => {
    const [c, r] = CAPITAL_SPOTS[i];
    tiles[r][c].city = { name: p.name, capitalOf: i, port: false };
    tiles[r][c].owner = i;
  });

  // miasta
  const landTiles = shuffle(tiles.flat().filter(t => t.land && !t.city), rand);
  let placed = 0;
  for (const t of landTiles) {
    if (placed >= CITY_COUNT) break;
    let ok = true;
    for (const row of tiles) for (const o of row) {
      if (o.city && hexDist(t.c, t.r, o.c, o.r) < 3) { ok = false; break; }
    }
    if (!ok) continue;
    t.city = { name: names[placed % names.length], capitalOf: -1, port: false, variant: irnd(3, rand) };
    placed++;
  }

  // porty: miasto sąsiadujące z wodą
  for (const row of tiles) for (const t of row) {
    if (!t.city) continue;
    t.city.port = neighborCoords(t.c, t.r)
      .some(([nc, nr]) => inBounds(nc, nr) && !tiles[nr][nc].land);
  }

  // złoża surowców: typ zależy od terenu (trawa/piach/skały)
  const resSpots = shuffle(tiles.flat().filter(t => t.land && !t.city), rand);
  let resPlaced = 0;
  for (const t of resSpots) {
    if (resPlaced >= RESOURCE_COUNT) break;
    let ok = true;
    for (const row of tiles) for (const o of row) {
      if ((o.city && hexDist(t.c, t.r, o.c, o.r) < 2) ||
          (o.resource && hexDist(t.c, t.r, o.c, o.r) < 3)) { ok = false; break; }
    }
    if (!ok) continue;
    t.resource = t.shade < -0.45 ? 'mine' : t.shade > 0.15 ? 'farm' : 'oil';
    resPlaced++;
  }

  // linia brzegowa: ląd zapamiętuje krawędzie z wodą (piana),
  // a woda przy lądzie jest płycizną (jaśniejsza)
  for (const row of tiles) for (const t of row) {
    const dirs = (t.r % 2 === 0) ? DIRS_EVEN : DIRS_ODD;
    if (t.land) {
      t.coast = [];
      for (let d = 0; d < 6; d++) {
        const [nc, nr] = [t.c + dirs[d][0], t.r + dirs[d][1]];
        if (inBounds(nc, nr) && !tiles[nr][nc].land) t.coast.push(d);
      }
    } else {
      t.shallow = dirs.some(([dc, dr]) =>
        inBounds(t.c + dc, t.r + dr) && tiles[t.r + dr][t.c + dc].land);
    }
  }
  return tiles;
}
