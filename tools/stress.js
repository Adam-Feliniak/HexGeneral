'use strict';
/* ============================================================
   stress.js — przebieg stabilnościowy (headless, zero zależności)

   Uzupełnienie sim.js: sim ćwiczy czystą warstwę logiki (aiPickMove/
   executeMove/produce), a stress przechodzi przez PRAWDZIWĄ pętlę gry
   i ścieżki człowieka, których sim nie dotyka:
   - kliknięcia przez onTileClick (selekcje, ruchy, road-pick, switchHuman),
   - pętla tur z setTimeout (aiStep/auto-koniec tury) na ręcznie pompowanej
     kolejce timeoutów i kontrolowanym zegarze performance.now,
   - zapis/wczytanie w środku partii (serialize -> deserialize -> gra dalej),
   - "Nowa mapa" w trakcie zakolejkowanych timeoutów starej gry (osłony gameId),
   - timer tury w multi (checkTurnTimer po skoku zegara),
   - losowany skład partii OBIEMA drogami wejścia do newGame: humanCount/botCount
     (starsze wywołania) i `slots` z lobby, czyli drużyny, boss, trudność per slot
     i zamknięte sloty,
   - inwarianty stanu po każdej rundzie i po każdym wczytaniu, w tym drużynowe:
     koniec gry liczony na drużyny, zero pól i armii przechodzących między sojusznikami.

   Tryby:
     --mode=fuzz  (domyślny) — losowe legalne akcje + inwarianty
     --mode=soak  — długie partie z rzędu w jednej sesji, trend pamięci i czasu rundy
                    (skład stały w obrębie przebiegu: --slots=ffa|2v2|3v3|boss)

   Przykłady:
     node tools/stress.js --games=200
     node tools/stress.js --games=60 --shapes                (rozkład konkretnych układów)
     node tools/stress.js --mode=fuzz --games=1 --seed=123   (reprodukcja)
     node tools/stress.js --mode=soak
     node tools/stress.js --mode=soak --slots=2v2            (ffa | 2v2 | 3v3 | boss)
   ============================================================ */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// jak SRC_FILES w sim.js + save.js (kodek zapisu) + input.js (onTileClick,
// switchHuman — nie dotykają DOM na poziomie modułu, funkcje mają osłony)
const SRC_FILES = [
  'config.js', 'locales-data.js', 'i18n.js', 'geometry.js', 'utils.js',
  'mapgen.js', 'state.js', 'combat.js', 'roads.js', 'empire.js', 'turns.js',
  'ai.js', 'save.js', 'ui.js', 'input.js', 'menu.js',
];

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- podsłuch reguł sojuszu ---------------- */

// Pole ani armia nie mają prawa przejść między sojusznikami. Inwariant liczony po rundzie
// tego nie zobaczy: pole MOŻE legalnie trafić od gracza do jego sojusznika, jeśli po drodze
// przeszło przez ręce wroga (A -> wróg -> sojusznik A), więc porównanie dwóch migawek
// dałoby fałszywy alarm albo przegapiło prawdziwy. Dlatego łapiemy w miejscu zdarzenia.
// __capturesSeen jest po to, żeby "zero naruszeń" dało się odróżnić od "podmiana nie weszła".
const TEAM_HOOKS_SRC = `
  var __teamViolations = [];
  var __capturesSeen = 0;
  var __origCaptureTile = captureTile;
  captureTile = function (t, playerId) {
    var prev = t.owner;
    __capturesSeen++;
    __origCaptureTile(t, playerId);
    if (prev >= 0 && prev !== playerId && sameTeam(prev, playerId) && t.owner === playerId)
      __teamViolations.push('pole (' + t.c + ',' + t.r + ') przeszlo od sojusznika ' + prev + ' do ' + playerId);
  };
  var __wrappedCaptureTile = captureTile;
  var __origResolveBattle = resolveBattle;
  resolveBattle = function (from, to) {
    if (from.army && to.army && from.army.player !== to.army.player &&
        sameTeam(from.army.player, to.army.player))
      __teamViolations.push('bitwa miedzy sojusznikami ' + from.army.player + ' i ' + to.army.player);
    return __origResolveBattle(from, to);
  };
  var __wrappedResolveBattle = resolveBattle;
`;

/* ---------------- sandbox: kolejka timeoutów + zegar ---------------- */

