'use strict';
/* ============================================================
   RUCH I WALKA — morale, siła bojowa, rozstrzyganie bitew
   ============================================================ */

// cache list własnych miast per gracz (Map<playerId, pola[]>), aktywny wyłącznie
// na czas oceny ruchów w aiPickMove (która niczego nie mutuje, więc lista jest
// stała) — moraleAt jest tam wołane setki razy na turę i pełny skan planszy przy
// każdym wywołaniu dominował koszt AI. Poza AI (render, tooltipy, resolveBattle)
// cache jest nieaktywny (null) i moraleAt skanuje planszę jak dotąd.
let moraleCityCache = null;

function moraleCityList(playerId) {
  let list = moraleCityCache.get(playerId);
  if (!list) {
    list = [];
    for (const row of state.tiles) for (const o of row) {
      if (o.city && o.owner === playerId) list.push(o);
    }
    moraleCityCache.set(playerId, list);
  }
  return list;
}

function moraleAt(playerId, t) {
  // morale zależy od odległości do najbliższego własnego miasta —
  // podbijanie miast przesuwa front morale do przodu
  let d = Infinity;
  if (moraleCityCache) {
    for (const o of moraleCityList(playerId)) {
      const dd = hexDist(t.c, t.r, o.c, o.r);
      if (dd < d) d = dd;
    }
  } else {
    for (const row of state.tiles) for (const o of row) {
      if (o.city && o.owner === playerId) {
        const dd = hexDist(t.c, t.r, o.c, o.r);
        if (dd < d) d = dd;
      }
    }
  }
  if (!isFinite(d)) d = 8;
  let m = 100 - 7 * d;
  m = Math.max(40, m);
  if (t.city && t.owner === playerId) m += 5;
  if (!t.land) m -= 15;
  return Math.max(25, Math.min(100, m));
}

function armyPowerAt(army, t, role) {
  const m = Math.min(110, moraleAt(army.player, t) + army.vet);
  const typeMult = UNIT_TYPES[army.type][role === 'attack' ? 'atk' : 'def'];
  return army.str * m / 100 * typeMult;
}

// blokada wejścia na pole z własną armią: pełny stos (>=MAX_ARMY) albo inny typ —
// różne typy nie łączą się, więc pole zajęte przez inny typ jest dla nas nieprzejezdne
function blockedByFriendly(to, playerId, unitType) {
  return !!(to.army && to.army.player === playerId &&
    (to.army.str >= MAX_ARMY || to.army.type !== unitType));
}

function canStep(from, to, playerId, unitType) {
  if (!to) return false;
  if (hexDist(from.c, from.r, to.c, to.r) !== 1) return false;
  if (to.land) {
    return !blockedByFriendly(to, playerId, unitType);
  }
  // wejście na morze: z morza albo z portu
  const fromSea = !from.land;
  const fromPort = !!(from.city && from.city.port && from.owner === playerId);
  if (!fromSea && !fromPort) return false;
  return !blockedByFriendly(to, playerId, unitType);
}

// pełna pula punktów ruchu jednostki stojącej na tym polu — na morzu typ nie ma
// znaczenia (patrz SEA_MOVE_POINTS w config.js)
function maxMovePoints(t) {
  if (!t.army) return 0;
  return t.land ? UNIT_TYPES[t.army.type].mp : SEA_MOVE_POINTS;
}

// czy przejście between polami zmienia środowisko (załadunek na statek albo desant)
function isEmbarkStep(from, to) {
  return !!from.land !== !!to.land;
}

// koszt wejścia z `from` na `to`. Przejście ląd<->woda zżera CAŁĄ pozostałą pulę,
// dlatego zwracamy Infinity — wywołujący traktuje je jako krok kończący ruch
// (patrz reachableMoves: takie pole jest terminalne). Legalność przejścia rozstrzyga
// canStep (na wodę tylko z morza albo własnego portu), tu liczy się wyłącznie koszt.
function moveCostStep(from, to, playerId) {
  if (isEmbarkStep(from, to)) return Infinity;
  return tileOnRoad(to, playerId) ? MOVE_COST_ROAD : MOVE_COST_DEFAULT;
}

