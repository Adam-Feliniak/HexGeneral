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

// opts: { mode: 'single' | 'multi', playerCount, timeLimit }
// bez argumentów: powtarza tryb/ustawienia poprzedniej gry (przycisk "Nowa mapa"/"Nowa gra")
function newGame(opts = {}) {
  const prevMpSetup = state && state.mpSetup;
  const gameId = (state && state.gameId || 0) + 1;
  // brak opts.mode (przyciski "Nowa mapa"/"Nowa gra") -> powtórz ustawienia bieżącej gry
  const reuse = !!(state && state.players && (!opts.mode || opts.mode === state.mode));
  const mode = opts.mode || (reuse && state.mode) || 'single';
  const playerCount = opts.playerCount
    || (reuse && state.players.length)
    || (mode === 'single' ? 4 : MP_PLAYER_COUNTS[0]);
  const timeLimit = opts.timeLimit !== undefined ? opts.timeLimit
    : (reuse && state.timeLimit !== undefined ? state.timeLimit : Infinity);

  const tiles = generateMap(playerCount);
  state = {
    screen: 'game',
    gameId,               // rozróżnia sesje gry — chroni przed spóźnionymi callbackami
                           // (setTimeout AI/końca tury) z gry porzuconej przez powrót do menu
    mode,                 // 'single' (Ty + 3 AI) | 'multi' (hot-seat, N graczy-ludzi)
    mpSetup: prevMpSetup || { count: MP_PLAYER_COUNTS[2], time: TURN_TIME_LIMIT_DEFAULT },
    tiles,
    turn: 1,
    phase: 'active',       // 'active' | 'over'
    human: 0,               // id imperium "Twojego" (tylko tryb single)
    currentPlayerIndex: 0,
    turnStartTime: performance.now(),
    timeLimit: mode === 'multi' ? timeLimit : Infinity,
    movesLeft: MOVES_PER_TURN,
    selected: null,      // wybrane pole z armią gracza
    players: PLAYERS_DEF.slice(0, playerCount).map((p, i) => ({
      ...p, id: i, alive: true, capital: CAPITAL_SPOTS[i], isHuman: mode === 'multi' ? true : i === 0,
    })),
    log: [],
  };
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
