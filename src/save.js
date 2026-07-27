'use strict';
/* ============================================================
   ZAPIS GRY — autozapis do localStorage, „Kontynuuj" i eksport/import
   zapisu jako tekst JSON (kopiuj/wklej na ekranie „Zapis gry").

   Kodek jest jawny (pole po polu), a nie ślepym JSON.stringify stanu,
   z trzech powodów:
   - referencje do kafelków (roadProject.target/segment, supplyCity)
     muszą być zapisane jako współrzędne [c, r] i odtworzone po wczytaniu,
   - Infinity (timeLimit, movesUsed świeżej armii) ginie w JSON (-> null),
     więc kodujemy je stringiem 'inf',
   - transienty (selekcje, turnStartTime z performance.now(), gameId)
     nie mają sensu w zapisie i są odtwarzane na świeżo.

   Dyscyplina formatu: KAŻDA przyszła zmiana kształtu stanu gry (nowe pole
   wpływające na rozgrywkę) wymaga dopisania pola do kodeka i podbicia
   SAVE_FORMAT — stary zapis dostaje wtedy komunikat o niezgodności
   (świadomie bez migracji przed 1.0).
   ============================================================ */

const SAVE_FORMAT = 1;
const SAVE_STORAGE_KEY = 'hexgeneral.save';

// JSON nie zna Infinity (zamienia na null) — kodujemy jawnie
function saveEncInf(v) { return v === Infinity ? 'inf' : v; }
function saveDecInf(v) { return v === 'inf' ? Infinity : v; }
function saveTileRef(t) { return t ? [t.c, t.r] : null; }

// bieżąca gra -> czysty obiekt do JSON-a (bez DOM, działa też headless)
function serializeGame() {
  if (!state || !state.tiles) return null;
  const tiles = [];
  for (const row of state.tiles) for (const t of row) {
    const st = { c: t.c, r: t.r, land: t.land, shade: t.shade, owner: t.owner };
    if (t.coast) st.coast = t.coast.slice();
    if (t.shallow !== undefined) st.shallow = t.shallow;
    if (t.resource) st.resource = t.resource;
    if (t.supplyCity) st.supplyCity = saveTileRef(t.supplyCity);
    if (t.road) st.road = { owner: t.road.owner };
    if (t.army) {
      st.army = {
        player: t.army.player, str: t.army.str, vet: t.army.vet,
        movesUsed: saveEncInf(t.army.movesUsed), type: t.army.type,
      };
    }
    if (t.city) {
      st.city = {
        name: t.city.name, capitalOf: t.city.capitalOf,
        port: t.city.port, buildType: t.city.buildType,
      };
      if (t.city.variant !== undefined) st.city.variant = t.city.variant;
      if (t.city.roadProject) {
        const rp = t.city.roadProject;
        st.city.roadProject = {
          target: saveTileRef(rp.target), segment: rp.segment.map(saveTileRef),
          cost: rp.cost, progress: rp.progress, built: rp.built,
        };
      }
    }
    tiles.push(st);
  }
  return {
    format: SAVE_FORMAT,
    version: GAME_VERSION,
    // znacznik buildu testerskiego (pusty w buildzie deweloperskim) — pozwala ustalić,
    // z czyjej kopii pochodzi nadesłany zapis; pole koperty, nie stan gry, więc bez
    // podbicia SAVE_FORMAT (deserializeGame ignoruje nieznane pola, stare zapisy działają)
    build: BUILD_TAG,
    savedAt: Date.now(),
    game: {
      mode: state.mode, mapSeed: state.mapSeed, turn: state.turn,
      phase: state.phase, human: state.human,
      humanPlayerCount: state.humanPlayerCount, aiDifficulty: state.aiDifficulty,
      currentPlayerIndex: state.currentPlayerIndex,
      timeLimit: saveEncInf(state.timeLimit), movesLeft: state.movesLeft,
      players: state.players.map(p => ({
        name: p.name, color: p.color, dark: p.dark, id: p.id, alive: p.alive,
        capital: p.capital.slice(), isHuman: p.isHuman, difficulty: p.difficulty,
      })),
      log: state.log.slice(),
      tiles,
    },
  };
}

