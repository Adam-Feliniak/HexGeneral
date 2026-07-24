'use strict';
/* ============================================================
   GOSPODARKA — drogi budowane przez gracza/AI i produkcja siły w miastach
   ============================================================ */

// najkrótsza ścieżka (BFS) prowadząca WYŁĄCZNIE przez własne terytorium gracza —
// droga nie może biec przez ziemię niczyją ani wroga, więc żeby połączyć odległe
// pole, trzeba najpierw zdobyć teren po drodze
function landPath(a, b, playerId) {
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
      if (!n.land || n.owner !== playerId || prev.has(n)) continue;
      prev.set(n, t);
      queue.push(n);
    }
  }
  return null;
}

// koszt budowy drogi z miasta do celu (własne złoże albo własne miasto) —
// null, jeśli nie da się wytyczyć trasy przez własne terytorium
function roadCost(fromCityTile, target) {
  if (target === fromCityTile || target.owner !== fromCityTile.owner) return null;
  if (!target.resource && !target.city) return null;
  const path = landPath(target, fromCityTile, fromCityTile.owner);
  if (!path || path.length < 2) return null;
  return { path, cost: ROAD_BASE_COST + ROAD_COST_PER_TILE * path.length };
}

// rozpoczyna budowę drogi — punkty produkcji miasta zaczną iść w projekt
// zamiast w jednostki, dopóki się nie ukończy albo nie zostanie zmieniony
function startRoadProject(fromCityTile, target, playerId) {
  const info = roadCost(fromCityTile, target);
  if (!info) return false;
  fromCityTile.city.roadProject = { target, cost: info.cost, progress: 0 };
  return true;
}

// kończy projekt drogi: ustanawia (lub nadpisuje) drogę na polu docelowym —
// trasa liczona na nowo na wypadek zmian własności terenu w trakcie budowy;
// jeśli w międzyczasie gracz stracił kawałek terytorium na trasie, budowa
// przepada (punkty też, zgodnie z zasadą "nadwyżka/porzucony projekt nie wraca")
function completeRoadProject(fromCityTile, playerId) {
  const proj = fromCityTile.city.roadProject;
  const path = landPath(proj.target, fromCityTile, playerId);
  fromCityTile.city.roadProject = null;
  fromCityTile.city.buildType = DEFAULT_UNIT_TYPE;
  if (!path || path.length < 2) {
    addLog(i18n.t('log.roadFailed', { city: fromCityTile.city.name }));
    return;
  }
  proj.target.road = { owner: playerId, city: fromCityTile, path };
  addLog(i18n.t('log.roadComplete', { city: fromCityTile.city.name }));
  showBanner(i18n.t('banner.roadComplete', { city: fromCityTile.city.name }));
}

// droga aktywna = istnieje I żaden jej heks nie należy do wroga — pola niczyje
// (owner -1) NIE przerywają drogi, liczy się tylko realne zajęcie przez przeciwnika;
// dotyczy zarówno dróg do złóż, jak i ogólnych dróg miasto-miasto (ten sam kształt)
function isRoadActive(t) {
  const rd = t.road;
  if (!rd || rd.owner !== t.owner) return false;
  return rd.path.every(p => p.owner === rd.owner || p.owner < 0);
}

// czy pole leży na aktywnej drodze danego gracza (złoże->miasto albo miasto->miasto)
// — jednostka na takim polu ma większy zasięg ruchu w tej turze (patrz moveCap w combat.js)
function tileOnRoad(t, playerId) {
  for (const row of state.tiles) for (const cand of row) {
    if (cand.owner !== playerId || !cand.road) continue;
    if (isRoadActive(cand) && cand.road.path.includes(t)) return true;
  }
  return false;
}

// własne złoża z AKTYWNĄ (niezerwaną) drogą do miasta — to ono dostaje +1 produkcji
function resourceLinks(playerId) {
  const links = [];
  for (const row of state.tiles) for (const t of row) {
    if (!t.resource || t.owner !== playerId || !isRoadActive(t)) continue;
    links.push({ res: t, city: t.road.city });
  }
  return links;
}

function produce(playerId) {
  const p = state.players[playerId];
  const diff = p.isHuman ? null : resolveDifficulty(p.difficulty);
  const mult = diff ? diff.economy : 1;

  const bonus = new Map();
  for (const { city } of resourceLinks(playerId)) {
    bonus.set(city, (bonus.get(city) || 0) + 1);
  }
  for (const row of state.tiles) for (const t of row) {
    if (!t.city || t.owner !== playerId) continue;
    if (!p.isHuman) aiAssignCityProject(t, playerId);
    const base = (t.city.capitalOf === playerId ? 3 : 1) + (bonus.get(t) || 0);
    const gain = Math.max(1, Math.round(base * mult));
    if (t.city.roadProject) {
      // nadwyżka punktów ponad koszt w turze ukończenia przepada (nie przechodzi dalej)
      t.city.roadProject.progress += gain;
      if (t.city.roadProject.progress >= t.city.roadProject.cost) completeRoadProject(t, playerId);
      continue;
    }
    const buildType = t.city.buildType || DEFAULT_UNIT_TYPE;
    if (t.army && t.army.player === playerId) {
      // garnizon innego typu niż wybrany do budowy — produkcja tej tury przepada
      // (jedno pole = jedna armia, bez kolejkowania; gracz/AI może zmienić buildType)
      if (t.army.type === buildType) t.army.str = Math.min(MAX_ARMY, t.army.str + gain);
    } else if (!t.army) {
      t.army = { player: playerId, str: gain, vet: 0, movesUsed: Infinity, type: buildType };
    }
  }
}
