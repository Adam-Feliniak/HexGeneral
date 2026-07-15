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

function newGame() {
  const tiles = generateMap();
  state = {
    tiles,
    turn: 1,
    phase: 'human',      // 'human' | 'ai' | 'over'
    human: 0,            // id imperium prowadzonego przez człowieka
    movesLeft: MOVES_PER_TURN,
    selected: null,      // wybrane pole z armią gracza
    players: PLAYERS_DEF.map((p, i) => ({
      ...p, id: i, alive: true, capital: CAPITAL_SPOTS[i], isHuman: i === 0,
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
  addLog('Nowa gra! Zdobądź stolice wrogów.');
  addLog('Przed pierwszym ruchem możesz kliknąć obcą stolicę, by zagrać tym imperium.');
  hideOverlay();
  showBanner('MISSION START!');
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
