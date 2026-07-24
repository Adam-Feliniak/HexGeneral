'use strict';
/* ============================================================
   sim.js — wsadowy runner AI-vs-AI do balansu (headless, zero zależności)

   Ładuje logikę gry z src/*.js do sandboxa vm (bez DOM/canvasu — pliki mają
   strażniki `typeof document === 'undefined'`) i rozgrywa N pełnych partii
   AI-vs-AI, zbierając statystyki zwycięstw i długości gier. Gry biegną
   równolegle na wielu rdzeniach (worker_threads).

   Po co: symulacja AI-vs-AI ma dużą wariancję (patrz Documents/06 i 09) —
   pojedyncza partia nic nie mówi. Dopiero setki gier dają liczby, na których
   da się stroić balans, zamiast zgadywać z jednego "dziwnego" wyniku.

   Determinizm: każda gra jest odtwarzalna z jej seeda, niezależnie od podziału
   na wątki. Mapę seeduje generateMap(), a losowość walki/AI (które wołają
   globalny Math.random) podmieniamy na seedowany strumień mulberry32 — dana gra
   zawsze przebiega identycznie. Powtórka pojedynczej gry:
       node tools/sim.js --games=1 --seed=<n> [reszta ustawień]

   Uwaga o przeglądarce: seed odtworzy w grze tę samą MAPĘ, ale nie te same
   rzuty bojowe — gra w przeglądarce nie seeduje Math.random. Pełna powtórka
   przebiegu jest tylko w obrębie tego narzędzia.

   Przykłady:
       node tools/sim.js --games=200
       node tools/sim.js --games=200 --players=4 --diff=hard
       node tools/sim.js --games=100 --mirror --diffs=normal,hard
       node tools/sim.js --games=1 --seed=12345 --list
   ============================================================ */

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const ROOT = path.resolve(__dirname, '..');

// pliki src/ w kolejności z index.html — wyłącznie warstwa logiki (bez
// sprites/render/input/main, które wymagają DOM/canvasu). ui.js i menu.js są
// potrzebne, bo newGame() woła applyScreen()/showBanner()/updateUI() — ich
// strażniki DOM sprawiają, że headless nic nie robią.
const SRC_FILES = [
  'config.js', 'locales-data.js', 'i18n.js', 'geometry.js', 'utils.js',
  'mapgen.js', 'state.js', 'combat.js', 'roads.js', 'empire.js', 'turns.js',
  'ai.js', 'ui.js', 'menu.js',
];

// seed strumienia walki/AI dla danej (mapy, rotacji) — stały, więc każda gra
// jest odtwarzalna niezależnie od tego, który wątek ją policzył. Sam reseed dzieje
// się w sterowniku PO newGame (przez makeRng z utils.js, identyczny mulberry32).
function rngSeedFor(mapSeed, rot) {
  return ((mapSeed * 0x9E3779B1) ^ (rot * 0x85EBCA77)) >>> 0;
}