function makeSandbox() {
  // ręczna, deterministyczna kolejka setTimeout: timeouty odpalamy sami (pump),
  // w kolejności czasu odpalenia (remisy po kolejności rejestracji)
  const queue = [];
  let clock = 0;
  let timerSeq = 0;
  const sandboxMath = Object.create(Math);
  sandboxMath.random = Math.random; // podmieniane per gra
  const sandbox = {
    console, JSON, Infinity, Math: sandboxMath, Date,
    performance: { now: () => clock },
    setTimeout: (fn, delay) => {
      const id = ++timerSeq;
      queue.push({ id, at: clock + (delay || 0), fn });
      return id;
    },
    clearTimeout: (id) => {
      const i = queue.findIndex(t => t.id === id);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  vm.createContext(sandbox);
  for (const f of SRC_FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox, { filename: f });
  }
  vm.runInContext(TEAM_HOOKS_SRC, sandbox, { filename: 'team-hooks' });
  return {
    sandbox,
    advance(ms) { clock += ms; },
    // odpala timeouty wymagalne do bieżącego zegara; przy pustych wymagalnych
    // skacze do najbliższego (maxJump ogranicza skok, np. dla testu timera)
    pump(maxRounds = 10000) {
      let fired = 0;
      while (queue.length && fired++ < maxRounds) {
        queue.sort((a, b) => a.at - b.at || a.id - b.id);
        const t = queue[0];
        if (t.at > clock) clock = t.at; // skok zegara do najbliższego timeoutu
        queue.shift();
        t.fn();
      }
      return fired;
    },
    queueLength() { return queue.length; },
  };
}

/* ---------------------------- inwarianty ---------------------------- */

// sprawdzane po każdej rundzie i po każdym wczytaniu; zwraca listę naruszeń
const INVARIANTS_SRC = `(function checkInvariants() {
  const bad = [];
  const N = state.players.length;
  const aliveCount = state.players.filter(p => p.alive).length;

  if (state.tiles.length !== MAP_H) bad.push('tiles.length != MAP_H');
  for (let r = 0; r < state.tiles.length; r++) {
    if (state.tiles[r].length !== MAP_W) { bad.push('row ' + r + ' zla dlugosc'); continue; }
    for (let c = 0; c < MAP_W; c++) {
      const t = state.tiles[r][c];
      const at = '(' + c + ',' + r + ') ';
      if (t.c !== c || t.r !== r) bad.push(at + 'c/r niezgodne z indeksem');
      if (t.owner < -1 || t.owner >= N) bad.push(at + 'owner poza zakresem: ' + t.owner);
      if (t.owner >= 0 && !state.players[t.owner].alive) bad.push(at + 'owner martwy: ' + t.owner);
      if (t.road && (t.road.owner < 0 || t.road.owner >= N || !state.players[t.road.owner].alive))
        bad.push(at + 'road.owner zly/martwy');
      if (t.army) {
        const a = t.army;
        if (!(a.str >= 1 && a.str <= MAX_ARMY)) bad.push(at + 'army.str poza 1..MAX: ' + a.str);
        if (!(a.vet >= 0 && a.vet <= 15)) bad.push(at + 'army.vet poza 0..15: ' + a.vet);
        if (!UNIT_TYPES[a.type]) bad.push(at + 'army.type nieznany: ' + a.type);
        if (a.player < 0 || a.player >= N || !state.players[a.player].alive)
          bad.push(at + 'army.player zly/martwy: ' + a.player);
      }
      if (t.city) {
        if (t.city.capitalOf >= 0) {
          if (!state.players[t.city.capitalOf].alive) bad.push(at + 'capitalOf martwego gracza');
          else if (t.owner !== t.city.capitalOf) bad.push(at + 'stolica nie nalezy do wlasciciela: owner=' + t.owner + ' capitalOf=' + t.city.capitalOf);
        }
        const rp = t.city.roadProject;
        if (rp) {
          if (!rp.target || (!rp.target.resource && !rp.target.city)) bad.push(at + 'roadProject.target bez celu');
          if (rp.progress >= rp.cost) bad.push(at + 'roadProject nie domkniety mimo progress>=cost');
          if (rp.segment.some(s => !s.land)) bad.push(at + 'roadProject.segment na wodzie');
        }
      }
      if (t.supplyCity && !t.supplyCity.city) bad.push(at + 'supplyCity bez miasta');
    }
  }
  for (const p of state.players) {
    if (!p.alive) continue;
    const [cc, cr] = p.capital;
    const capT = state.tiles[cr][cc];
    if (capT.owner !== p.id || !capT.city || capT.city.capitalOf !== p.id)
      bad.push('zywy gracz ' + p.id + ' bez wlasnej stolicy');
  }
  // Koniec gry liczy się na DRUŻYNY, nie na imperia (przy FFA każdy jest własną drużyną,
  // więc to dokładnie dawny warunek "ostatnie żywe imperium"). Wersja licząca imperia
  // wybuchała przy pierwszej wygranej drużynowej — zostawia dwóch żywych
  const aliveTeams = distinctTeams(state.players.filter(p => p.alive));
  if (state.phase === 'over' && state.mode === 'multi' && aliveTeams > 1)
    bad.push('phase=over przy ' + aliveTeams + ' zywych druzynach (multi), zywych imperiow ' + aliveCount);
  if (state.phase !== 'over' && aliveTeams <= 1)
    bad.push('phase=active przy ' + aliveTeams + ' zywych druzynach');
  // w single porażka przychodzi dopiero po całej drużynie człowieka (sojusznik gra dalej)
  if (state.phase !== 'over' && state.mode === 'single' && !teamHasAlive(state.human))
    bad.push('single: cala druzyna czlowieka martwa, a gra trwa');

  /* --- skład partii: obsada i drużyny nie zmieniają się w trakcie --- */
  if (state.players.filter(p => p.kind === 'boss').length > 1) bad.push('wiecej niz jeden boss');
  for (const p of state.players) {
    if (p.isHuman !== (p.kind === 'human')) bad.push('gracz ' + p.id + ': isHuman rozjechalo sie z kind ' + p.kind);
    if (p.team === undefined) bad.push('gracz ' + p.id + ': brak druzyny');
  }
  // switchHuman musi zostawić dokładnie jednego człowieka — inaczej single-player
  // toczy się dalej bez gracza (tak wygladalo przejecie imperium bossa)
  if (state.mode === 'single') {
    const humans = state.players.filter(p => p.isHuman).length;
    if (humans !== 1) bad.push('single: ' + humans + ' ludzi zamiast jednego');
    else if (!state.players[state.human].isHuman) bad.push('single: state.human wskazuje nie-czlowieka');
  }
  // aiPlayers to cache pochodny, budowany w trzech miejscach (newGame, switchHuman,
  // deserializeGame) — rozjazd znaczy, że imperium zostaje bez tury albo dostaje dwie
  const aiIds = state.aiPlayers.map(a => a.id).join();
  const wantAi = state.players.filter(p => !p.isHuman).map(p => p.id).join();
  if (aiIds !== wantAi) bad.push('aiPlayers [' + aiIds + '] != nie-ludzie [' + wantAi + ']');
  if (typeof __lineup !== 'undefined' && __lineup) {
    if (__lineup.length !== state.players.length) {
      bad.push('zmienila sie liczba imperiow: ' + __lineup.length + ' -> ' + state.players.length);
    } else state.players.forEach((p, i) => {
      if (p.team !== __lineup[i].team) bad.push('gracz ' + i + ': druzyna ' + __lineup[i].team + ' -> ' + p.team);
      if ((p.kind === 'boss') !== __lineup[i].boss) bad.push('gracz ' + i + ': zmienil sie status bossa');
      if (p.skin !== __lineup[i].skin) bad.push('gracz ' + i + ': skin ' + __lineup[i].skin + ' -> ' + p.skin);
    });
  }
  // naruszenia złapane w miejscu zdarzenia (patrz TEAM_HOOKS_SRC)
  for (const v of __teamViolations.splice(0)) bad.push(v);
  // aktywacja schodzi dokladnie po 1, wiec pula nie moze zejsc pod zero
  // (przed przejsciem na punkty ruchu dopuszczalne bylo -2: ruch mogl byc 2-3 hopowy)
  if (!(state.activationsLeft >= 0 && state.activationsLeft <= ACTIVATIONS_PER_TURN))
    bad.push('activationsLeft poza zakresem: ' + state.activationsLeft);
  for (const row of state.tiles) for (const t of row) {
    if (!t.army) continue;
    const max = maxMovePoints(t);
    if (!(t.army.mp >= 0 && t.army.mp <= max))
      bad.push('army.mp poza zakresem: ' + t.army.mp + '/' + max + ' na ' + t.c + ',' + t.r);
  }
  if (state.log.length > 40) bad.push('log > 40');
  if (anims.length > 20000 || floaters.length > 20000 || effects.length > 20000)
    bad.push('animacje rosna bez ograniczen');
  return bad;
})`;

/* ------------------------ losowanie składu ------------------------ */

const DIFFS = ['easy', 'normal', 'hard', 'nightmare'];

// Skład partii losujemy OBIEMA drogami, którymi da się wejść do newGame, bo obie żyją:
// humanCount/botCount (starsze wywołania i harnessy z 09-Przewodnika, zawsze FFA) oraz
// `slots` — tabela z lobby, czyli drużyny, boss, trudność per slot i zamknięte sloty.
// Slotów budujemy zawsze dokładnie MAX_PLAYERS, tak jak wierszy w lobby: przy dłuższej
// tablicy normalizeSlots rozdałby skiny spoza PLAYERS_DEF, czego przez UI nie da się zrobić.
// Zwracamy też `want` — skład, jaki ma z tego wyjść — bo normalizeSlots po cichu NAPRAWIA
// niegrywalne układy (jedna drużyna -> rozbicie na FFA), więc bez sprawdzenia realnego
// składu fuzz drużyn mógłby przez cały przebieg grać FFA i tego nie zgłosić
function randomSetup(rng, seed, maxPlayers) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const aiDifficulty = pick([...DIFFS, Math.floor(rng() * 101)]);
  const slotDifficulty = () => (rng() < 0.2 ? null : pick([...DIFFS, Math.floor(rng() * 101)]));

  // 1/3 partii starą drogą — to ona ma zostać porównywalna z historycznymi przebiegami
  if (rng() < 0.34) {
    const humanCount = 1 + Math.floor(rng() * 3);            // 1..3
    const botCount = humanCount === 1
      ? 1 + Math.floor(rng() * 5)                             // single: 1..5
      : Math.floor(rng() * 4);                                // multi: 0..3
    const total = Math.min(maxPlayers, humanCount + botCount);
    const timeLimit = humanCount > 1 && rng() < 0.4 ? pick([60, 120]) : Infinity;
    return {
      layout: 'liczby (FFA)',
      cfg: { humanCount, botCount, aiDifficulty, seed, timeLimit },
      want: { players: total, teams: total, humans: Math.min(humanCount, total), boss: 0 },
    };
  }

  // 'wiele' = trzy drużyny z sojusznikami (2v2v2 i pochodne). Lobby na to pozwala, a różni
  // się od 3v3 dwoma rzeczami: assignTeamPositions dzieli mapę na trzy łuki zamiast dwóch,
  // a koniec gry wymaga DWÓCH eliminacji, nie jednej
  const layout = pick(['ffa', 'druzyny', 'druzyny', 'wiele', 'boss', 'boss']);
  // ile imperiów minimum, żeby układ w ogóle miał sens (drużyny: ktoś musi mieć sojusznika)
  const minOpen = layout === 'wiele' ? 4 : layout === 'druzyny' ? 3 : 2;
  const open = Math.max(minOpen, 2 + Math.floor(rng() * (maxPlayers - 1)));
  const teams = [];
  let bossAt = -1;
  if (layout === 'ffa') {
    for (let i = 0; i < open; i++) teams.push(i);
  } else if (layout === 'boss') {
    for (let i = 0; i < open - 1; i++) teams.push(0);         // wszyscy razem przeciw bossowi
    teams.push(1);
    bossAt = open - 1;
    // ...ale boss nie musi być sam: lobby pozwala dać mu sojusznika, a wtedy wchodzi pytanie,
    // którego nie sprawdza żaden harness — czy reguła ruchu bossa (własne terytorium w cenie
    // drogi) obowiązuje też na polu sojusznika
    if (open >= 3 && rng() < 0.35) teams[Math.floor(rng() * (open - 1))] = 1;
  } else if (layout === 'wiele') {
    for (let i = 0; i < open; i++) teams.push(i % 3);         // przy open>=4 któraś drużyna ma parę
  } else {
    const first = 1 + Math.floor(rng() * (open - 1));         // podział 1..open-1 : reszta
    for (let i = 0; i < open; i++) teams.push(i < first ? 0 : 1);
  }

  const kinds = new Array(open).fill('bot');
  if (bossAt >= 0) kinds[bossAt] = 'boss';
  const seats = [];
  for (let i = 0; i < open; i++) if (i !== bossAt) seats.push(i);
  const humans = 1 + Math.floor(rng() * Math.min(3, seats.length));
  // ludzie albo od góry tabeli (jak presety lobby), albo rozrzuceni po drużynach
  if (rng() >= 0.5) for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  for (let i = 0; i < humans; i++) kinds[seats[i]] = 'human';

  const slots = [];
  for (let i = 0; i < open; i++) {
    slots.push({ kind: kinds[i], team: teams[i], difficulty: kinds[i] === 'human' ? null : slotDifficulty() });
  }
  // zamknięte sloty dopychają tabelę do rozmiaru lobby — w losowych miejscach, bo w lobby
  // też nie muszą siedzieć na końcu (id imperiów mają zostać ciągłe mimo dziur w tabeli)
  while (slots.length < maxPlayers) {
    slots.splice(Math.floor(rng() * (slots.length + 1)), 0,
      { kind: 'closed', team: slots.length, difficulty: null });
  }
  const timeLimit = humans > 1 && rng() < 0.4 ? pick([60, 120]) : Infinity;
  // etykieta w kształcie "2v2" / "2v1v1" — liczona z realnego podziału, żeby nie kłamała
  // przy układach, w których boss dostał sojusznika
  const sizes = new Map();
  for (const t of teams) sizes.set(t, (sizes.get(t) || 0) + 1);
  const shape = [...sizes.values()].join('v');
  return {
    layout: layout === 'ffa' ? 'sloty FFA x' + open
      : layout === 'boss' ? 'boss ' + shape : 'druzyny ' + shape,
    cfg: { slots, aiDifficulty, seed, timeLimit },
    want: { players: open, teams: sizes.size, humans, boss: bossAt >= 0 ? 1 : 0 },
  };
}

