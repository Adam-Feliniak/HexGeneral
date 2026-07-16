'use strict';
/* ============================================================
   UI — panel boczny, banery, ekran końcowy
   ============================================================ */

function updateUI() {
  if (typeof document === 'undefined' || !state || state.screen !== 'game') return;
  const cp = currentPlayer();
  document.getElementById('turn-label').textContent = i18n.t('game.turn', { n: state.turn });
  document.getElementById('moves-label').textContent =
    state.phase === 'over' ? i18n.t('game.gameOver')
    : cp.isHuman ? i18n.t('game.movesLeft', { moves: state.movesLeft, total: MOVES_PER_TURN })
    : i18n.t('game.enemyMoving');
  document.getElementById('turn-player-label').textContent =
    state.phase === 'over' ? ''
    : state.mode === 'multi'
      ? (cp.isHuman ? i18n.t('game.yourTurnMulti', { n: cp.id + 1, name: cp.name }) : i18n.t('game.botTurnMulti', { name: cp.name }))
      : '';
  document.getElementById('end-turn').disabled = state.phase === 'over' || !cp.isHuman;
  updateTimerDisplay(performance.now());

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
      + (p.alive && state.phase !== 'over' && p.id === state.currentPlayerIndex ? ' active' : '');
    const icon = p.isHuman ? '👤' : '🤖';
    const tyTag = state.mode === 'single' && p.isHuman ? ' ' + i18n.t('game.youTag') : '';
    const diffBadge = !p.isHuman ? `<span class="diff-badge">${resolveDifficulty(p.difficulty).label}</span>` : '';
    div.innerHTML =
      `<span class="player-dot" style="background:${p.color}"></span>` +
      `<span class="player-name">${icon} ${p.name}${tyTag}${diffBadge}</span>` +
      `<span class="player-stats">🏛 ${cities} ⛏ ${res} ⚔ ${str}</span>`;
    box.appendChild(div);
  }

  updateBuildPanel(cp);

  const footer = document.getElementById('seed-footer');
  if (footer) {
    const hasBots = state.players.some(p => !p.isHuman);
    footer.textContent = hasBots
      ? i18n.t('game.seedFooterWithDifficulty', { seed: state.mapSeed, difficulty: resolveDifficulty(state.aiDifficulty).label })
      : i18n.t('game.seedFooter', { seed: state.mapSeed });
  }
}

// panel wyboru typu jednostki budowanej w zaznaczonym własnym mieście
function updateBuildPanel(cp) {
  const panel = document.getElementById('build-panel');
  const t = state.selectedCity;
  // niewidoczny (visibility), nie display:none — panel ma zawsze rezerwować
  // swoje miejsce pod mapą, żeby canvas nie zmieniał rozmiaru przy pokazywaniu/ukrywaniu
  const empty = !t || !cp.isHuman || state.phase === 'over';
  panel.classList.toggle('build-panel-empty', empty);
  if (empty) return;
  const box = document.getElementById('build-panel-group');
  box.innerHTML = '';
  for (const key of UNIT_TYPE_ORDER) {
    const btn = document.createElement('button');
    btn.textContent = i18n.t('unit.' + key);
    btn.className = (t.city.buildType || DEFAULT_UNIT_TYPE) === key ? 'selected' : '';
    btn.addEventListener('click', () => { t.city.buildType = key; updateBuildPanel(cp); });
    box.appendChild(btn);
  }
}

// timer tury — aktualizowany co klatkę (osobno od pełnego updateUI, żeby
// nie przebudowywać listy graczy 60x/s)
function updateTimerDisplay(now) {
  if (typeof document === 'undefined' || !state || state.screen !== 'game') return;
  const el = document.getElementById('turn-timer');
  if (!el) return;
  if (state.phase === 'over' || !isFinite(state.timeLimit) || !currentPlayer().isHuman) {
    el.textContent = '';
    el.classList.remove('low');
    return;
  }
  const left = Math.max(0, Math.ceil(state.timeLimit - (now - state.turnStartTime) / 1000));
  el.textContent = i18n.t('game.timer', { s: left });
  el.classList.toggle('low', left <= 10);
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