// sterownik jednej partii (string wstrzykiwany do kontekstu vm). Ma bezpośredni
// dostęp do state, newGame, aiPickMove, executeMove, produce, resetMoved,
// MOVES_PER_TURN. Wierny pętli gry: resetMoved na starcie tury, do
// MOVES_PER_TURN "hopów" ruchu, produce na koniec. Zwraca zwięzły wynik.
const DRIVER_SRC = `
  (function makeDriver() {
    return function __simRunGame(o) {
      // humanCount = liczba graczy wymusza tryb 'multi' -> gra kończy się dopiero,
      // gdy zostaje jedno imperium (w 'single' kończyłaby się z upadkiem slota 0)
      newGame({ humanCount: o.players, botCount: 0, aiDifficulty: 'normal',
                seed: o.seed, timeLimit: Infinity });
      state.players.forEach(function (p, i) { p.isHuman = false; p.difficulty = o.diffs[i]; });
      // reseed strumienia walki/AI PO newGame: newGame zużywa zmienną liczbę wywołań
      // Math.random (default*Setup() tylko przy 1. grze w danym kontekście vm, potem
      // reużywa ustawień), więc reseed PRZED nim rozjeżdżałby wyniki między grami w
      // tym samym wątku i uzależniał je od podziału na wątki. makeRng == mulberry32.
      Math.random = makeRng(o.rngSeed);
      var diffCache = state.players.map(function (p) { return resolveDifficulty(p.difficulty); });
      var prevAlive = state.players.length;
      var elimSum = 0;   // suma rund, w których padały imperia (do średniej długości podboju)
      var round = 0;
      while (round < o.maxTurns && state.phase !== 'over') {
        round++;
        for (var idx = 0; idx < state.players.length; idx++) {
          var p = state.players[idx];
          if (!p.alive) continue;
          if (state.phase === 'over') break;
          resetMoved(p.id);
          var moves = MOVES_PER_TURN, guard = 0;
          while (moves > 0 && guard++ < 200) {
            var mv = aiPickMove(p.id, diffCache[p.id]);
            if (!mv) break;
            moves -= executeMove(mv.from, mv.to);
            if (state.phase === 'over') break;
          }
          if (state.phase === 'over') break;
          produce(p.id);
          var nowAlive = state.players.filter(function (q) { return q.alive; }).length;
          if (nowAlive < prevAlive) { elimSum += (prevAlive - nowAlive) * round; prevAlive = nowAlive; }
          if (state.phase === 'over') break;
        }
      }
      var alive = state.players.filter(function (p) { return p.alive; });
      return { winner: alive.length === 1 ? alive[0].id : -1,
               draw: alive.length !== 1, turns: round };
    };
  })()
`;

// buduje kontekst vm z załadowaną logiką gry i podmienialnym Math.random
function loadGameContext() {
  const sandboxMath = Object.create(Math); // dziedziczy floor/min/imul/… , nadpisujemy tylko random
  sandboxMath.random = Math.random;
  const sandbox = {
    console, JSON, Infinity, Math: sandboxMath,
    Date, performance: { now: () => Date.now() },
  };
  vm.createContext(sandbox);
  for (const f of SRC_FILES) {
    const p = path.join(ROOT, 'src', f);
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: p });
  }
  const runGame = vm.runInContext(DRIVER_SRC, sandbox);
  const PLAYERS_DEF = vm.runInContext('PLAYERS_DEF', sandbox);
  return { sandboxMath, runGame, PLAYERS_DEF };
}

// rozegranie zakresu gier [start, end) — używane przez każdy worker. Zwraca
// częściowe statystyki do scalenia w wątku głównym.
function runRange(cfg, onProgress) {
  const { start, end, players, diffs, maxTurns, mirror, list } = cfg;
  const { runGame } = loadGameContext();
  const rotations = mirror ? players : 1;

  const winsBySlot = Array(players).fill(0);
  const winsByDiff = {};
  diffs.forEach(d => { winsByDiff[String(d)] = 0; });
  let draws = 0;
  const lengths = [];
  const rows = [];

  for (let i = start; i < end; i++) {
    const mapSeed = cfg.seedBase + i;
    for (let k = 0; k < rotations; k++) {
      // rotacja przypisania trudności do slotów: slot s dostaje diffs[(s+k) % players]
      const assign = diffs.map((_, s) => diffs[(s + k) % players]);
      const res = runGame({ players, diffs: assign, seed: mapSeed, maxTurns, rngSeed: rngSeedFor(mapSeed, k) });

      lengths.push(res.turns);
      if (res.draw) {
        draws++;
      } else {
        winsBySlot[res.winner]++;
        const wd = String(assign[res.winner]);
        winsByDiff[wd] = (winsByDiff[wd] || 0) + 1;
      }
      if (list) rows.push({ seed: mapSeed, rot: k, winner: res.winner, turns: res.turns, draw: res.draw });
      if (onProgress) onProgress();
    }
  }
  return { winsBySlot, winsByDiff, draws, lengths, rows };
}

/* ------------------------------ WORKER ------------------------------ */
if (!isMainThread) {
  const partial = runRange(workerData, () => parentPort.postMessage({ type: 'progress' }));
  parentPort.postMessage({ type: 'result', partial });
  return; // (moduł CommonJS jest owinięty w funkcję — return kończy wykonanie workera)
}