/* ------------------------------ fuzz ------------------------------ */

function runFuzzGame(seed, maxTurns) {
  const sb = makeSandbox();
  const rng = mulberry32((seed * 0x9E3779B1) >>> 0); // losowość SterOWNIKA (deterministyczna per seed)
  const pick = arr => arr[Math.floor(rng() * arr.length)];

  const g = code => vm.runInContext(code, sb.sandbox);
  const call = (fnName, ...args) => vm.runInContext(fnName, sb.sandbox)(...args);

  // losowa konfiguracja gry (deterministyczna per seed) — w granicach tego, co pozwala
  // lobby: single ma 1-5 botow (nie zero!), multi 2-3 ludzi + 0-3 botow, a przy slotach
  // dowolny układ drużyn z bossem i zamkniętymi slotami włącznie
  const setup = randomSetup(rng, seed, g('MAX_PLAYERS'));

  g('Math.random = ' + mulberry32.toString() + ';')
  call('(s => { Math.random = (' + mulberry32.toString() + ')(s); })', (seed ^ 0x85EBCA77) >>> 0);

  const checkInvariants = vm.runInContext(INVARIANTS_SRC, sb.sandbox);
  const failures = [];
  const check = where => {
    const bad = checkInvariants();
    if (bad.length) failures.push({ where, bad });
  };

  // Nowa partia + zapamiętanie składu, KTÓRY NAPRAWDĘ WSZEDŁ do gry. Bez tego przebieg
  // "500 partii drużynowych" mógłby po cichu zagrać 500 partii FFA (normalizeSlots naprawia
  // niegrywalne układy zamiast je odrzucać), a inwarianty nie miałyby punktu odniesienia
  // dla "drużyna/skin/boss nie zmieniają się w trakcie partii"
  const startGame = () => {
    call('(o => newGame(o))', setup.cfg);
    // dokładnie jak każda ścieżka startu w grze (menu.js, przyciski w input.js): przy
    // slotach z lobby pierwszy gracz NIE musi być człowiekiem, a wtedy pętlę tur trzeba
    // odpalić jawnie — samo newGame nikogo nie rusza
    g('kickOffAiGame()');
    g('var __lineup = state.players.map(p => ({ team: p.team, skin: p.skin, boss: p.kind === "boss" }));');
    const got = g(`({ players: state.players.length,
                      teams: distinctTeams(state.players),
                      humans: state.players.filter(p => p.isHuman).length,
                      boss: state.players.filter(p => p.kind === 'boss').length })`);
    const w = setup.want;
    if (got.players !== w.players || got.teams !== w.teams || got.humans !== w.humans || got.boss !== w.boss) {
      failures.push({ where: 'sklad partii (' + setup.layout + ')',
        bad: ['chcialem ' + JSON.stringify(w) + ', dostalem ' + JSON.stringify(got)] });
    }
  };
  startGame();

  let actions = 0;
  let lastTurnSeen = 1;
  if (failures.length) return { failures, layout: setup.layout, turns: 1, phase: g('state.phase'), captures: 0 };
  let saveLoads = 0, restarts = 0; // rzadkie zdarzenia z twardym limitem na grę
  const maxActions = maxTurns * 400; // twardy bezpiecznik na softlock sterownika

  while (failures.length === 0 && actions < maxActions) {
    const st = g('state');
    if (st.phase === 'over') break;
    if (st.turn >= maxTurns) break;
    if (st.turn !== lastTurnSeen) { lastTurnSeen = st.turn; check('runda ' + st.turn); if (failures.length) break; }

    const cp = g('currentPlayer()');
    if (!cp.isHuman) {
      // tura AI biegnie na timeoutach (aiStep z thinkDelay) — pompujemy
      sb.pump();
      actions++;
      continue;
    }

    actions++;
    const roll = rng();
    if (roll < 0.55) {
      // klik: własna armia, którą wolno rozkazać, potem klik w losowy legalny cel
      const armies = g(`state.tiles.flat().filter(t => t.army && t.army.player === currentPlayer().id && armyCanBeOrdered(t))`);
      if (armies.length) {
        const a = pick(armies);
        call('(t => onTileClick(t))', a);
        const moves = call('(t => validMoves(t))', a);
        if (moves.length) call('(t => onTileClick(t))', pick(moves));
      } else {
        g('requestEndTurn()');
      }
    } else if (roll < 0.65) {
      // Klik w zupełnie losowy kafelek (w tym morze i wróg), a co drugi raz w czyjąś
      // stolicę: w turze 1 single dokładnie tą ścieżką idzie wybór imperium (switchHuman),
      // a losując z całej mapy trafialibyśmy w stolicę raz na 322 klikniecia — czyli
      // praktycznie nigdy, mimo że nagłówek obiecuje pokrycie tej ścieżki
      const t = rng() < 0.5
        ? call('(i => { const p = state.players[i % state.players.length];' +
               ' return state.tiles[p.capital[1]][p.capital[0]]; })', Math.floor(rng() * 6))
        : g(`state.tiles[${Math.floor(rng() * 14)}][${Math.floor(rng() * 23)}]`);
      call('(t => onTileClick(t))', t);
    } else if (roll < 0.75) {
      // gospodarka: projekt drogi z losowego miasta / anulowanie / buildType / supplyCity
      const myCities = g(`state.tiles.flat().filter(t => t.city && t.owner === currentPlayer().id)`);
      if (myCities.length) {
        const cityT = pick(myCities);
        const sub = rng();
        if (sub < 0.4 && !cityT.city.roadProject) {
          const targets = call('(t => roadTargets(t))', cityT);
          if (targets.length) call('((c, t, id) => startRoadProject(c, t, id))', cityT, pick(targets), cp.id);
        } else if (sub < 0.55 && cityT.city.roadProject) {
          call('(t => cancelRoadProject(t))', cityT);
        } else if (sub < 0.8) {
          call('((t, ty) => { t.city.buildType = ty; })', cityT, pick(['infantry', 'tank', 'artillery']));
        } else {
          // road-pick: panel ustawia roadPickFrom, potem klik w cel (legalny lub nie)
          call('(t => { state.roadPickFrom = t; })', cityT);
          const t = g(`state.tiles[${Math.floor(rng() * 14)}][${Math.floor(rng() * 23)}]`);
          call('(t => onTileClick(t))', t);
        }
      }
      const myRes = g(`state.tiles.flat().filter(t => t.resource && t.owner === currentPlayer().id && t.road)`);
      if (myRes.length) {
        const resT = pick(myRes);
        const cities = call('((t, id) => connectedCities(t, id))', resT, cp.id);
        if (cities.length) call('((t, c) => { t.supplyCity = c; })', resT, pick(cities));
      }
    } else if (roll < 0.9) {
      g('requestEndTurn()');
    } else if (roll < 0.93 && saveLoads++ < 25) {
      // zapis/wczytanie W ŚRODKU tury: round-trip + gra toczy się dalej
      const res = g(`(function () {
        const s1 = serializeGame();
        if (!s1) return 'serialize-null';
        if (!deserializeGame(JSON.parse(JSON.stringify(s1)))) return 'deserialize-fail';
        const s2 = serializeGame();
        if (JSON.stringify(s1.game) !== JSON.stringify(s2.game)) return 'roundtrip-mismatch';
        resumeLoadedGame();
        return 'ok';
      })()`);
      if (res !== 'ok') { failures.push({ where: 'save/load po akcji ' + actions, bad: [res] }); break; }
      check('po wczytaniu (akcja ' + actions + ')');
    } else if (roll < 0.97 && isFinite(st.timeLimit)) {
      // timer multi: skok zegara poza limit -> checkTurnTimer musi domknąć turę
      sb.advance((st.timeLimit + 5) * 1000);
      g('checkTurnTimer(performance.now())');
    } else if (roll < 0.985 && restarts < 2) {
      // „Nowa mapa" w trakcie zakolejkowanych timeoutów — osłony gameId muszą
      // wyciszyć spóźnione callbacki starej gry (max 2 restarty na grę, inaczej
      // partia nigdy nie doszłaby do limitu rund)
      restarts++;
      startGame();
      lastTurnSeen = 1;
      if (failures.length) break;
    }
    sb.pump();
  }

  // wyjątki łapie wywołujący; tu raportujemy inwarianty i softlock sterownika
  if (failures.length === 0 && actions >= maxActions) {
    // na czym stanęło: bez tego "softlock" nie mówi, czy zawiesił się sterownik,
    // czy pętla tur (np. tura AI, która nigdy się nie domyka)
    const at = g(`({ turn: state.turn, phase: state.phase, idx: state.currentPlayerIndex,
                     kind: currentPlayer().kind, isHuman: currentPlayer().isHuman,
                     alive: state.players.filter(p => p.alive).length })`);
    failures.push({ where: 'koniec', bad: ['softlock: gra nie posuwa sie mimo ' + maxActions +
      ' akcji, stan: ' + JSON.stringify(at) + ', timeoutow w kolejce: ' + sb.queueLength()] });
  }
  // podmiana z TEAM_HOOKS_SRC musi stać do końca partii — inaczej "zero naruszeń reguł
  // sojuszu" znaczyłoby tylko tyle, że nikt ich nie sprawdzał
  if (!g('captureTile === __wrappedCaptureTile && resolveBattle === __wrappedResolveBattle')) {
    failures.push({ where: 'koniec', bad: ['podsluch reguł sojuszu zostal nadpisany w trakcie partii'] });
  }
  check('koniec gry');
  return { failures, layout: setup.layout, turns: g('state.turn'), phase: g('state.phase'), captures: g('__capturesSeen') };
}

