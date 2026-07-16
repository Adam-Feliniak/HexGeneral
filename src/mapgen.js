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
        city: null,       // { name, capitalOf, port, buildType }
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
    tiles[r][c].city = { name: p.name, capitalOf: i, port: false, buildType: DEFAULT_UNIT_TYPE };
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
    t.city = { name: names[placed % names.length], capitalOf: -1, port: false, variant: irnd(3, rand), buildType: DEFAULT_UNIT_TYPE };
    placed++;
  }

  // porty: miasto sąsiadujące z wodą
  recomputePorts(tiles);

  // wyspy stolic bez połączenia z resztą świata są niewygrywalne z definicji —
  // domykamy je portem (jeśli dzielą akwen z głównym lądem) albo mostem lądowym
  ensureCapitalConnectivity(tiles, playerCount, names, rand);

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

// przelicza t.city.port dla wszystkich miast — wołane po generacji miast
// oraz ponownie po każdej naprawie połączeń (most/port mogły zmienić wybrzeże)
function recomputePorts(tiles) {
  for (const row of tiles) for (const t of row) {
    if (!t.city) continue;
    t.city.port = neighborCoords(t.c, t.r)
      .some(([nc, nr]) => inBounds(nc, nr) && !tiles[nr][nc].land);
  }
}

// dzieli siatkę na spójne obszary (BFS po sąsiedztwie heksów) spełniające predicate —
// używane osobno dla lądu i dla wody, żeby zbudować graf osiągalności stolic
function floodFillComponents(tiles, predicate) {
  const id = tiles.map(row => row.map(() => -1));
  const sizes = [];
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      if (!predicate(tiles[r][c]) || id[r][c] !== -1) continue;
      const comp = sizes.length;
      let size = 0;
      const stack = [[c, r]];
      id[r][c] = comp;
      while (stack.length) {
        const [cc, cr] = stack.pop();
        size++;
        for (const [nc, nr] of neighborCoords(cc, cr)) {
          if (!inBounds(nc, nr) || !predicate(tiles[nr][nc]) || id[nr][nc] !== -1) continue;
          id[nr][nc] = comp;
          stack.push([nc, nr]);
        }
      }
      sizes.push(size);
    }
  }
  return { id, sizes };
}

// graf ruchu między lądami: wejście na morze wymaga portu (canStep w combat.js),
// ale zejście na ląd nie — stąd krawędzie "ląd->woda" tylko z portów,
// a "woda->ląd" z dowolnego wybrzeża
function buildPortGraph(tiles, landId, waterId) {
  const depart = new Set(), arrive = new Set();
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const t = tiles[r][c];
      if (!t.land) continue;
      for (const [nc, nr] of neighborCoords(c, r)) {
        if (!inBounds(nc, nr) || tiles[nr][nc].land) continue;
        const w = waterId[nr][nc];
        arrive.add(`${w}>${landId[r][c]}`);
        if (t.city && t.city.port) depart.add(`${landId[r][c]}>${w}`);
      }
    }
  }
  return { depart, arrive };
}

function canReachLand(fromComp, toComp, depart, arrive) {
  if (fromComp === toComp) return true;
  const seen = new Set([`L${fromComp}`]);
  const stack = [`L${fromComp}`];
  while (stack.length) {
    const node = stack.pop();
    const kind = node[0], id = node.slice(1);
    const edges = kind === 'L' ? depart : arrive;
    const prefix = `${id}>`;
    for (const e of edges) {
      if (!e.startsWith(prefix)) continue;
      const to = e.slice(prefix.length);
      const nextKind = kind === 'L' ? 'W' : 'L';
      if (nextKind === 'L' && Number(to) === toComp) return true;
      const nextNode = nextKind + to;
      if (!seen.has(nextNode)) { seen.add(nextNode); stack.push(nextNode); }
    }
  }
  return false;
}

// most heksów po prostej (interpolacja w kostkowych współrzędnych, zaokrąglona
// do siatki) — używany tylko gdy dwa lądy nie dzielą żadnego wspólnego akwenu
function hexLine(c1, r1, c2, r2) {
  const toCube = (c, r) => { const x = c - ((r - (r & 1)) >> 1); return [x, r]; };
  const round = (x, z) => {
    const y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return [rx, rz];
  };
  const n = hexDist(c1, r1, c2, r2);
  const [x1, z1] = toCube(c1, r1), [x2, z2] = toCube(c2, r2);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const [rx, rz] = round(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
    pts.push([rx + ((rz - (rz & 1)) >> 1), rz]);
  }
  return pts;
}