/* ------------------------------- MAIN ------------------------------- */

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

const HELP = `sim.js — wsadowy runner AI-vs-AI do balansu

Użycie: node tools/sim.js [opcje]

  --games=N       liczba partii (domyślnie 100)
  --players=N     liczba imperiów 2..6 (domyślnie 2; ignorowane, gdy podano --diffs)
  --diff=PRESET   trudność wszystkich botów: easy|normal|hard|nightmare lub 0-100
  --diffs=a,b,..  trudność per slot (nadpisuje --diff i wyznacza liczbę graczy)
  --seed=N        seed bazowy (domyślnie 1); gra i używa mapy seed = baza + i
  --max-turns=N   limit rund; po przekroczeniu partia liczona jako remis (domyślnie 500)
  --mirror        gra każdą mapę we wszystkich rotacjach przypisania trudności do
                  slotów i agreguje wynik PO TRUDNOŚCI (znosi bias pozycji/kolejności)
  --jobs=N        liczba równoległych wątków (domyślnie: liczba rdzeni)
  --list          wypisz wynik każdej partii (seed, zwycięzca, rundy)
  --quiet         bez paska postępu
  --help          ta pomoc

Determinizm: każda partia jest w pełni odtwarzalna z jej seeda (mapa + losowość
walki/AI), niezależnie od liczby wątków. Powtórka jednej gry:
  node tools/sim.js --games=1 --seed=<n> ...`;

const VALID_PRESETS = ['easy', 'normal', 'hard', 'nightmare'];

function normDiff(raw) {
  const s = String(raw).trim();
  if (VALID_PRESETS.includes(s)) return s;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n <= 100) return n; // custom -> resolveDifficulty przyjmie liczbę
  throw new Error(`Nieznana trudność: "${s}" (oczekiwano ${VALID_PRESETS.join('|')} albo 0-100)`);
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pct(x, total) { return total ? (100 * x / total).toFixed(1) + '%' : '—'; }

