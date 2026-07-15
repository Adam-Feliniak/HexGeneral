'use strict';
/* ============================================================
   UI — panel boczny, banery, ekran końcowy
   ============================================================ */

function updateUI() {
  if (typeof document === 'undefined' || !state) return;
  document.getElementById('turn-label').textContent = `Tura ${state.turn}`;
  document.getElementById('moves-label').textContent =
    state.phase === 'human' ? `Ruchy: ${state.movesLeft}/${MOVES_PER_TURN}`
    : state.phase === 'ai' ? 'Ruch przeciwników…' : 'Koniec gry';
  document.getElementById('end-turn').disabled = state.phase !== 'human';

  const box = document.getElementById('players');
  box.innerHTML = '';
  for (const p of state.players) {
    let cities = 0, str = 0, res = 0;
    for (const row of state.tiles) for (const t of row) {
      if (t.city && t.owner === p.id) cities++;
      if (t.resource && t.owner === p.id) res++;
      if (t.army && t.army.player === p.id) str += t.army.str;
    }
    const div = document.createElement('div');
    div.className = 'player-row'
      + (!p.alive ? ' dead' : '')
      + (p.alive && ((state.phase === 'human' && p.id === state.human)) ? ' active' : '');
    div.innerHTML =
      `<span class="player-dot" style="background:${p.color}"></span>` +
      `<span class="player-name">${p.name}${p.isHuman ? ' (Ty)' : ''}</span>` +
      `<span class="player-stats">🏛 ${cities} ⛏ ${res} ⚔ ${str}</span>`;
    box.appendChild(div);
  }
}

let bannerTimer = null;
function showBanner(text) {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = text;
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 2200);
}

function showOverlay(title, text) {
  if (typeof document === 'undefined') return;
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-text').textContent = text;
  document.getElementById('overlay').hidden = false;
}
function hideOverlay() {
  if (typeof document === 'undefined') return;
  const o = document.getElementById('overlay');
  if (o) o.hidden = true;
}
