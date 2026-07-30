'use strict';
/* ============================================================
   STAN GRY — dane rozgrywki, nowa gra, dostęp do planszy, log
   ============================================================ */

let state = null;
let anims = [];        // animacje ruchu armii
let floaters = [];     // napisy unoszące się nad polem bitwy
let effects = [];      // eksplozje na polach bitew
let hoverTile = null;
let lastFrame = 0;

/* ------------------- sloty graczy (obsada + drużyna) -------------------
   Jedno źródło prawdy o składzie partii: lista slotów z lobby. Boss NIE jest osobnym
   trybem, tylko wartością `kind` slotu — dzięki temu ten sam mechanizm obsługuje FFA,
   co-op przeciw botom, 2v2 i tryb bossa (patrz renderMpSetup w menu.js).
   `skin` to indeks zestawu sprite'ów/barw z PLAYERS_DEF i służy WYŁĄCZNIE grafice —
   tożsamość gracza to zawsze `id` (owner, army.player, city.capitalOf). Rozjazd bierze
   się stąd, że zamknięty slot nie tworzy imperium, więc id są ciągłe, a skiny nie. */

function slotsFromCounts(humanCount, botCount) {
  const total = Math.max(2, Math.min(MAX_PLAYERS, Math.max(0, humanCount) + Math.max(0, botCount)));
  const humans = Math.min(Math.max(0, humanCount), total);
  const slots = [];
  // każdy w osobnej drużynie = FFA, czyli dokładne zachowanie sprzed drużyn;
  // difficulty null = wspólna trudność gry (tak działały humanCount/botCount od zawsze)
  for (let i = 0; i < total; i++) {
    slots.push({ kind: i < humans ? 'human' : 'bot', team: i, skin: i, difficulty: null });
  }
  return slots;
}

// Trudność „gry" przy trudnościach per slot: najczęstsza wśród botów. Nie steruje już
// rozgrywką (tę wyznacza player.difficulty), ale zostaje jako wartość domyślna dla
// imperium, które dopiero przechodzi pod AI (switchHuman w input.js)
function dominantDifficulty(slots, fallback) {
  const counts = new Map();
  for (const s of slots) {
    if (s.kind === 'human' || s.difficulty == null) continue;
    counts.set(s.difficulty, (counts.get(s.difficulty) || 0) + 1);
  }
  let best = fallback, bestN = 0;
  for (const [diff, n] of counts) if (n > bestN) { bestN = n; best = diff; }
  return best;
}

function normalizeSlots(raw) {
  const open = [];
  (raw || []).forEach((s, i) => {
    if (!s || s.kind === 'closed' || open.length >= MAX_PLAYERS) return;
    const kind = (s.kind === 'human' || s.kind === 'boss') ? s.kind : 'bot';
    open.push({
      kind,
      team: Number.isFinite(s.team) ? s.team : i,
      skin: kind === 'boss' ? BOSS_SKIN : (Number.isFinite(s.skin) ? s.skin : i),
      // trudność jest per slot; brak wartości (harnessy, stare wywołania) oznacza
      // „weź wspólną trudność gry" — rozstrzyga to newGame
      difficulty: s.difficulty !== undefined ? s.difficulty : null,
    });
  });
  // partia z jednym imperium albo jedną drużyną nie miałaby warunku końca — lobby
  // tego nie dopuszcza, ale import/harness mógłby, więc awaryjnie rozbijamy na FFA
  if (open.length < 2) return slotsFromCounts(1, 1);
  if (new Set(open.map(s => s.team)).size < 2) open.forEach((s, i) => { s.team = i; });
  return open;
}

