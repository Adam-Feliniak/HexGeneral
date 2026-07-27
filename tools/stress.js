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
   - inwarianty stanu po każdej rundzie i po każdym wczytaniu.

   Tryby:
     --mode=fuzz  (domyślny) — losowe legalne akcje + inwarianty
     --mode=soak  — długie partie 6 graczy, trend pamięci i czasu rundy

   Przykłady:
     node tools/stress.js --games=200
     node tools/stress.js --mode=fuzz --games=1 --seed=123   (reprodukcja)
     node tools/stress.js --mode=soak
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
  if (state.phase === 'over' && state.mode === 'multi' && aliveCount > 1)
    bad.push('phase=over przy ' + aliveCount + ' zywych (multi)');
  if (state.phase !== 'over' && aliveCount <= 1)
    bad.push('phase=active przy ' + aliveCount + ' zywych');
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

/* ------------------------------ fuzz ------------------------------ */

function runFuzzGame(seed, maxTurns) {
  const sb = makeSandbox();
  const rng = mulberry32((seed * 0x9E3779B1) >>> 0); // losowość SterOWNIKA (deterministyczna per seed)
  const pick = arr => arr[Math.floor(rng() * arr.length)];

  const g = code => vm.runInContext(code, sb.sandbox);
  const call = (fnName, ...args) => vm.runInContext(fnName, sb.sandbox)(...args);

  // losowa konfiguracja gry (deterministyczna per seed) — w granicach tego, co
  // pozwala lobby: single ma 1-5 botow (nie zero!), multi 2-3 ludzi + 0-3 botow
  const humanCount = 1 + Math.floor(rng() * 3);           // 1..3
  const botCount = humanCount === 1
    ? 1 + Math.floor(rng() * 5)                            // single: 1..5
    : Math.floor(rng() * 4);                               // multi: 0..3
  const diffs = ['easy', 'normal', 'hard', 'nightmare', Math.floor(rng() * 101)];
  const aiDifficulty = pick(diffs);
  const timeLimit = humanCount > 1 && rng() < 0.4 ? pick([60, 120]) : Infinity;
  const cfg = { humanCount, botCount, aiDifficulty, seed, timeLimit };

  g('Math.random = ' + mulberry32.toString() + ';')
  call('(s => { Math.random = (' + mulberry32.toString() + ')(s); })', (seed ^ 0x85EBCA77) >>> 0);
  call('(o => newGame(o))', cfg);

  const checkInvariants = vm.runInContext(INVARIANTS_SRC, sb.sandbox);
  const failures = [];
  const check = where => {
    const bad = checkInvariants();
    if (bad.length) failures.push({ where, bad });
  };

  let actions = 0;
  let lastTurnSeen = 1;
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
      // klik w zupełnie losowy kafelek (w tym morze, wróg, stolice — switchHuman
      // w turze 1 single przechodzi dokładnie tą ścieżką)
      const t = g(`state.tiles[${Math.floor(rng() * 14)}][${Math.floor(rng() * 23)}]`);
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
      call('(o => newGame(o))', cfg);
      lastTurnSeen = 1;
    }
    sb.pump();
  }

  // wyjątki łapie wywołujący; tu raportujemy inwarianty i softlock sterownika
  if (failures.length === 0 && actions >= maxActions) {
    failures.push({ where: 'koniec', bad: ['softlock: gra nie posuwa sie mimo ' + maxActions + ' akcji'] });
  }
  check('koniec gry');
  return { failures, turns: g('state.turn'), phase: g('state.phase') };
}

/* ------------------------------ soak ------------------------------ */

// „sesja wieczorna": wiele partii z rzędu w JEDNYM sandboxie (jak gracz bez
// odświeżania strony) — trend pamięci między partiami musi być płaski, a czas
// rundy nie może rosnąć z długością sesji
function runSoak(games, maxTurns) {
  console.log('SOAK: ' + games + ' partii 6 graczy z rzedu w jednej sesji, limit ' + maxTurns + ' rund');
  const sb = makeSandbox();
  const g = code => vm.runInContext(code, sb.sandbox);
  const call = (fn, ...a) => vm.runInContext(fn, sb.sandbox)(...a);
  const step = g(`(function(round) {
    state.turn = round;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (!p.alive || state.phase === 'over') continue;
      resetMoved(p.id);
      const d = resolveDifficulty(p.difficulty);
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
    call('(o => newGame(o))', { humanCount: 6, botCount: 0, aiDifficulty: 'normal', seed, timeLimit: Infinity });
    g('state.players.forEach(p => { p.isHuman = false; p.difficulty = "normal"; })');
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
  runSoak(games, maxTurns);
} else {
  console.log(`FUZZ: ${games} partii (seed od ${seedBase}), limit ${maxTurns} rund kazda`);
  let failed = 0, over = 0, turnsSum = 0;
  const t0 = Date.now();
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
    if (result.phase === 'over') over++;
    turnsSum += result.turns;
    if (result.failures.length) {
      failed++;
      for (const f of result.failures) {
        console.log(`  seed ${seed} [${f.where}]:`);
        for (const b of f.bad.slice(0, 8)) console.log('    - ' + b);
      }
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  rozstrzygniete: ${over}/${games}, srednio ${(turnsSum / games).toFixed(0)} rund/partie`);
  console.log(failed === 0
    ? `OK: ${games} partii fuzz bez wyjatkow i naruszen inwariantow (${dt}s)`
    : `BLEDY: ${failed}/${games} partii z problemami (${dt}s) — reprodukcja: --games=1 --seed=<n>`);
  process.exit(failed === 0 ? 0 : 1);
}