// Dwa poziomy, bo pula aktywacji ma dwóch właścicieli: człowiek wydaje
// state.activationsLeft, a AI prowadzi własny licznik w rekurencji aiStep().
//
// poziom jednostki — czy ma jeszcze punkty ruchu. Nie sprawdza realnej dostępności
// pól: armia otoczona ze wszystkich stron nadal liczy się jako zdolna do ruchu, bo
// wymagałoby to validMoves() dla każdej armii przy każdym odświeżeniu UI
function armyCanMove(t) {
  return !!t.army && t.army.mp > 0;
}

// poziom gracza-człowieka — czy tę armię wolno teraz rozkazać. Już aktywowana
// jednostka nie potrzebuje kolejnej aktywacji, dopóki ma punkty ruchu
function armyCanBeOrdered(t) {
  return armyCanMove(t) && (t.army.activated || state.activationsLeft > 0);
}

// czy gracz ma jeszcze jakąkolwiek jednostkę do rozkazania w tej turze —
// podpowiedź „tura czeka na gracza" (ui.js)
function hasMovableArmy(playerId) {
  for (const row of state.tiles) for (const t of row) {
    if (t.army && t.army.player === playerId && armyCanBeOrdered(t)) return true;
  }
  return false;
}

// pola osiągalne w tej turze (Map<pole, poprzednie pole na trasie>, bez pola
// startowego) — wartością jest wskaźnik na poprzednika (trasa odtwarzana wstecz
// tylko dla faktycznie wykonywanego ruchu w executeMove, zamiast kopiowania tablicy
// ścieżki dla każdego osiągalnego pola). Pole pośrednie musi być puste (starcie albo
// połączenie armii zawsze kończy ruch, więc nie da się "przeskoczyć" przez zajęty
// hex) — jedynie ostatnie pole na trasie może mieć armię: wroga (walka) albo
// własną (połączenie)
function reachableMoves(t) {
  if (!t.army) return new Map();
  const playerId = t.army.player, unitType = t.army.type;
  const full = maxMovePoints(t);
  const prev = new Map([[t, null]]);
  const left = new Map([[t, t.army.mp]]); // ile MP zostaje po dotarciu na pole
  const queue = [t];
  while (queue.length) {
    // zawsze rozwijamy pole z największym zapasem MP (Dijkstra na maksimum);
    // pól jest MAP_W*MAP_H, więc liniowe szukanie maksimum jest tańsze niż kopiec
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (left.get(queue[i]) > left.get(queue[bi])) bi = i;
    const cur = queue.splice(bi, 1)[0];
    const mpLeft = left.get(cur);
    // 0 MP = koniec marszu; po przejściu ląd<->woda zawsze tu trafiamy, co samo
    // czyni desant/załadunek krokiem terminalnym (bez osobnego znacznika)
    if (mpLeft <= 0) continue;
    // armia na polu pośrednim kończy ruch (starcie albo połączenie) — nie rozwijamy
    if (cur !== t && cur.army) continue;
    for (const n of neighborsOf(cur)) {
      if (!canStep(cur, n, playerId, unitType)) continue;
      let nextMp;
      if (isEmbarkStep(cur, n)) {
        nextMp = 0; // zżera całą pulę, ale wystarczy 1 MP, żeby wykonać przejście
      } else {
        const cost = moveCostStep(cur, n, playerId);
        // pełna pula zawsze pozwala wejść na jedno pole, choćby koszt ją przekraczał
        // (rezerwa pod przyszły drogi teren o koszcie > mp piechoty)
        if (cost > mpLeft && !(cur === t && mpLeft >= full)) continue;
        nextMp = Math.max(0, mpLeft - cost);
      }
      if (left.has(n) && left.get(n) >= nextMp) continue;
      left.set(n, nextMp);
      prev.set(n, cur);
      queue.push(n);
    }
  }
  prev.delete(t);
  return prev;
}

function validMoves(t) {
  return [...reachableMoves(t).keys()];
}

function supportFor(playerId, battleTile, excludeTile) {
  let s = 0;
  for (const n of neighborsOf(battleTile)) {
    if (n === excludeTile) continue;
    if (n.army && n.army.player === playerId) s += n.army.str * UNIT_TYPES[n.army.type].supportWeight;
  }
  return s;
}