// Rozstawienie na mapie: pozycja stolicy wynika z `id` (`CAPITAL_SPOTS[id]`), więc to
// kolejność slotów decyduje, kto z kim sąsiaduje. W FFA zostaje dokładnie dzisiejsza
// (maksymalny rozrzut), ale przy realnym sojuszu byłaby sabotażem — dwoje ludzi z jednej
// drużyny startowałoby w przeciwległych rogach, więc nie mogliby ani się wspierać, ani
// wspólnie planować, a `moraleAt` (liczone od WŁASNYCH miast) karałoby marsz ku sojusznikowi.
// Dlatego przy drużynach sloty rozdajemy wzdłuż obwodu mapy, drużyna po drużynie: każda
// dostaje spójny łuk sąsiadujących pozycji. Zbiór użytych pozycji się nie zmienia, więc
// mapa (generateMap) jest identyczna
function assignTeamPositions(slots) {
  const allied = slots.some((s, i) => slots.some((o, j) => j !== i && o.team === s.team));
  if (!allied) return slots;
  const n = slots.length;
  const dist = [];
  for (let i = 0; i < n; i++) {
    dist.push([]);
    for (let j = 0; j < n; j++) {
      const [ac, ar] = CAPITAL_SPOTS[i], [bc, br] = CAPITAL_SPOTS[j];
      dist[i].push(hexDist(ac, ar, bc, br));
    }
  }
  // Szukamy przypisania minimalizującego sumę dystansów WEWNĄTRZ drużyn. Suma po
  // wszystkich parach pozycji jest stała, więc zbliżenie sojuszników automatycznie
  // oddala wrogów — jedno kryterium wystarcza. Liczymy przeglądem zupełnym, bo
  // pozycji jest najwyżej MAX_PLAYERS (720 permutacji, raz na partię); ręcznie
  // wpisana kolejność byłaby wróżeniem z proporcji mapy (23×14: rogi w tym samym
  // rzędzie dzieli 18 pól, a w tej samej kolumnie 9), a rozmiary i kształty map
  // są w planach
  const cur = new Array(n), used = new Array(n).fill(false);
  let best = null, bestCost = Infinity;
  const walk = (k, cost) => {
    if (cost >= bestCost) return; // gałąź już gorsza od najlepszej — nie ma po co schodzić
    if (k === n) { bestCost = cost; best = cur.slice(); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      let add = 0;
      for (let j = 0; j < k; j++) if (cur[j].team === slots[i].team) add += dist[j][k];
      used[i] = true; cur[k] = slots[i];
      walk(k + 1, cost + add);
      used[i] = false;
    }
  };
  walk(0, 0);
  return best || slots;
}

// Czy to imperium jest bossem. Boss różni się od zwykłego bota nie tylko liczbami
// (BOSS_MULT w config.js), ale DWIEMA REGUŁAMI, których nie ma nikt inny:
// morale bez kary za dystans (combat.js/moraleAt) i ruch po własnym terytorium
// w cenie drogi (combat.js/moveCostStep). Patrz Documents/06-Sztuczna-inteligencja.md
function isBossPlayer(playerId) {
  const p = state.players[playerId];
  return !!p && p.kind === 'boss';
}

// czy dwa imperia grają po tej samej stronie (to samo imperium też "jest sojusznikiem")
function sameTeam(aId, bId) {
  if (aId === bId) return true;
  const a = state.players[aId], b = state.players[bId];
  return !!a && !!b && a.team === b.team;
}

// czy drużyna tego gracza jeszcze żyje (choćby przez sojusznika) — warunek porażki
// liczy się na drużyny, nie na pojedyncze imperia
function teamHasAlive(playerId) {
  const p = state.players[playerId];
  return !!p && state.players.some(o => o.alive && o.team === p.team);
}

