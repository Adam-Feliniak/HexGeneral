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
// null, jeśli nie da się wytyczyć trasy przez własne terytorium albo taka
// droga już istnieje / już się buduje (przekierowanie z INNEGO miasta jest OK)
function roadCost(fromCityTile, target) {
  if (target === fromCityTile || target.owner !== fromCityTile.owner) return null;
  if (!target.resource && !target.city) return null;
  if (target.road && target.road.owner === fromCityTile.owner && target.road.city === fromCityTile) return null;
  const proj = fromCityTile.city.roadProject;
  if (proj && proj.target === target) return null;
  const path = landPath(target, fromCityTile, fromCityTile.owner);
  if (!path || path.length < 2) return null;
  return { path, cost: ROAD_BASE_COST + ROAD_COST_PER_TILE * path.length };
}

// wszystkie legalne cele budowy drogi z danego miasta (do podświetlenia na mapie) —
// jeden flood-fill po własnym terytorium zamiast BFS-a per pole; te same reguły
// odrzucania co roadCost (własne złoże/miasto, jeszcze niepodłączone tą drogą)
function roadTargets(fromCityTile) {
  const owner = fromCityTile.owner;
  const seen = new Set([fromCityTile]);
  const queue = [fromCityTile];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of neighborsOf(cur)) {
      if (!n.land || n.owner !== owner || seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  const proj = fromCityTile.city.roadProject;
  const targets = [];
  for (const t of seen) {
    if (t === fromCityTile || (!t.resource && !t.city)) continue;
    if (t.road && t.road.owner === owner && t.road.city === fromCityTile) continue;
    if (proj && proj.target === t) continue;
    targets.push(t);
  }
  return targets;
}

// rozpoczyna budowę drogi — od razu kładzie na polu celu drogę z licznikiem
// `built = 0` (ile heksów, licząc od strony miasta, jest już położonych); punkty
// produkcji miasta zaczną iść w ten projekt zamiast w jednostki i stopniowo
// zwiększać `built`, aż droga dojdzie do celu (patrz produce/completeRoadProject)
function startRoadProject(fromCityTile, target, playerId) {
  const info = roadCost(fromCityTile, target);
  if (!info) return false;
  target.road = { owner: playerId, city: fromCityTile, path: info.path, built: 0 };
  fromCityTile.city.roadProject = { target, cost: info.cost, progress: 0 };
  return true;
}

// przerywa budowę drogi — niedokończony odcinek znika (wydane punkty przepadają),
// ale tylko jeśli na polu celu wciąż stoi droga z TEGO projektu (nie ruszamy
// ewentualnej wcześniejszej, ukończonej drogi z innego miasta)
function cancelRoadProject(fromCityTile) {
  const proj = fromCityTile.city.roadProject;
  if (proj && proj.target.road && proj.target.road.city === fromCityTile) proj.target.road = null;
  fromCityTile.city.roadProject = null;
}

// odcinek drogi już położony — liczony od strony miasta (koniec tablicy path,
// bo landPath zwraca ją jako [cel, ..., miasto]); w budowie droga rośnie z miasta
function roadBuiltPath(rd) {
  return rd.path.slice(rd.path.length - rd.built);
}

// czy dany odcinek trasy jest przejezdny: każdy heks należy do właściciela albo
// jest niczyj (owner < 0) — realne zajęcie przez wroga przerywa drogę
function segmentClear(path, owner) {
  return path.every(p => p.owner === owner || p.owner < 0);
}

// kończy projekt drogi: droga na polu celu jest już położona przyrostowo, więc tu
// tylko domykamy `built` do pełnej długości. Jeśli cel został w międzyczasie
// stracony (np. wróg zajął złoże), budowa przepada — punkty też, zgodnie z zasadą
// "porzucony/nadwyżkowy projekt nie wraca"
function completeRoadProject(fromCityTile, playerId) {
  const target = fromCityTile.city.roadProject.target;
  fromCityTile.city.roadProject = null;
  fromCityTile.city.buildType = DEFAULT_UNIT_TYPE;
  const rd = target.road;
  if (target.owner !== playerId || !rd || rd.city !== fromCityTile) {
    addLog(i18n.t('log.roadFailed', { city: fromCityTile.city.name }));
    return;
  }
  rd.built = rd.path.length;
  addLog(i18n.t('log.roadComplete', { city: fromCityTile.city.name }));
  showBanner(i18n.t('banner.roadComplete', { city: fromCityTile.city.name }));
}

// droga aktywna (dla bonusu produkcji złoża) = w PEŁNI zbudowana i żaden jej heks
// nie należy do wroga — pola niczyje (owner < 0) NIE przerywają drogi
function isRoadActive(t) {
  const rd = t.road;
  if (!rd || rd.owner !== t.owner || rd.built < rd.path.length) return false;
  return segmentClear(rd.path, rd.owner);
}

// czy pole leży na przejezdnym, JUŻ POŁOŻONYM odcinku drogi danego gracza — także
// częściowo zbudowanej (bonus ruchu obejmuje ukończony fragment, patrz moveCap
// w combat.js); przecięcie odcinka przez wroga odbiera bonus na całej drodze
function tileOnRoad(t, playerId) {
  for (const row of state.tiles) for (const cand of row) {
    if (cand.owner !== playerId || !cand.road) continue;
    const built = roadBuiltPath(cand.road);
    if (built.includes(t) && segmentClear(built, playerId)) return true;
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
      const proj = t.city.roadProject;
      proj.progress += gain;
      // droga rośnie proporcjonalnie do wydanych punktów, zaokrąglając w dół liczbę
      // położonych heksów; nadwyżka ponad koszt w turze ukończenia przepada
      const rd = proj.target.road;
      if (rd) rd.built = Math.min(rd.path.length, Math.floor(proj.progress / proj.cost * rd.path.length));
      if (proj.progress >= proj.cost) completeRoadProject(t, playerId);
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
