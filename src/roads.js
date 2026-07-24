'use strict';
/* ============================================================
   GOSPODARKA — sieć dróg budowana przez gracza/AI i produkcja siły w miastach

   Model: droga to zbiór sąsiadujących HEKSÓW (`tile.road = { owner }`), nie jeden
   obiekt z pełną trasą. Dzięki temu drogi z różnych miast do wspólnych pól tworzą
   naturalną sieć ze wspólnymi odcinkami (rozgałęzienia). Budowa dokłada tylko
   brakujące heksy (`roadProject.segment`), a złoże w sieci daje +1 produkcji do
   jednego, wybieranego przez gracza miasta (`resourceTile.supplyCity`).
   ============================================================ */

// najtańsze połączenie celu z miastem po WŁASNYM terytorium: wejście na istniejący
// heks drogi kosztuje 0 (sieć się współdzieli), na zwykłe własne pole 1 (nowy heks).
// BFS 0/1 (deque) — zwraca pełną ścieżkę [cel, ..., miasto] minimalizującą liczbę
// nowych heksów, albo null jeśli nie da się połączyć przez własny teren
function roadDijkstra(target, fromCityTile, playerId) {
  const dist = new Map([[target, 0]]);
  const prev = new Map([[target, null]]);
  const deque = [target];
  while (deque.length) {
    const t = deque.shift();
    if (t === fromCityTile) break;
    for (const n of neighborsOf(t)) {
      if (!n.land || n.owner !== playerId) continue;
      const w = n.road ? 0 : 1;               // istniejący heks drogi jest darmowy
      const nd = dist.get(t) + w;
      if (dist.has(n) && nd >= dist.get(n)) continue;
      dist.set(n, nd);
      prev.set(n, t);
      if (w === 0) deque.unshift(n); else deque.push(n);
    }
  }
  if (!prev.has(fromCityTile)) return null;
  const path = [];
  for (let n = fromCityTile; n; n = prev.get(n)) path.push(n);
  return path.reverse(); // [cel, ..., miasto]
}

// koszt i plan budowy drogi z miasta do celu (własne złoże/miasto) — zwraca
// { path, segment, cost }, gdzie segment = tylko NOWE heksy do położenia (od strony
// miasta ku celowi). null, gdy celu nie da się połączyć albo już jest w tej samej sieci
function roadCost(fromCityTile, target) {
  if (target === fromCityTile || target.owner !== fromCityTile.owner) return null;
  if (!target.resource && !target.city) return null;
  const path = roadDijkstra(target, fromCityTile, fromCityTile.owner);
  if (!path) return null;
  // segment budujemy od strony miasta na zewnątrz (żeby rósł spójnie z siecią)
  const segment = path.slice().reverse().filter(t => !t.road);
  if (!segment.length) return null; // cel już połączony z siecią tego miasta
  return { path, segment, cost: ROAD_BASE_COST + ROAD_COST_PER_TILE * segment.length };
}

// zbiór heksów drogi osiągalnych z miast gracza (aktywna sieć) — flood-fill po
// własnych heksach drogi startując z pól miast; służy do bonusu produkcji
function roadNetwork(playerId) {
  const net = new Set();
  const queue = [];
  for (const row of state.tiles) for (const t of row) {
    if (t.city && t.owner === playerId) queue.push(t);
  }
  const seen = new Set(queue);
  while (queue.length) {
    const t = queue.shift();
    for (const n of neighborsOf(t)) {
      if (seen.has(n) || n.owner !== playerId || !n.road) continue;
      seen.add(n); net.add(n); queue.push(n);
    }
  }
  return net;
}

// miasta gracza połączone siecią dróg z danym polem (np. złożem) — do wyboru
// miasta zaopatrywanego; przechodzi po własnych heksach drogi, kończy na miastach
function connectedCities(fromTile, playerId) {
  const cities = [];
  const seen = new Set([fromTile]);
  const queue = [fromTile];
  while (queue.length) {
    const t = queue.shift();
    for (const n of neighborsOf(t)) {
      if (seen.has(n) || n.owner !== playerId) continue;
      if (n.city) { seen.add(n); cities.push(n); continue; } // miasto = koniec gałęzi
      if (!n.road) continue;
      seen.add(n); queue.push(n);
    }
  }
  return cities;
}