/* ------------------------------ soak ------------------------------ */

// „sesja wieczorna": wiele partii z rzędu w JEDNYM sandboxie (jak gracz bez
// odświeżania strony) — trend pamięci między partiami musi być płaski, a czas
// rundy nie może rosnąć z długością sesji
// Skład jest STAŁY w obrębie przebiegu (przełącznik --slots), a nie losowany po partiach:
// wynikiem soaka są trendy heapu i czasu rundy między partiami jednej sesji, więc zmiana
// układu w środku psułaby te kolumny z powodu niezwiązanego z wyciekami. Domyślne FFA
// zostaje bit w bit takie jak dotąd, żeby dawne pomiary dalej były porównywalne
function soakOpts(layout, seed) {
  const base = { aiDifficulty: 'normal', seed, timeLimit: Infinity };
  if (layout === 'ffa') return { ...base, humanCount: 6, botCount: 0 };
  const slot = team => ({ kind: 'bot', team, difficulty: 'normal' });
  if (layout === '2v2') return { ...base, slots: [slot(0), slot(0), slot(1), slot(1)] };
  if (layout === '3v3') return { ...base, slots: [slot(0), slot(0), slot(0), slot(1), slot(1), slot(1)] };
  if (layout === 'boss') {
    return { ...base, slots: [slot(0), slot(0), slot(0), slot(0), slot(0), { kind: 'boss', team: 1, difficulty: 'normal' }] };
  }
  throw new Error('nieznany uklad --slots=' + layout + ' (ffa | 2v2 | 3v3 | boss)');
}

