'use strict';
/* ============================================================
   TURY — przełączanie fazy człowieka i przeciwników (AI)
   ============================================================ */

function resetMoved(playerId) {
  for (const row of state.tiles) for (const t of row) {
    if (t.army && t.army.player === playerId) t.army.movesUsed = 0;
  }
}

function endHumanTurn() {
  if (state.phase !== 'human') return;
  state.selected = null;
  produce(state.human);
  state.phase = 'ai';
  updateUI();
  runAIPlayers(0);
}

function startHumanTurn() {
  if (state.phase === 'over') return;
  state.turn++;
  state.phase = 'human';
  state.movesLeft = MOVES_PER_TURN;
  resetMoved(state.human);
  showBanner(`Tura ${state.turn} — Twój ruch`);
  updateUI();
}

function runAIPlayers(idx) {
  if (state.phase === 'over') { updateUI(); return; }
  while (idx < state.players.length && (idx === state.human || !state.players[idx].alive)) idx++;
  if (idx >= state.players.length) { startHumanTurn(); return; }
  resetMoved(idx);
  aiStep(idx, MOVES_PER_TURN, () => {
    produce(idx);
    runAIPlayers(idx + 1);
  });
}