// opts: { slots, humanCount, botCount, aiDifficulty, seed, timeLimit }
// `slots` (lobby) ma pierwszeństwo; humanCount/botCount to starsza, dalej wspierana
// droga (tools/sim.js, tools/stress.js, harness z 09-Przewodnik-developera.md) dająca FFA.
// pominięte pola (przyciski "Nowa mapa"/"Nowa gra") -> powtarzają ustawienia bieżącej gry;
// seed pominięty zawsze losuje nową mapę (nawet przy powtórce reszty ustawień)
function newGame(opts = {}) {
  const prevMpSetup = state && state.mpSetup;
  const prevSpSetup = state && state.spSetup;
  const prevOptions = state && state.options;
  const gameId = (state && state.gameId || 0) + 1;
  const hadGame = !!(state && state.players);

  const aiDifficulty = opts.aiDifficulty !== undefined ? opts.aiDifficulty
    : hadGame ? state.aiDifficulty
    : (prevOptions ? prevOptions.defaultDifficulty : 'normal');
  const timeLimit = opts.timeLimit !== undefined ? opts.timeLimit
    : hadGame ? state.timeLimit : Infinity;
  const mapSeed = opts.seed != null ? opts.seed : randomSeed();

  // skład partii: sloty z lobby > jawne humanCount/botCount > powtórka bieżącej gry
  // ("Nowa mapa" zachowuje obsadę i drużyny) > domyślne 1 człowiek + 3 boty.
  // humanCount 0 = tryb obserwatora (sami botowie); normalizeSlots pilnuje min. 2 imperiów
  const rawSlots = opts.slots ? normalizeSlots(opts.slots)
    : (opts.humanCount !== undefined || opts.botCount !== undefined)
      ? slotsFromCounts(opts.humanCount !== undefined ? opts.humanCount : 1,
                        opts.botCount !== undefined ? opts.botCount : 0)
    : hadGame ? normalizeSlots(state.players.map(p => ({ kind: p.kind, team: p.team, skin: p.skin })))
    : slotsFromCounts(1, 3);
  // przy drużynach sojusznicy startują obok siebie, w FFA bez zmian
  const slots = assignTeamPositions(rawSlots);

  const playerCount = slots.length;
  const actualHumanCount = slots.filter(s => s.kind === 'human').length;
  // 0 ludzi -> 'multi' (koniec gry = ostatnia żywa drużyna, nie upadek slota 0)
  const mode = actualHumanCount === 1 ? 'single' : 'multi';
  const firstHumanSlot = slots.findIndex(s => s.kind === 'human');

  const tiles = generateMap(playerCount, mapSeed);
  state = {
    screen: 'game',
    gameId,               // rozróżnia sesje gry — chroni przed spóźnionymi callbackami
                           // (setTimeout AI/końca tury) z gry porzuconej przez powrót do menu
    mode,                 // 'single' (1 człowiek + boty) | 'multi' (hot-seat, 2+ ludzi, opcjonalnie + boty)
    mpSetup: prevMpSetup || defaultMpSetup(),
    spSetup: prevSpSetup || defaultSpSetup(),
    options: prevOptions || defaultOptions(),
    tiles,
    mapSeed,
    turn: 1,
    phase: 'active',       // 'active' | 'over'
    // 'local' (hot-seat) | 'net' — gra sieciowa jeszcze nie istnieje, pole trzyma
    // dla niej miejsce w stanie i zapisie (patrz Documents/15-Silnik-i-przenosnosc.md)
    transport: opts.transport === 'net' ? 'net' : 'local',
    human: firstHumanSlot >= 0 ? firstHumanSlot : 0, // id imperium "Twojego" (tylko tryb single)
    humanPlayerCount: actualHumanCount,
    // trudność bota siedzi w player.difficulty (per gracz, ustawiana w slotach lobby);
    // to pole jest tylko wartością domyślną dla imperium przechodzącego pod AI w trakcie gry
    aiDifficulty: dominantDifficulty(slots, aiDifficulty),
    currentPlayerIndex: 0,
    turnStartTime: performance.now(),
    timeLimit: mode === 'multi' && actualHumanCount > 0 ? timeLimit : Infinity,
    aiSpeed: (state && state.aiSpeed) || 1, // mnożnik tempa ruchów AI (1/4/16, przeżywa "Nową mapę")
    activationsLeft: ACTIVATIONS_PER_TURN,
    selected: null,      // wybrane pole z armią gracza
    selectedCity: null,  // wybrane własne pole z miastem (panel budowy)
    selectedResource: null, // wybrane własne, podłączone złoże (panel wyboru miasta +1)
    roadPickFrom: null,  // miasto czekające na kliknięcie celu budowanej drogi
    // id = pozycja w tablicy (ciągła, bo zamknięte sloty nie tworzą imperium),
    // skin = barwa i zestaw sprite'ów z PLAYERS_DEF (u bossa BOSS_SKIN)
    players: slots.map((s, i) => ({
      ...PLAYERS_DEF[s.skin], id: i, skin: s.skin, kind: s.kind, team: s.team,
      alive: true, capital: CAPITAL_SPOTS[i],
      isHuman: s.kind === 'human',
      difficulty: s.kind === 'human' ? null : (s.difficulty != null ? s.difficulty : aiDifficulty),
    })),
    log: [],
  };
  state.aiPlayers = state.players.filter(p => !p.isHuman).map(p => ({ id: p.id, difficulty: p.difficulty }));
  anims = [];
  floaters = [];
  effects = [];
  // armie startowe na stolicach
  state.players.forEach(p => {
    const [c, r] = p.capital;
    // mapgen nazywa stolice po indeksie (PLAYERS_DEF[i]), a przy zamkniętych slotach
    // i bossie id ≠ skin — bez tej podmiany stolica nosiłaby nazwę cudzego imperium
    if (tiles[r][c].city) tiles[r][c].city.name = p.name;
    tiles[r][c].army = {
      player: p.id, str: 5, vet: 0, type: DEFAULT_UNIT_TYPE,
      mp: UNIT_TYPES[DEFAULT_UNIT_TYPE].mp, activated: false,
    };
  });
  if (mode === 'multi') {
    addLog(i18n.t('log.newGameMulti'));
  } else {
    addLog(i18n.t('log.newGameSingle'));
    addLog(i18n.t('log.newGameHint'));
  }
  hideOverlay();
  applyScreen();
  showBanner(mode === 'multi'
    ? i18n.t('banner.mpGameStart', { name: state.players[0].name })
    : i18n.t('banner.missionStart'));
  updateUI();
}

