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
    : cp.isHuman ? i18n.t('game.orders', { orders: state.activationsLeft, total: ACTIVATIONS_PER_TURN })
    : i18n.t('game.enemyMoving');
  document.getElementById('turn-player-label').textContent =
    state.phase === 'over' ? ''
    : state.mode === 'multi'
      ? (cp.isHuman ? i18n.t('game.yourTurnMulti', { n: cp.id + 1, name: cp.name }) : i18n.t('game.botTurnMulti', { name: cp.name }))
      : '';
  const endBtn = document.getElementById('end-turn');
  endBtn.disabled = state.phase === 'over' || !cp.isHuman;
  // miga, gdy nie da się już nic rozkazać: brak aktywacji ALBO żadna jednostka nie
  // ma punktów ruchu. hasMovableArmy() sprawdza oba warunki naraz (armyCanBeOrdered),
  // więc wystarczy samo to wywołanie
  endBtn.classList.toggle('blink',
    cp.isHuman && state.phase !== 'over' && !hasMovableArmy(cp.id));
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
    const diffBadge = !p.isHuman ? `<span class="diff-badge">${difficultyLabel(resolveDifficulty(p.difficulty))}</span>` : '';
    div.innerHTML =
      `<span class="player-dot" style="background:${p.color}"></span>` +
      `<span class="player-name">${icon} ${p.name}${tyTag}${diffBadge}</span>` +
      `<span class="player-stats">🏛 ${cities} ⛏ ${res} ⚔ ${str} 💰 ${playerProduction(p.id)}</span>`;
    box.appendChild(div);
  }

  // panel tempa AI ma sens tylko, gdy w grze są boty (obserwator albo gra z botami)
  const speedField = document.getElementById('ai-speed-field');
  if (speedField) {
    speedField.hidden = !state.players.some(p => !p.isHuman);
    document.querySelectorAll('#ai-speed-group button').forEach(btn => {
      btn.className = Number(btn.dataset.speed) === (state.aiSpeed || 1) ? 'selected' : '';
    });
  }

  updateBuildPanel(cp);

  const footer = document.getElementById('seed-footer');
  if (footer) {
    const hasBots = state.players.some(p => !p.isHuman);
    footer.textContent = hasBots
      ? i18n.t('game.seedFooterWithDifficulty', { seed: state.mapSeed, difficulty: difficultyLabel(resolveDifficulty(state.aiDifficulty)) })
      : i18n.t('game.seedFooter', { seed: state.mapSeed });
  }
}

// panel pod mapą: produkcja w zaznaczonym mieście ALBO wybór miasta zaopatrywanego
// przez zaznaczone złoże
function updateBuildPanel(cp) {
  const panel = document.getElementById('build-panel');
  const city = state.selectedCity;
  const res = state.selectedResource;
  // niewidoczny (visibility), nie display:none — panel ma zawsze rezerwować
  // swoje miejsce pod mapą, żeby canvas nie zmieniał rozmiaru przy pokazywaniu/ukrywaniu
  const empty = (!city && !res) || !cp.isHuman || state.phase === 'over';
  panel.classList.toggle('build-panel-empty', empty);
  if (empty) return;
  const title = document.getElementById('build-panel-title');
  const box = document.getElementById('build-panel-group');
  box.innerHTML = '';

  if (city) { updateCityPanel(cp, city, title, box); return; }
  updateResourcePanel(cp, res, title, box);
}

function updateCityPanel(cp, t, title, box) {
  title.textContent = i18n.t('build.panelTitle');
  if (state.roadPickFrom === t) {
    box.appendChild(buildHint(i18n.t('build.roadPickHint')));
    box.appendChild(buildButton(i18n.t('build.roadPickCancel'), () => {
      state.roadPickFrom = null;
      updateBuildPanel(cp);
    }));
    return;
  }
  if (t.city.roadProject) {
    const proj = t.city.roadProject;
    box.appendChild(buildHint(i18n.t('build.roadProgress', { progress: proj.progress, cost: proj.cost })));
    box.appendChild(buildButton(i18n.t('build.roadCancel'), () => {
      cancelRoadProject(t);
      updateBuildPanel(cp);
    }));
    return;
  }
  for (const key of UNIT_TYPE_ORDER) {
    const btn = buildButton(i18n.t('unit.' + key), () => { t.city.buildType = key; updateBuildPanel(cp); });
    btn.className = (t.city.buildType || DEFAULT_UNIT_TYPE) === key ? 'selected' : '';
    box.appendChild(btn);
  }
  box.appendChild(buildButton(i18n.t('build.roadButton'), () => {
    state.roadPickFrom = t;
    updateBuildPanel(cp);
  }));
}

// wybór miasta, które dostaje +1 z tego złoża — domyślnie najbliższe podłączone
function updateResourcePanel(cp, t, title, box) {
  title.textContent = i18n.t('build.supplyTitle');
  const cities = connectedCities(t, cp.id);
  const current = supplyCityFor(t, cp.id);
  for (const c of cities) {
    const btn = buildButton(c.city.name, () => { t.supplyCity = c; updateBuildPanel(cp); });
    btn.className = c === current ? 'selected' : '';
    box.appendChild(btn);
  }
}

function buildButton(label, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function buildHint(text) {
  const el = document.createElement('div');
  el.className = 'build-hint';
  el.textContent = text;
  return el;
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