function runWorker(cfg, onTick) {
  return new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: cfg });
    w.on('message', (msg) => {
      if (msg.type === 'progress') { if (onTick) onTick(); }
      else if (msg.type === 'result') resolve(msg.partial);
    });
    w.on('error', reject);
    w.on('exit', (code) => { if (code !== 0) reject(new Error('worker zakończył się kodem ' + code)); });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const games = Math.max(1, parseInt(args.games, 10) || 100);
  const seedBase = parseInt(args.seed, 10) || 1;
  const maxTurns = Math.max(1, parseInt(args['max-turns'], 10) || 500);
  const mirror = !!args.mirror;
  const quiet = !!args.quiet;
  const list = !!args.list;

  let diffs;
  if (args.diffs) {
    diffs = String(args.diffs).split(',').map(normDiff);
  } else {
    const players = Math.min(6, Math.max(2, parseInt(args.players, 10) || 2));
    diffs = Array(players).fill(normDiff(args.diff || 'normal'));
  }
  const players = diffs.length;
  if (players < 2 || players > 6) {
    console.error('Liczba graczy musi być w zakresie 2..6 (masz ' + players + ').');
    process.exit(1);
  }

  const jobs = Math.max(1, Math.min(parseInt(args.jobs, 10) || os.cpus().length, games));
  const runsPerGame = mirror ? players : 1;
  const totalRuns = games * runsPerGame;

  // nazwy imperiów do etykiet (config.js jest samowystarczalny przy załadowaniu)
  const { PLAYERS_DEF } = loadGameContext();
  const names = PLAYERS_DEF.map(p => p.name);

  console.log('Hex General — symulacja balansu AI-vs-AI');
  console.log(`  partie:        ${games}${mirror ? ` × ${players} rotacji = ${totalRuns} gier` : ''}`);
  console.log(`  gracze:        ${players}`);
  console.log(`  trudności:     [${diffs.join(', ')}]${mirror ? '  (rotowane po slotach)' : ' (na stałe po slotach)'}`);
  console.log(`  seed bazowy:   ${seedBase}`);
  console.log(`  limit rund:    ${maxTurns}`);
  console.log(`  wątki:         ${jobs}`);
  console.log(`  tryb:          ${mirror ? 'mirror (agregacja po trudności, bias pozycji zniesiony)' : 'sloty (bias pozycji widoczny)'}`);
  console.log('');

  // podział gier na wątki (spójne zakresy indeksów -> każdy wątek liczy całe gry)
  const t0 = Date.now();
  let done = 0;
  const onTick = () => {
    done++;
    if (quiet) return;
    if (done % Math.max(1, Math.floor(totalRuns / 100)) === 0 || done === totalRuns) {
      process.stdout.write(`\r  postęp: ${Math.round(100 * done / totalRuns)}%  (${done}/${totalRuns})   `);
    }
  };

  const per = Math.ceil(games / jobs);
  const tasks = [];
  for (let start = 0; start < games; start += per) {
    const end = Math.min(games, start + per);
    tasks.push(runWorker({
      start, end, seedBase, players, diffs, maxTurns, mirror, list,
    }, onTick));
  }
  const partials = await Promise.all(tasks);
  if (!quiet) process.stdout.write('\n\n');

  // scalanie
  const winsBySlot = Array(players).fill(0);
  const winsByDiff = {};
  diffs.forEach(d => { winsByDiff[String(d)] = 0; });
  let draws = 0;
  let lengths = [];
  let rows = [];
  for (const pt of partials) {
    pt.winsBySlot.forEach((w, s) => { winsBySlot[s] += w; });
    for (const d in pt.winsByDiff) winsByDiff[d] = (winsByDiff[d] || 0) + pt.winsByDiff[d];
    draws += pt.draws;
    lengths = lengths.concat(pt.lengths);
    rows = rows.concat(pt.rows);
  }

  const elapsed = (Date.now() - t0) / 1000;
  const decisive = totalRuns - draws;

  if (list) {
    rows.sort((a, b) => a.seed - b.seed || a.rot - b.rot);
    console.log('  Wyniki partii:');
    for (const r of rows) {
      const who = r.draw ? 'REMIS' : `${names[r.winner]}`;
      const rot = mirror ? ` rot=${r.rot}` : '';
      console.log(`    seed=${r.seed}${rot}  -> ${who}  w ${r.turns} rundach`);
    }
    console.log('');
  }

  console.log('  Podsumowanie:');
  console.log(`    gier:           ${totalRuns}`);
  console.log(`    rozstrzygnięte: ${decisive}  (${pct(decisive, totalRuns)})`);
  console.log(`    remisy (limit): ${draws}  (${pct(draws, totalRuns)})`);
  console.log('');

  if (mirror) {
    console.log('  Zwycięstwa wg trudności (bias pozycji zniesiony):');
    for (const d of [...new Set(diffs.map(String))]) {
      const w = winsByDiff[d] || 0;
      console.log(`    ${d.padEnd(12)} ${String(w).padStart(6)}   ${pct(w, totalRuns).padStart(6)} wszystkich   ${pct(w, decisive).padStart(6)} rozstrzygniętych`);
    }
  } else {
    console.log('  Zwycięstwa wg slota (bias pozycji/kolejności wliczony):');
    for (let s = 0; s < players; s++) {
      const label = `${s}: ${names[s]}`.padEnd(18);
      const w = winsBySlot[s];
      console.log(`    ${label} ${String(diffs[s]).padEnd(10)} ${String(w).padStart(6)}   ${pct(w, totalRuns).padStart(6)} wszystkich   ${pct(w, decisive).padStart(6)} rozstrzygniętych`);
    }
  }
  console.log('');

  const avg = (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1);
  console.log('  Długość gry (rundy):');
  console.log(`    min ${Math.min(...lengths)}  /  mediana ${median(lengths)}  /  średnia ${avg}  /  max ${Math.max(...lengths)}`);
  console.log('');
  console.log(`  Czas: ${elapsed.toFixed(1)} s  (${(totalRuns / elapsed).toFixed(1)} gier/s, ${jobs} wątków)`);
}

main().catch(err => { console.error('Błąd: ' + (err && err.message ? err.message : err)); process.exit(1); });