// miasto, do którego trafia +1 z danego złoża: wybór gracza jeśli nadal połączony,
// inaczej najbliższe połączone miasto (domyślne, zero-klikowe)
function supplyCityFor(resTile, playerId) {
  const cities = connectedCities(resTile, playerId);
  if (!cities.length) return null;
  if (resTile.supplyCity && cities.includes(resTile.supplyCity)) return resTile.supplyCity;
  let best = cities[0], bd = Infinity;
  for (const c of cities) {
    const d = hexDist(resTile.c, resTile.r, c.c, c.r);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// wszystkie legalne cele budowy drogi z danego miasta (do podświetlenia na mapie):
// własne złoże/miasto osiągalne po lądzie, którego jeszcze nie ma w sieci tego miasta
// (czyli budowa dołożyłaby ≥1 heks). Dwa flood-fille zamiast BFS-a per pole
function roadTargets(fromCityTile) {
  const owner = fromCityTile.owner;
  // 1) zasięg po własnym terytorium (kandydaci)
  const reach = new Set([fromCityTile]);
  let q = [fromCityTile];
  while (q.length) {
    const cur = q.shift();
    for (const n of neighborsOf(cur)) {
      if (!n.land || n.owner !== owner || reach.has(n)) continue;
      reach.add(n); q.push(n);
    }
  }
  // 2) komponent sieci tego miasta (cele już połączone — pomijamy)
  const comp = new Set([fromCityTile]);
  q = [fromCityTile];
  while (q.length) {
    const cur = q.shift();
    for (const n of neighborsOf(cur)) {
      if (comp.has(n) || n.owner !== owner || !n.road) continue;
      comp.add(n); q.push(n);
    }
  }
  const targets = [];
  for (const t of reach) {
    if (t === fromCityTile || (!t.resource && !t.city) || comp.has(t)) continue;
    targets.push(t);
  }
  return targets;
}

// rozpoczyna budowę drogi — projekt trzyma listę nowych heksów (segment) kładzionych
// przyrostowo w produce(); heksy pojawiają się dopiero w miarę wydawania punktów
function startRoadProject(fromCityTile, target, playerId) {
  const info = roadCost(fromCityTile, target);
  if (!info) return false;
  fromCityTile.city.roadProject = { target, segment: info.segment, cost: info.cost, progress: 0, built: 0 };
  return true;
}

// przerywa budowę — już położone heksy ZOSTAJĄ jako część sieci (realna
// infrastruktura), kasujemy tylko projekt
function cancelRoadProject(fromCityTile) {
  fromCityTile.city.roadProject = null;
}

// domyka projekt: ostatnie heksy segmentu są już położone, więc tylko sprzątamy
function completeRoadProject(fromCityTile) {
  fromCityTile.city.roadProject = null;
  fromCityTile.city.buildType = DEFAULT_UNIT_TYPE;
  addLog(i18n.t('log.roadComplete', { city: fromCityTile.city.name }));
  showBanner(i18n.t('banner.roadComplete', { city: fromCityTile.city.name }));
}

// budowa nie może być dokończona (wróg zajął pole na trasie) — położone heksy
// zostają w sieci, projekt i wydane punkty przepadają
function failRoadProject(fromCityTile) {
  fromCityTile.city.roadProject = null;
  fromCityTile.city.buildType = DEFAULT_UNIT_TYPE;
  addLog(i18n.t('log.roadFailed', { city: fromCityTile.city.name }));
}

// czy pole daje bonus ruchu — dowolny własny heks drogi (patrz moveCap w combat.js)
function tileOnRoad(t, playerId) {
  return !!(t.road && t.road.owner === playerId && t.owner === playerId);
}

function produce(playerId) {
  const p = state.players[playerId];
  const diff = p.isHuman ? null : resolveDifficulty(p.difficulty);
  const mult = diff ? diff.economy : 1;

  // każde własne złoże połączone z siecią daje +1 do jednego (wybranego lub najbliższego)
  // miasta; jedno złoże = jeden bonus, wiele dróg go nie zwielokrotnia
  const bonus = new Map();
  for (const row of state.tiles) for (const t of row) {
    if (!t.resource || t.owner !== playerId || !t.road) continue;
    const city = supplyCityFor(t, playerId);
    if (city) bonus.set(city, (bonus.get(city) || 0) + 1);
  }

  for (const row of state.tiles) for (const t of row) {
    if (!t.city || t.owner !== playerId) continue;
    if (!p.isHuman) aiAssignCityProject(t, playerId);
    const base = (t.city.capitalOf === playerId ? 3 : 1) + (bonus.get(t) || 0);
    const gain = Math.max(1, Math.round(base * mult));
    if (t.city.roadProject) {
      const proj = t.city.roadProject;
      proj.progress += gain;
      // droga rośnie proporcjonalnie do wydanych punktów, zaokrąglając w dół; nowo
      // odsłonięte heksy segmentu stają się częścią sieci
      const want = Math.min(proj.segment.length, Math.floor(proj.progress / proj.cost * proj.segment.length));
      let lost = false;
      for (; proj.built < want; proj.built++) {
        const seg = proj.segment[proj.built];
        // pole utracone na rzecz wroga w trakcie budowy — dalej się nie da
        if (seg.owner !== playerId) { lost = true; break; }
        seg.road = { owner: playerId };
      }
      if (lost) failRoadProject(t);
      else if (proj.progress >= proj.cost) completeRoadProject(t);
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