// obiekt zapisu -> nowy state (true przy sukcesie); ustawienia lobby/opcje
// przeżywają z bieżącej sesji (wzorzec newGame), gameId dostaje bump, żeby
// unieważnić zawieszone setTimeouty starej gry
function deserializeGame(data) {
  if (!data || data.format !== SAVE_FORMAT || !data.game) return false;
  const g = data.game;
  // min. 2 graczy: żaden legalny zapis nie ma mniej (partia z 1 imperium nigdy
  // by się nie skończyła — lobby nie pozwala jej stworzyć, import też nie powinien)
  if (!Array.isArray(g.tiles) || g.tiles.length !== MAP_W * MAP_H ||
      !Array.isArray(g.players) || g.players.length < 2) return false;

  // 1) siatka kafelków (bez referencji między kafelkami)
  const tiles = [];
  for (let r = 0; r < MAP_H; r++) tiles.push(new Array(MAP_W).fill(null));
  for (const st of g.tiles) {
    if (!inBounds(st.c, st.r)) return false;
    const t = {
      c: st.c, r: st.r, land: !!st.land, shade: st.shade,
      city: null, resource: st.resource || null,
      road: st.road ? { owner: st.road.owner } : null,
      owner: st.owner, army: null,
    };
    if (st.coast) t.coast = st.coast.slice();
    if (st.shallow !== undefined) t.shallow = st.shallow;
    if (st.army) {
      t.army = {
        player: st.army.player, str: st.army.str, vet: st.army.vet,
        movesUsed: saveDecInf(st.army.movesUsed), type: st.army.type,
      };
    }
    if (st.city) {
      t.city = {
        name: st.city.name, capitalOf: st.city.capitalOf,
        port: st.city.port, buildType: st.city.buildType, roadProject: null,
      };
      if (st.city.variant !== undefined) t.city.variant = st.city.variant;
    }
    tiles[st.r][st.c] = t;
  }
  for (const row of tiles) for (const t of row) if (!t) return false;

  // 2) referencje [c, r] -> kafelki nowej siatki
  const at = ref => (ref && inBounds(ref[0], ref[1])) ? tiles[ref[1]][ref[0]] : null;
  for (const st of g.tiles) {
    const t = tiles[st.r][st.c];
    if (st.supplyCity) t.supplyCity = at(st.supplyCity);
    if (st.city && st.city.roadProject) {
      const rp = st.city.roadProject;
      const target = at(rp.target);
      if (!target) return false;
      t.city.roadProject = {
        target, segment: rp.segment.map(at).filter(Boolean),
        cost: rp.cost, progress: rp.progress, built: rp.built,
      };
    }
  }

  // 3) złożenie stanu
  state = {
    screen: 'game',
    gameId: (state && state.gameId || 0) + 1,
    mode: g.mode,
    mpSetup: (state && state.mpSetup) || defaultMpSetup(),
    spSetup: (state && state.spSetup) || defaultSpSetup(),
    options: (state && state.options) || defaultOptions(),
    tiles,
    mapSeed: g.mapSeed,
    turn: g.turn,
    phase: g.phase,
    human: g.human,
    humanPlayerCount: g.humanPlayerCount,
    aiDifficulty: g.aiDifficulty,
    currentPlayerIndex: g.currentPlayerIndex,
    turnStartTime: performance.now(),
    timeLimit: saveDecInf(g.timeLimit),
    aiSpeed: (state && state.aiSpeed) || 1, // preferencja sesji, nie część zapisu
    movesLeft: g.movesLeft,
    selected: null,
    selectedCity: null,
    selectedResource: null,
    roadPickFrom: null,
    players: g.players.map(p => ({ ...p, capital: p.capital.slice() })),
    log: g.log.slice(),
  };
  state.aiPlayers = state.players.filter(p => !p.isHuman).map(p => ({ id: p.id, difficulty: p.difficulty }));
  anims = [];
  floaters = [];
  effects = [];
  hoverTile = null;
  return true;
}

/* ------------------- localStorage (autozapis) ------------------- */

function autosave() {
  if (typeof localStorage === 'undefined') return;
  if (!state || state.screen !== 'game' || state.phase === 'over') return;
  const data = serializeGame();
  if (!data) return;
  try { localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* pełny magazyn / tryb prywatny */ }
}

function readAutosave() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// metadane do etykiety „Kontynuuj" (null = nie ma czego kontynuować)
function hasAutosave() {
  const d = readAutosave();
  if (!d || d.format !== SAVE_FORMAT || !d.game || d.game.phase === 'over') return null;
  return { turn: d.game.turn, mode: d.game.mode, savedAt: d.savedAt };
}

function clearAutosave() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(SAVE_STORAGE_KEY); } catch (e) { /* jw. */ }
}

/* ------------------- wznowienie po wczytaniu ------------------- */

// wspólne dla „Kontynuuj" i importu; zakłada, że deserializeGame już przeszło
function resumeLoadedGame() {
  applyScreen();
  updateUI();
  showBanner(i18n.t('banner.gameLoaded', { turn: state.turn }));
  const p = currentPlayer();
  if (!p.isHuman) {
    // zapis powstał w trakcie tury AI (wyjście do menu) — budżet ruchów AI żyje
    // w zamknięciu aiStep i nie jest serializowalny, więc AI zaczyna turę od
    // nowa; to czyste, bo produce() odpala się dopiero na końcu tury
    state.movesLeft = MOVES_PER_TURN;
    resetMoved(p.id);
    aiStep(p.id, MOVES_PER_TURN, endTurn);
  }
}

function loadAutosave() {
  const d = readAutosave();
  if (!d || !deserializeGame(d)) return false;
  resumeLoadedGame();
  return true;
}

/* ------------------- eksport/import tekstowy ------------------- */

// JSON bieżącej gry, a poza grą — zawartość autozapisu; null gdy brak
function exportSaveText() {
  if (state && state.screen === 'game' && state.phase !== 'over') {
    const d = serializeGame();
    return d ? JSON.stringify(d) : null;
  }
  const d = readAutosave();
  return d ? JSON.stringify(d) : null;
}

// zwraca 'ok' | 'corrupt' | 'incompatible' (klucze komunikatów dobiera menu.js)
function importSaveText(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return 'corrupt'; }
  if (!data || typeof data !== 'object') return 'corrupt';
  if (data.format !== SAVE_FORMAT) return 'incompatible';
  if (!deserializeGame(data)) return 'corrupt';
  autosave(); // zaimportowana partia od razu staje się autozapisem
  resumeLoadedGame();
  return 'ok';
}