function resolveBattle(from, to) {
  const att = from.army, def = to.army;
  let aPow = armyPowerAt(att, to, 'attack') + 0.12 * supportFor(att.player, to, from);
  let dPow = armyPowerAt(def, to, 'defense') + 0.12 * supportFor(def.player, to, null);
  if (to.city) dPow *= (to.city.capitalOf >= 0 ? 1.25 : 1.15);
  aPow *= rnd(0.92, 1.08);
  dPow *= rnd(0.92, 1.08);

  const c = hexCenter(to.c, to.r);
  effects.push({ x: c.x, y: c.y, t: 0 });
  if (aPow > dPow) {
    const loss = Math.min(att.str - 1, Math.round(att.str * 0.75 * (dPow / aPow)));
    att.str -= loss;
    att.vet = Math.min(15, att.vet + 4);
    floaters.push({ x: c.x, y: c.y, text: `-${def.str}`, color: '#ff7b7b', t: 0 });
    addLog(i18n.t('log.battleWon', { winner: state.players[att.player].name, defStr: def.str, loss }));
    to.army = null;
    return true;
  } else {
    const loss = Math.min(def.str - 1, Math.round(def.str * 0.75 * (aPow / dPow)));
    def.str -= loss;
    def.vet = Math.min(15, def.vet + 4);
    floaters.push({ x: c.x, y: c.y, text: `-${att.str}`, color: '#ffd27b', t: 0 });
    addLog(i18n.t('log.battleLost', { attacker: state.players[att.player].name, attStr: att.str, loss }));
    from.army = null;
    return false;
  }
}

// wykonuje ruch armii na pole `to` (zakłada, że jest w reachableMoves(from)).
// Zwraca liczbę ZUŻYTYCH AKTYWACJI: 1, gdy armia rusza się w tej turze pierwszy raz,
// 0 przy kolejnym ruchu tej samej armii — tyle kosztuje to w puli tury
// (state.activationsLeft u człowieka, lokalny licznik w aiStep u bota).
// Punkty ruchu armii spina sama ta funkcja.
function executeMove(from, to) {
  // odtworzenie trasy ze wskaźników poprzedników (patrz reachableMoves); dla pola
  // spoza zasięgu pętla urywa się od razu i zostaje [to] — jak dawny fallback
  const seen = reachableMoves(from);
  const path = [];
  for (let cur = to; cur && cur !== from; cur = seen.get(cur)) path.push(cur);
  path.reverse();
  if (!path.length) path.push(to);
  const army = from.army;
  const usedActivation = army.activated ? 0 : 1;
  army.activated = true;
  // koszt liczony po faktycznej trasie; przejście ląd<->woda zeruje pulę (może być
  // tylko ostatnim krokiem, patrz reachableMoves, ale liczymy ogólnie)
  let mp = army.mp;
  let at = from;
  for (const step of path) {
    mp = isEmbarkStep(at, step) ? 0 : Math.max(0, mp - moveCostStep(at, step, army.player));
    at = step;
  }
  army.mp = mp;
  // pola pośrednie na trasie są zawsze puste (patrz reachableMoves) — armia
  // przechodząca przez nie zajmuje je tak samo jak dawny ruch krok-po-kroku
  for (const step of path.slice(0, -1)) captureTile(step, army.player);

  if (to.army && to.army.player !== army.player) {
    const won = resolveBattle(from, to);
    // armia atakująca zniszczona — aktywacja i tak zużyta
    if (!won) { updateUI(); return usedActivation; }
  }
  if (to.army && to.army.player === army.player) {
    // łączenie armii — zawsze tego samego typu, bo canStep blokuje wejście
    // na pole z własną armią innego typu (nie ma tu więc czego sprawdzać)
    to.army.str = Math.min(MAX_ARMY, to.army.str + army.str);
    to.army.vet = Math.max(to.army.vet, army.vet);
    // scalona armia kończy turę: bez tego dostałaby ruch "za darmo" cudzymi punktami
    to.army.mp = 0;
    to.army.activated = true;
    from.army = null;
  } else {
    from.army = null;
    to.army = army;
    captureTile(to, army.player);
  }
  const a = hexCenter(from.c, from.r), b = hexCenter(to.c, to.r);
  anims.push({ tile: to, x0: a.x, y0: a.y, x1: b.x, y1: b.y, t: 0 });
  updateUI();
  return usedActivation;
}