function runSoak(games, maxTurns, layout) {
  console.log('SOAK: ' + games + ' partii z rzedu w jednej sesji (uklad ' + layout + '), limit ' + maxTurns + ' rund');
  const sb = makeSandbox();
  const g = code => vm.runInContext(code, sb.sandbox);
  const call = (fn, ...a) => vm.runInContext(fn, sb.sandbox)(...a);
  const step = g(`(function(round) {
    state.turn = round;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (!p.alive || state.phase === 'over') continue;
      resetMoved(p.id);
      // playerDifficulty, nie resolveDifficulty: boss ma dostac swoje mnozniki
      const d = playerDifficulty(p);
      let activations = ACTIVATIONS_PER_TURN, guard = 0;
      while (activations > 0 && guard++ < 200) {
        const mv = aiPickMove(p.id, d);
        if (!mv) break;
        activations -= executeMove(mv.from, mv.to);
        if (state.phase === 'over') break;
      }
      if (state.phase !== 'over') produce(p.id);
    }
    return state.phase;
  })`);
  let baseline = 0;
  for (let seed = 1; seed <= games; seed++) {
    call('(s => { Math.random = (' + mulberry32.toString() + ')(s); })', (seed * 0x9E3779B1) >>> 0);
    call('(o => newGame(o))', soakOpts(layout, seed));
    // sterownik gra za wszystkich; boss zostaje bossem, inaczej stracilby swoje reguly
    g(`state.players.forEach(p => {
         if (p.kind === 'human') { p.kind = 'bot'; p.isHuman = false; }
         if (p.difficulty == null) p.difficulty = 'normal';
       })`);
    const times = [];
    let phase = 'active';
    for (let round = 1; round <= maxTurns && phase !== 'over'; round++) {
      const t0 = Date.now();
      phase = step(round);
      times.push(Date.now() - t0);
    }
    if (global.gc) global.gc();
    const heap = process.memoryUsage().heapUsed;
    if (seed === 2) baseline = heap; // po rozgrzaniu (1. partia = kompilacja/cache)
    const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const drift = seed >= 2 && baseline ? ' heap ' + (heap >= baseline ? '+' : '') + Math.round((heap - baseline) / 1024) + 'KB od partii 2' : '';
    console.log(`  partia ${seed}: ${times.length} rund (${phase}), sr. czas rundy ${avg(times).toFixed(1)}ms,${drift}`);
  }
  console.log('SOAK zakonczony (uruchom z node --expose-gc dla dokladnego heapu)');
}