// awaryjne domknięcie: kopie najkrótszy lądowy pomost między dwoma kontynentami
function carveLandBridge(tiles, landId, comp, mainComp) {
  let bestA = null, bestB = null, bestDist = Infinity;
  for (let r1 = 0; r1 < MAP_H; r1++) for (let c1 = 0; c1 < MAP_W; c1++) {
    if (landId[r1][c1] !== comp) continue;
    for (let r2 = 0; r2 < MAP_H; r2++) for (let c2 = 0; c2 < MAP_W; c2++) {
      if (landId[r2][c2] !== mainComp) continue;
      const d = hexDist(c1, r1, c2, r2);
      if (d < bestDist) { bestDist = d; bestA = [c1, r1]; bestB = [c2, r2]; }
    }
  }
  if (!bestA) return;
  for (const [c, r] of hexLine(bestA[0], bestA[1], bestB[0], bestB[1])) {
    if (inBounds(c, r)) tiles[r][c].land = true;
  }
}

// wymusza port na lądzie `comp` przy akwenie `waterComp` — jeśli już tam jest
// port, nic nie robi; w przeciwnym razie stawia go na istniejącym mieście
// albo (w ostateczności) zamienia zwykłą przybrzeżną krawędź w nowe miasto-port
function forcePortNear(tiles, landId, waterId, comp, waterComp, names, rand) {
  let existingCity = null, anyCoast = null;
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      const t = tiles[r][c];
      if (landId[r][c] !== comp) continue;
      const touches = neighborCoords(c, r)
        .some(([nc, nr]) => inBounds(nc, nr) && !tiles[nr][nc].land && waterId[nr][nc] === waterComp);
      if (!touches) continue;
      if (t.city && t.city.port) return; // już połączone przez ten akwen
      if (t.city && !existingCity) existingCity = t;
      if (!t.city && !anyCoast) anyCoast = t;
    }
  }
  const target = existingCity || anyCoast;
  if (!target) return;
  if (!target.city) target.city = { name: names[irnd(names.length, rand)], capitalOf: -1, port: true, variant: irnd(3, rand), buildType: DEFAULT_UNIT_TYPE };
  else target.city.port = true;
}

function ensureCapitalConnectivity(tiles, playerCount, names, rand) {
  for (let pass = 0; pass < 8; pass++) {
    const { id: landId, sizes: landSizes } = floodFillComponents(tiles, t => t.land);
    const { id: waterId } = floodFillComponents(tiles, t => !t.land);

    const capitals = [];
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      const t = tiles[r][c];
      if (t.city && t.city.capitalOf >= 0) capitals.push({ c, r, comp: landId[r][c] });
    }
    if (capitals.length < 2) return;

    // "główny" ląd = ten z największą liczbą stolic (remis: większy obszarem)
    const capsPerComp = new Map();
    for (const cap of capitals) capsPerComp.set(cap.comp, (capsPerComp.get(cap.comp) || 0) + 1);
    let mainComp = capitals[0].comp;
    for (const comp of capsPerComp.keys()) {
      if (capsPerComp.get(comp) > capsPerComp.get(mainComp) ||
          (capsPerComp.get(comp) === capsPerComp.get(mainComp) && landSizes[comp] > landSizes[mainComp])) {
        mainComp = comp;
      }
    }

    const { depart, arrive } = buildPortGraph(tiles, landId, waterId);
    const broken = capitals.find(cap => cap.comp !== mainComp &&
      !(canReachLand(mainComp, cap.comp, depart, arrive) && canReachLand(cap.comp, mainComp, depart, arrive)));
    if (!broken) return;

    // 1) czy ten ląd dzieli jakikolwiek akwen z głównym lądem? wystarczy dodać porty
    const compWaters = new Set(), mainWaters = new Set();
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      if (!tiles[r][c].land) continue;
      const set = landId[r][c] === broken.comp ? compWaters : landId[r][c] === mainComp ? mainWaters : null;
      if (!set) continue;
      for (const [nc, nr] of neighborCoords(c, r)) {
        if (inBounds(nc, nr) && !tiles[nr][nc].land) set.add(waterId[nr][nc]);
      }
    }
    const shared = [...compWaters].find(w => mainWaters.has(w));
    if (shared != null) {
      forcePortNear(tiles, landId, waterId, broken.comp, shared, names, rand);
      forcePortNear(tiles, landId, waterId, mainComp, shared, names, rand);
    } else {
      // 2) zupełnie osobny akwen (np. odcięte jeziorko) — most lądowy to jedyna pewna naprawa
      carveLandBridge(tiles, landId, broken.comp, mainComp);
    }
    recomputePorts(tiles);
  }
}
