'use strict';
/* ============================================================
   GOSPODARKA — drogi do złóż surowców i produkcja siły w miastach
   ============================================================ */

// wytycza drogę złoże -> najbliższe własne miasto (BFS po lądzie);
// wołane raz przy KAŻDEJ zmianie właściciela złoża — trasa potem się nie zmienia,
// może tylko zostać przerwana, gdy wróg zajmie któryś z jej heksów
function establishRoad(t, playerId) {
  t.road = null;
  let best = null, bd = Infinity;
  for (const row of state.tiles) for (const c of row) {
    if (c.city && c.owner === playerId) {
      const d = hexDist(t.c, t.r, c.c, c.r);
      if (d < bd) { bd = d; best = c; }
    }
  }
  if (!best) return; // brak własnego miasta w zasięgu — złoże na zawsze bez zasilania
  const path = landPath(t, best);
  if (path && path.length > 1) t.road = { owner: playerId, city: best, path };
}

// droga aktywna = istnieje I żaden jej heks nie należy do wroga — pola niczyje
// (owner -1) NIE przerywają drogi, liczy się tylko realne zajęcie przez przeciwnika
function isRoadActive(t) {
  const rd = t.road;
  if (!rd || rd.owner !== t.owner) return false;
  return rd.path.every(p => p.owner === rd.owner || p.owner < 0);
}

// czy pole leży na aktywnej drodze danego gracza — jednostka na takim polu
// dostaje +1 do limitu ruchów w tej turze (patrz moveCap w combat.js)
function tileOnRoad(t, playerId) {
  for (const row of state.tiles) for (const res of row) {
    if (!res.resource || res.owner !== playerId || !isRoadActive(res)) continue;
    if (res.road.path.includes(t)) return true;
  }
  return false;
}

// własne złoża z AKTYWNĄ (niezerwaną) drogą do miasta — to ono dostaje +1 produkcji;
// trasa jest stała (ustalona przy zajęciu złoża), tu tylko sprawdzamy, czy nie jest przerwana
function resourceLinks(playerId) {
  const links = [];
  for (const row of state.tiles) for (const t of row) {
    if (!t.resource || t.owner !== playerId || !isRoadActive(t)) continue;
    links.push({ res: t, city: t.road.city });
  }
  return links;
}

function produce(playerId) {
  const bonus = new Map();
  for (const { city } of resourceLinks(playerId)) {
    bonus.set(city, (bonus.get(city) || 0) + 1);
  }
  for (const row of state.tiles) for (const t of row) {
    if (!t.city || t.owner !== playerId) continue;
    const gain = (t.city.capitalOf === playerId ? 3 : 1) + (bonus.get(t) || 0);
    if (t.army && t.army.player === playerId) {
      t.army.str = Math.min(MAX_ARMY, t.army.str + gain);
    } else if (!t.army) {
      t.army = { player: playerId, str: gain, vet: 0, movesUsed: Infinity };
    }
  }
}

// najkrótsza ścieżka po lądzie (BFS) — trasa drogi złoże -> miasto
function landPath(a, b) {
  const prev = new Map([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const t = queue.shift();
    if (t === b) {
      const path = [];
      for (let n = b; n; n = prev.get(n)) path.push(n);
      return path.reverse();
    }
    for (const n of neighborsOf(t)) {
      if (!n.land || prev.has(n)) continue;
      prev.set(n, t);
      queue.push(n);
    }
  }
  return null;
}
