'use strict';
/* ============================================================
   MENU — ekran startowy, lobby (single/multi), opcje, nawigacja
   ============================================================ */

function applyScreen() {
  if (typeof document === 'undefined' || !state) return;
  const s = state.screen;
  document.getElementById('app').hidden = s !== 'game';
  document.getElementById('menu-main').hidden = s !== 'menu';
  document.getElementById('menu-sp-setup').hidden = s !== 'sp-setup';
  document.getElementById('menu-mp-setup').hidden = s !== 'mp-setup';
  document.getElementById('menu-tutorial').hidden = s !== 'tutorial';
  document.getElementById('menu-options').hidden = s !== 'options';
  document.getElementById('menu-save').hidden = s !== 'save';
  if (s === 'menu') refreshMainMenu();
}

function goToScreen(name) {
  state.screen = name;
  if (name === 'sp-setup') renderSpSetup();
  if (name === 'mp-setup') renderMpSetup();
  if (name === 'options') renderOptions();
  if (name === 'save') renderSavePanel();
  applyScreen();
}

// widoczność i etykieta „Kontynuuj" w menu głównym (autozapis z save.js)
function refreshMainMenu() {
  const btn = document.getElementById('menu-continue');
  if (!btn) return;
  const meta = hasAutosave();
  btn.hidden = !meta;
  if (meta) btn.textContent = i18n.t('menu.continue', { turn: meta.turn });
}

function renderSavePanel() {
  document.getElementById('save-textarea').value = '';
  document.getElementById('save-status').textContent = '';
}

function timeLimitLabel(t) {
  return isFinite(t) ? i18n.t('lobby.mp.timeSeconds', { s: t }) : i18n.t('lobby.mp.noLimit');
}

// trudność wybrana w lobby -> wartość do newGame() (klucz presetu albo liczba 0-100)
function effectiveDifficulty(setup) {
  return setup.difficulty === 'custom' ? setup.customDiff : setup.difficulty;
}

// ogranicza pole seeda do max SEED_MAX_DIGITS cyfr — przycina tekst w polu
// (type=number ignoruje maxlength) i zwraca sparsowaną wartość
function clampSeedInput(input) {
  const digits = input.value.replace(/[^0-9]/g, '').slice(0, SEED_MAX_DIGITS);
  if (digits !== input.value) input.value = digits;
  const v = parseInt(digits, 10);
  return Number.isFinite(v) ? Math.min(v, SEED_MAX_VALUE) : null;
}

// wspólny wybornik trudności (Easy/Normal/Hard/Nightmare/Custom + suwak) — używany
// zarówno w lobby single, jak i multi
function renderDifficultyGroup(groupId, customWrapId, sliderId, sliderValId, setup, onChange) {
  const box = document.getElementById(groupId);
  box.innerHTML = '';
  for (const key of AI_DIFFICULTY_ORDER) {
    const btn = document.createElement('button');
    btn.textContent = difficultyLabel(AI_DIFFICULTY_PRESETS[key]);
    btn.className = setup.difficulty === key ? 'selected' : '';
    btn.addEventListener('click', () => { setup.difficulty = key; onChange(); });
    box.appendChild(btn);
  }
  const customBtn = document.createElement('button');
  customBtn.textContent = i18n.t('lobby.common.custom');
  customBtn.className = setup.difficulty === 'custom' ? 'selected' : '';
  customBtn.addEventListener('click', () => { setup.difficulty = 'custom'; onChange(); });
  box.appendChild(customBtn);

  const wrap = document.getElementById(customWrapId);
  wrap.hidden = setup.difficulty !== 'custom';
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(sliderValId);
  slider.value = setup.customDiff;
  valEl.textContent = `${setup.customDiff}%`;
  slider.oninput = () => {
    setup.customDiff = Number(slider.value);
    valEl.textContent = `${setup.customDiff}%`;
  };
}

