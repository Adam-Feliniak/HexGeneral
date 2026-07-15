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

// opts: { humanCount, botCount, aiDifficulty, seed, timeLimit }
// pominięte pola (przyciski "Nowa mapa"/"Nowa gra") -> powtarzają ustawienia bieżącej gry;
// seed pominięty zawsze losuje nową mapę (nawet przy powtórce reszty ustawień)
function newGame(opts = {}) {
  const prevMpSetup = state && state.mpSetup;
  const prevSpSetup = state && state.spSetup;
  const prevOptions = state && state.options;
  const gameId = (state && state.gameId || 0) + 1;
  const hadGame = !!(state && state.players);

  const humanCount = opts.humanCount !== undefined ? opts.humanCount
    : hadGame ? state.humanPlayerCount : 1;
  const botCount = opts.botCount !== undefined ? opts.botCount
    : hadGame ? (state.players.length - state.humanPlayerCount) : 3;
  const aiDifficulty = opts.aiDifficulty !== undefined ? opts.aiDifficulty
    : hadGame ? state.aiDifficulty
    : (prevOptions ? prevOptions.defaultDifficulty : 'normal');
  const timeLimit = opts.timeLimit !== undefined ? opts.timeLimit
    : hadGame ? state.timeLimit : Infinity;
  const mapSeed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 10000000);

  const playerCount = Math.min(6, Math.max(1, humanCount) + Math.max(0, botCount));
  const actualHumanCount = Math.min(Math.max(1, humanCount), playerCount);
  const mode = actualHumanCount <= 1 ? 'single' : 'multi';

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
    human: 0,               // id imperium "Twojego" (tylko tryb single)
    humanPlayerCount: actualHumanCount,
    aiDifficulty,          // preset ('easy'..'nightmare') albo liczba 0-100 (custom) — wspólna dla botów tej gry
    currentPlayerIndex: 0,
    turnStartTime: performance.now(),
    timeLimit: mode === 'multi' ? timeLimit : Infinity,
    movesLeft: MOVES_PER_TURN,
    selected: null,      // wybrane pole z armią gracza
    players: PLAYERS_DEF.slice(0, playerCount).map((p, i) => ({
      ...p, id: i, alive: true, capital: CAPITAL_SPOTS[i],
      isHuman: i < actualHumanCount,
      difficulty: i < actualHumanCount ? null : aiDifficulty,
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
    tiles[r][c].army = { player: p.id, str: 5, vet: 0, movesUsed: 0 };
  });
  if (mode === 'multi') {
    addLog('Nowa gra wieloosobowa! Zdobądź stolice pozostałych graczy.');
  } else {
    addLog('Nowa gra! Zdobądź stolice wrogów.');
    addLog('Przed pierwszym ruchem możesz kliknąć obcą stolicę, by zagrać tym imperium.');
  }
  hideOverlay();
  applyScreen();
  showBanner(mode === 'multi' ? `Gracz 1: ${state.players[0].name} zaczyna!` : 'MISSION START!');
  updateUI();
}

function defaultSpSetup() {
  return { bots: 3, difficulty: 'normal', customDiff: 50, seedMode: 'random', seedValue: randomSeed() };
}
function defaultMpSetup() {
  return {
    count: MP_PLAYER_COUNTS[2], bots: 0, difficulty: 'normal', customDiff: 50,
    seedMode: 'random', seedValue: randomSeed(), time: TURN_TIME_LIMIT_DEFAULT,
  };
}
function defaultOptions() {
  return { defaultSeed: null, defaultDifficulty: 'normal' };
}
function randomSeed() { return Math.floor(Math.random() * 10000000); }

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