/* ------------------------------ main ------------------------------ */

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const mode = args.mode || 'fuzz';
const games = Math.max(1, parseInt(args.games, 10) || (mode === 'soak' ? 10 : 100));
const seedBase = parseInt(args.seed, 10) || 1;
const maxTurns = Math.max(1, parseInt(args['max-turns'], 10) || (mode === 'soak' ? 1000 : 300));

if (mode === 'soak') {
  runSoak(games, maxTurns, args.slots || 'ffa');
} else {
  console.log(`FUZZ: ${games} partii (seed od ${seedBase}), limit ${maxTurns} rund kazda`);
  let failed = 0, over = 0, turnsSum = 0, captures = 0;
  const byLayout = new Map(); // ile partii którego składu — inaczej "500 partii" nie mówi,
  const t0 = Date.now();      // czy drużyny w ogóle weszły do losowania
  for (let i = 0; i < games; i++) {
    const seed = seedBase + i;
    let result;
    try {
      result = runFuzzGame(seed, maxTurns);
    } catch (e) {
      failed++;
      console.log(`  seed ${seed}: WYJATEK: ${e.message}`);
      console.log((e.stack || '').split('\n').slice(0, 5).join('\n'));
      continue;
    }
    // --shapes rozbija podsumowanie na konkretne układy (2v2, 2v1v1, boss 3v2...) zamiast
    // rodzin — tym sprawdza się, czy losowanie w ogóle produkuje układ, o który chodzi
    const family = args.shapes ? result.layout : result.layout.split(' ')[0];
    byLayout.set(family, (byLayout.get(family) || 0) + 1);
    captures += result.captures;
    if (result.phase === 'over') over++;
    turnsSum += result.turns;
    if (result.failures.length) {
      failed++;
      for (const f of result.failures) {
        console.log(`  seed ${seed} [${f.where}] (${result.layout}):`);
        for (const b of f.bad.slice(0, 8)) console.log('    - ' + b);
      }
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('  sklady: ' + [...byLayout].map(([k, n]) => k + ' ' + n).join(', '));
  console.log(`  rozstrzygniete: ${over}/${games}, srednio ${(turnsSum / games).toFixed(0)} rund/partie`);
  console.log(`  zajec pola przez podsluch sojuszy: ${captures}`);
  console.log(failed === 0
    ? `OK: ${games} partii fuzz bez wyjatkow i naruszen inwariantow (${dt}s)`
    : `BLEDY: ${failed}/${games} partii z problemami (${dt}s) — reprodukcja: --games=1 --seed=<n>`);
  process.exit(failed === 0 ? 0 : 1);
}