// wspólny wybornik seeda (Losowy/Własny) — Losowy od razu losuje i pokazuje konkretną
// liczbę (żeby dało się ją zobaczyć w lobby, patrz #...-seed-preview), Własny odsłania pole
function renderSeedGroup(groupId, inputId, previewId, setup, onChange) {
  const box = document.getElementById(groupId);
  box.innerHTML = '';
  const randBtn = document.createElement('button');
  randBtn.textContent = i18n.t('lobby.common.random');
  randBtn.className = setup.seedMode === 'random' ? 'selected' : '';
  randBtn.addEventListener('click', () => {
    setup.seedMode = 'random';
    setup.seedValue = randomSeed();
    onChange();
  });
  box.appendChild(randBtn);
  const customBtn = document.createElement('button');
  customBtn.textContent = i18n.t('lobby.common.custom');
  customBtn.className = setup.seedMode === 'custom' ? 'selected' : '';
  customBtn.addEventListener('click', () => { setup.seedMode = 'custom'; onChange(); });
  box.appendChild(customBtn);

  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  input.hidden = setup.seedMode !== 'custom';
  input.value = setup.seedValue;
  input.oninput = () => {
    const v = clampSeedInput(input);
    setup.seedValue = v !== null ? v : setup.seedValue;
    preview.textContent = i18n.t('lobby.common.seedPreview', { seed: setup.seedValue });
  };
  preview.textContent = i18n.t('lobby.common.seedPreview', { seed: setup.seedValue });
}

function renderSpSetup() {
  const setup = state.spSetup;
  const botsBox = document.getElementById('sp-bots-group');
  botsBox.innerHTML = '';
  for (const n of SP_BOT_COUNT_OPTIONS) {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.className = n === setup.bots ? 'selected' : '';
    btn.addEventListener('click', () => { setup.bots = n; renderSpSetup(); });
    botsBox.appendChild(btn);
  }
  renderDifficultyGroup('sp-diff-group', 'sp-diff-custom-wrap', 'sp-diff-slider', 'sp-diff-slider-val', setup, renderSpSetup);
  renderSeedGroup('sp-seed-group', 'sp-seed-input', 'sp-seed-preview', setup, renderSpSetup);
}

function renderMpSetup() {
  const setup = state.mpSetup;
  const maxBots = 6 - setup.count; // gracze + boty razem <= 6 imperiów
  if (setup.bots > maxBots) setup.bots = Math.max(0, maxBots);

  const countBox = document.getElementById('mp-count-group');
  countBox.innerHTML = '';
  for (const n of MP_PLAYER_COUNTS) {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.className = n === setup.count ? 'selected' : '';
    btn.addEventListener('click', () => { setup.count = n; renderMpSetup(); });
    countBox.appendChild(btn);
  }

  const botsBox = document.getElementById('mp-bots-group');
  botsBox.innerHTML = '';
  for (const n of BOT_COUNT_OPTIONS) {
    const disabled = n > maxBots;
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.className = (n === setup.bots ? 'selected' : '') + (disabled ? ' disabled' : '');
    btn.disabled = disabled;
    btn.addEventListener('click', () => { setup.bots = n; renderMpSetup(); });
    botsBox.appendChild(btn);
  }

  document.getElementById('mp-diff-field').hidden = setup.bots === 0;
  if (setup.bots > 0) {
    renderDifficultyGroup('mp-diff-group', 'mp-diff-custom-wrap', 'mp-diff-slider', 'mp-diff-slider-val', setup, renderMpSetup);
  }

  renderSeedGroup('mp-seed-group', 'mp-seed-input', 'mp-seed-preview', setup, renderMpSetup);

  const timeBox = document.getElementById('mp-time-group');
  timeBox.innerHTML = '';
  for (const t of TURN_TIME_LIMIT_OPTIONS) {
    const btn = document.createElement('button');
    btn.textContent = timeLimitLabel(t);
    btn.className = t === setup.time ? 'selected' : '';
    btn.addEventListener('click', () => { setup.time = t; renderMpSetup(); });
    timeBox.appendChild(btn);
  }
}

// domyślny seed/trudność z Opcji spływają od razu do obu lobby (single/multi),
// żeby przy kolejnym wejściu w submenu były już ustawione
function applyOptionsToSetups() {
  const opt = state.options;
  for (const setup of [state.spSetup, state.mpSetup]) {
    setup.difficulty = opt.defaultDifficulty;
    if (opt.defaultSeed != null) { setup.seedMode = 'custom'; setup.seedValue = opt.defaultSeed; }
    else { setup.seedMode = 'random'; setup.seedValue = randomSeed(); }
  }
}

