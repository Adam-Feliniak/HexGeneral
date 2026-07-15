'use strict';
/* ============================================================
   WEJŚCIE GRACZA — kliknięcia na planszy, wybór imperium, tooltip
   ============================================================ */

// przed pierwszym ruchem w grze można wybrać imperium, klikając jego stolicę
function canPickEmpire() {
  return state.phase === 'human' && state.turn === 1 && state.movesLeft === MOVES_PER_TURN;
}

function switchHuman(id) {
  state.human = id;
  state.players.forEach(p => { p.isHuman = p.id === id; });
  state.selected = null;
  addLog(`Przejmujesz dowodzenie: <b>${state.players[id].name}</b>!`);
  showBanner(`Grasz jako ${state.players[id].name}!`);
  updateUI();
}

function onTileClick(t) {
  if (!state || state.phase !== 'human') return;
  if (canPickEmpire() && t.city && t.city.capitalOf >= 0 && t.city.capitalOf !== state.human) {
    switchHuman(t.city.capitalOf);
    return;
  }
  const sel = state.selected;
  if (sel && sel !== t && validMoves(sel).includes(t)) {
    state.selected = null;
    executeMove(sel, t);
    state.movesLeft--;
    if (state.movesLeft <= 0 && state.phase === 'human') {
      setTimeout(() => { if (state.phase === 'human') endHumanTurn(); }, 350);
    }
    updateUI();
    return;
  }
  if (t.army && t.army.player === state.human && t.army.movesUsed < moveCap(t) && state.movesLeft > 0) {
    state.selected = (sel === t) ? null : t;
  } else {
    state.selected = null;
  }
  updateUI();
}

function pixelToTile(px, py) {
  let best = null, bestD = Infinity;
  const rApprox = Math.round((py - HEX * 1.2) / (1.5 * HEX));
  for (let r = rApprox - 1; r <= rApprox + 1; r++) {
    if (r < 0 || r >= MAP_H) continue;
    for (let c = 0; c < MAP_W; c++) {
      const { x, y } = hexCenter(c, r);
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bestD) { bestD = d; best = state.tiles[r][c]; }
    }
  }
  return bestD <= HEX * HEX * 1.1 ? best : null;
}

function canvasPos(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (BOARD_PX_W / rect.width),
    y: (ev.clientY - rect.top) * (BOARD_PX_H / rect.height),
  };
}

function tileTooltip(t) {
  const lines = [];
  if (!t.land) lines.push('🌊 Morze');
  else if (t.owner >= 0) lines.push(`Ziemie: <b>${state.players[t.owner].name}</b>`);
  else lines.push('Ziemia niczyja');
  if (t.city) {
    lines.push(t.city.capitalOf >= 0
      ? `★ Stolica: <b>${t.city.name}</b>`
      : `🏛 Miasto: <b>${t.city.name}</b>${t.city.port ? ' (port ⚓)' : ''}`);
  }
  if (t.resource) {
    const RES_NAMES = { oil: '🛢 Szyb naftowy', farm: '🌾 Pole uprawne', mine: '⛏ Kopalnia' };
    lines.push(`${RES_NAMES[t.resource]} — <b>+1</b> produkcji, gdy ma drogę do miasta`);
    if (t.owner >= 0) {
      if (t.road && isRoadActive(t)) lines.push(`🚚 Zaopatruje: <b>${t.road.city.city.name}</b>`);
      else if (t.road) lines.push('🚧 Droga przerwana przez wroga — brak dostaw');
      else lines.push('🚧 Brak drogi do miasta — brak dostaw');
    }
  }
  if (t.army) {
    const m = Math.min(110, moraleAt(t.army.player, t) + t.army.vet);
    lines.push(`⚔ Armia ${state.players[t.army.player].name}: siła <b>${t.army.str}</b>, morale <b>${m}%</b>`);
  }
  if (canPickEmpire() && t.city && t.city.capitalOf >= 0 && t.city.capitalOf !== state.human) {
    lines.push('👉 Kliknij, aby zagrać tym imperium');
  }
  return lines.join('<br>');
}

function initInput() {
  canvas.addEventListener('click', ev => {
    const { x, y } = canvasPos(ev);
    const t = pixelToTile(x, y);
    if (t) onTileClick(t);
  });
  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    state.selected = null;
    updateUI();
  });
  canvas.addEventListener('mousemove', ev => {
    const { x, y } = canvasPos(ev);
    hoverTile = pixelToTile(x, y);
    const tip = document.getElementById('tooltip');
    if (hoverTile) {
      tip.innerHTML = tileTooltip(hoverTile);
      tip.hidden = false;
      const wrap = document.getElementById('board-wrap').getBoundingClientRect();
      tip.style.left = Math.min(ev.clientX - wrap.left + 16, wrap.width - 240) + 'px';
      tip.style.top = (ev.clientY - wrap.top + 14) + 'px';
    } else tip.hidden = true;
  });
  canvas.addEventListener('mouseleave', () => {
    hoverTile = null;
    document.getElementById('tooltip').hidden = true;
  });
  document.getElementById('end-turn').addEventListener('click', endHumanTurn);
  document.getElementById('new-game').addEventListener('click', newGame);
  document.getElementById('overlay-btn').addEventListener('click', newGame);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') endHumanTurn();
    if (ev.key === 'Escape') { state.selected = null; updateUI(); }
  });
}