function defaultSpSetup() {
  return { bots: 3, difficulty: 'normal', customDiff: 50, seedMode: 'random', seedValue: randomSeed(), spectate: false };
}
function defaultMpSetup() {
  return {
    transport: 'local', slots: defaultMpSlots(),
    seedMode: 'random', seedValue: randomSeed(), time: TURN_TIME_LIMIT_DEFAULT,
  };
}
// domyślnie dwoje ludzi w jednej drużynie przeciw dwóm botom — układ, po który sięga
// sesja testowa (Documents/11-Early-Access.md): hot-seat, w którym gracze grają RAZEM
function defaultMpSlots(difficulty) {
  const d = difficulty || DEFAULT_AI_DIFFICULTY;
  return [
    { kind: 'human', team: 0, difficulty: null }, { kind: 'human', team: 0, difficulty: null },
    { kind: 'bot', team: 1, difficulty: d }, { kind: 'bot', team: 1, difficulty: d },
    { kind: 'closed', team: 2, difficulty: d }, { kind: 'closed', team: 3, difficulty: d },
  ];
}
function defaultOptions() {
  return { defaultSeed: null, defaultDifficulty: 'normal' };
}
function randomSeed() { return Math.floor(Math.random() * (SEED_MAX_VALUE + 1)); }

function tileAt(c, r) { return inBounds(c, r) ? state.tiles[r][c] : null; }

function neighborsOf(t) {
  return neighborCoords(t.c, t.r).map(([c, r]) => tileAt(c, r)).filter(Boolean);
}

function addLog(msg) {
  state.log.push(msg);
  if (state.log.length > 40) state.log.shift();
  if (typeof document === 'undefined') return;
  const el = document.getElementById('log');
  if (el) {
    el.innerHTML = state.log.slice(-10).map(l => `<div class="log-line">${l}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }
}