function renderOptions() {
  const opt = state.options;
  const seedBox = document.getElementById('opt-seed-group');
  seedBox.innerHTML = '';
  const noneBtn = document.createElement('button');
  noneBtn.textContent = i18n.t('lobby.common.noneRandom');
  noneBtn.className = opt.defaultSeed == null ? 'selected' : '';
  noneBtn.addEventListener('click', () => { opt.defaultSeed = null; applyOptionsToSetups(); renderOptions(); });
  seedBox.appendChild(noneBtn);
  const customBtn = document.createElement('button');
  customBtn.textContent = i18n.t('lobby.common.custom');
  customBtn.className = opt.defaultSeed != null ? 'selected' : '';
  customBtn.addEventListener('click', () => {
    if (opt.defaultSeed == null) opt.defaultSeed = randomSeed();
    applyOptionsToSetups();
    renderOptions();
  });
  seedBox.appendChild(customBtn);

  const input = document.getElementById('opt-seed-input');
  input.hidden = opt.defaultSeed == null;
  input.value = opt.defaultSeed != null ? opt.defaultSeed : '';
  input.oninput = () => {
    const v = clampSeedInput(input);
    if (v !== null) { opt.defaultSeed = v; applyOptionsToSetups(); }
  };

  const select = document.getElementById('opt-diff-select');
  select.value = opt.defaultDifficulty;
  select.onchange = () => { opt.defaultDifficulty = select.value; applyOptionsToSetups(); };
}

function renderLangPicker() {
  const box = document.getElementById('lang-picker');
  if (!box) return;
  box.innerHTML = '';
  for (const lang of I18N_LANGS) {
    const btn = document.createElement('button');
    btn.textContent = lang.toUpperCase();
    btn.className = i18n.lang === lang ? 'selected' : '';
    btn.addEventListener('click', () => { i18n.setLanguage(lang); applyI18n(); });
    box.appendChild(btn);
  }
}

function initMenu() {
  renderLangPicker();
  document.getElementById('menu-continue').addEventListener('click', () => { loadAutosave(); });
  document.getElementById('menu-save-btn').addEventListener('click', () => goToScreen('save'));
  document.getElementById('save-back').addEventListener('click', () => goToScreen('menu'));
  document.getElementById('save-show').addEventListener('click', () => {
    const ta = document.getElementById('save-textarea');
    const status = document.getElementById('save-status');
    const txt = exportSaveText();
    if (txt) {
      ta.value = txt;
      ta.focus();
      ta.select(); // zaznaczone — wystarczy Ctrl+C (navigator.clipboard bywa niedostępny na file://)
      status.textContent = i18n.t('save.selected');
    } else {
      status.textContent = i18n.t('save.empty');
    }
  });
  document.getElementById('save-load').addEventListener('click', () => {
    const ta = document.getElementById('save-textarea');
    const status = document.getElementById('save-status');
    const text = ta.value.trim();
    if (!text) { status.textContent = i18n.t('save.corrupt'); return; }
    const res = importSaveText(text);
    // 'ok' sam przełącza ekran na grę (resumeLoadedGame -> applyScreen)
    if (res !== 'ok') status.textContent = i18n.t(res === 'incompatible' ? 'save.incompatible' : 'save.corrupt');
  });
  document.getElementById('menu-single').addEventListener('click', () => goToScreen('sp-setup'));
  document.getElementById('menu-multi').addEventListener('click', () => goToScreen('mp-setup'));
  document.getElementById('menu-tutorial-btn').addEventListener('click', () => goToScreen('tutorial'));
  document.getElementById('menu-options-btn').addEventListener('click', () => goToScreen('options'));
  document.getElementById('menu-exit').addEventListener('click', () => location.reload());
  document.getElementById('sp-back').addEventListener('click', () => goToScreen('menu'));
  document.getElementById('mp-back').addEventListener('click', () => goToScreen('menu'));
  document.getElementById('tutorial-back').addEventListener('click', () => goToScreen('menu'));
  document.getElementById('options-back').addEventListener('click', () => goToScreen('menu'));

  document.getElementById('sp-start').addEventListener('click', () => {
    const s = state.spSetup;
    newGame({ humanCount: 1, botCount: s.bots, aiDifficulty: effectiveDifficulty(s), seed: s.seedValue });
  });
  document.getElementById('mp-start').addEventListener('click', () => {
    const s = state.mpSetup;
    newGame({
      humanCount: s.count, botCount: s.bots, aiDifficulty: effectiveDifficulty(s),
      seed: s.seedValue, timeLimit: s.time,
    });
  });

  // wyjście do menu w trakcie gry — zapisz partię (także w trakcie tury AI:
  // wczytanie wznowi wtedy turę AI od nowa, patrz resumeLoadedGame w save.js)
  document.getElementById('menu-btn').addEventListener('click', () => {
    autosave();
    goToScreen('menu');
  });
  document.getElementById('overlay-menu-btn').addEventListener('click', () => {
    hideOverlay();
    goToScreen('menu');
  });
}
