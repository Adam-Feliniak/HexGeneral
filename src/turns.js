'use strict';
/* ============================================================
   TURY — przełączanie aktywnego gracza (AI w trybie single,
   kolejny człowiek przy stole w trybie multi/hot-seat)
   ============================================================ */

function resetMoved(playerId) {
  for (const row of state.tiles) for (const t of row) {
    if (t.army && t.army.player === playerId) t.army.movesUsed = 0;
  }
}

function currentPlayer() { return state.players[state.currentPlayerIndex]; }

function nextAliveIndex(from) {
  let idx = from;
  for (let i = 0; i < state.players.length; i++) {
    idx = (idx + 1) % state.players.length;
    if (state.players[idx].alive) return idx;
  }
  return from;
}

function startTurn() {
  if (state.phase === 'over') { updateUI(); return; }
  const p = currentPlayer();
  state.selected = null;
  state.movesLeft = MOVES_PER_TURN;
  state.turnStartTime = performance.now();
  resetMoved(p.id);
  if (state.mode === 'multi') {
    showBanner(`Gracz ${p.id + 1}: ${p.name} — Twoja tura!`);
  } else if (p.isHuman) {
    showBanner(`Tura ${state.turn} — Twój ruch`);
  }
  updateUI();
  if (!p.isHuman) aiStep(p.id, MOVES_PER_TURN, endTurn);
}

// kończy turę aktywnego gracza (kliknięcie "Koniec tury", wyczerpanie ruchów,
// upłynięcie limitu czasu albo dokończenie ruchów AI) i przechodzi do kolejnego
function endTurn() {
  if (state.phase === 'over') { updateUI(); return; }
  const p = currentPlayer();
  state.selected = null;
  produce(p.id);
  if (state.phase === 'over') { updateUI(); return; }
  const next = nextAliveIndex(state.currentPlayerIndex);
  if (next <= state.currentPlayerIndex) state.turn++; // pełny obrót -> nowa runda
  state.currentPlayerIndex = next;
  startTurn();
}

// wywoływana z UI (przycisk/Enter/timeout) — ignoruje żądanie, gdy aktywny
// gracz to AI (single-player) lub gra się zakończyła
function requestEndTurn() {
  if (!state || state.screen !== 'game' || state.phase === 'over') return;
  if (!currentPlayer().isHuman) return;
  endTurn();
}

// timer tury (tylko multi z limitem) — sprawdzany co klatkę z render.js/frame()
function checkTurnTimer(now) {
  if (!state || state.screen !== 'game' || state.phase === 'over') return;
  if (!isFinite(state.timeLimit)) return;
  const p = currentPlayer();
  if (!p.isHuman) return;
  const elapsed = (now - state.turnStartTime) / 1000;
  if (elapsed >= state.timeLimit) {
    addLog(`⏰ Czas minął — <b>${p.name}</b> traci turę.`);
    endTurn();
  }
}
