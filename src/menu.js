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
  // osłona typeof — headless harness ładuje menu.js bez audio.js
  if (typeof updateMusicForScreen === 'function') updateMusicForScreen();
}

function goToScreen(name) {
  state.screen = name;
  if (name === 'sp-setup') renderSpSetup();
  if (name === 'mp-setup') renderMpSetup();
  if (name === 'options') renderOptions();
  if (name === 'save') renderSavePanel();
  applyScreen();
}

// tryb obserwatora: gra złożona z samych botów nie ma ludzkiej tury, która by ją
// napędzała — pierwszą turę AI trzeba odpalić jawnie (dalej pętla tur toczy się sama)
function kickOffAiGame() {
  if (state.phase !== 'over' && !currentPlayer().isHuman) startTurn();
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
  // tryb: gram (1 człowiek + boty) / obserwator (sami botowie, oglądasz partię)
  const modeBox = document.getElementById('sp-mode-group');
  modeBox.innerHTML = '';
  for (const [key, labelKey] of [['play', 'lobby.sp.modePlay'], ['spectate', 'lobby.sp.modeSpectate']]) {
    const btn = document.createElement('button');
    btn.textContent = i18n.t(labelKey);
    btn.className = (setup.spectate ? 'spectate' : 'play') === key ? 'selected' : '';
    btn.addEventListener('click', () => { setup.spectate = key === 'spectate'; renderSpSetup(); });
    modeBox.appendChild(btn);
  }
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

const MP_SLOT_KINDS = ['human', 'bot', 'boss', 'closed'];

// Gotowe układy slotów — same układy siedzą w MP_PRESETS (state.js), tu zostaje tylko
// to, co należy do menu: szybki układ nie zgaduje trudności, bierze domyślną z Opcji,
// tak jak lobby robiło to wcześniej jednym wspólnym wybornikiem
function mpPreset(key) {
  return mpSlots(key, state.options && state.options.defaultDifficulty);
}

function renderMpTransport(setup) {
  const box = document.getElementById('mp-transport-group');
  box.innerHTML = '';
  for (const [key, labelKey] of [['local', 'lobby.mp.transportLocal'], ['net', 'lobby.mp.transportNet']]) {
    const btn = document.createElement('button');
    btn.textContent = i18n.t(labelKey);
    // gra sieciowa ma dziś wyłącznie miejsce w menu i w stanie — transportu nie ma
    const disabled = key === 'net';
    btn.className = (setup.transport === key ? 'selected' : '') + (disabled ? ' disabled' : '');
    btn.disabled = disabled;
    btn.addEventListener('click', () => { setup.transport = key; renderMpSetup(); });
    box.appendChild(btn);
  }
}

function renderMpPresets(setup) {
  const box = document.getElementById('mp-preset-group');
  box.innerHTML = '';
  for (const [key, labelKey] of [['ffa', 'lobby.mp.presetFfa'], ['coop', 'lobby.mp.presetCoop'], ['boss', 'lobby.mp.presetBoss']]) {
    const btn = document.createElement('button');
    btn.textContent = i18n.t(labelKey);
    btn.addEventListener('click', () => { setup.slots = mpPreset(key); renderMpSetup(); });
    box.appendChild(btn);
  }
}

// wspólny szkielet wyborników w wierszu slotu; `items` to pary [wartość, etykieta]
function slotSelect(items, value, disabled, onPick) {
  const sel = document.createElement('select');
  for (const [val, label] of items) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = value;
  sel.disabled = disabled;
  if (!disabled) sel.onchange = () => onPick(sel.value);
  return sel;
}

function renderMpSlots(setup) {
  const box = document.getElementById('mp-slots');
  box.innerHTML = '';
  const teamItems = [];
  for (let t = 0; t < MAX_PLAYERS; t++) {
    teamItems.push([String(t), i18n.t('lobby.mp.team', { team: String.fromCharCode(65 + t) })]);
  }
  setup.slots.forEach((slot, i) => {
    // barwa i nazwa idą z pozycji w tabeli, a u bossa z jego własnego wpisu w PLAYERS_DEF
    // (slotSkin — ta sama reguła, którą newGame nadaje gotowemu graczowi)
    const def = PLAYERS_DEF[slotSkin(slot, i)];
    const row = document.createElement('div');
    row.className = 'slot-row' + (slot.kind === 'closed' ? ' slot-closed' : '');
    row.innerHTML = `<span class="player-dot" style="background:${def.color}"></span>` +
      `<span class="slot-name">${def.name}</span>`;

    row.appendChild(slotSelect(
      MP_SLOT_KINDS.map(k => [k, i18n.t('lobby.mp.slot.' + k)]), slot.kind, false, v => {
        slot.kind = v;
        // boss jest jeden na partię — drugi wybór degraduje poprzedniego do zwykłego bota
        if (v === 'boss') {
          setup.slots.forEach((o, j) => { if (j !== i && o.kind === 'boss') o.kind = 'bot'; });
        }
        renderMpSetup();
      }));

    // trudność per slot: każdy bot (i boss) może być inny, więc nie ma już jednego
    // wspólnego wybornika dla całej partii. U bossa preset jest bazą, na którą
    // playerDifficulty() nakłada BOSS_MULT
    const aiSlot = slot.kind === 'bot' || slot.kind === 'boss';
    row.appendChild(aiSlot
      ? slotSelect(AI_DIFFICULTY_ORDER.map(k => [k, difficultyLabel(AI_DIFFICULTY_PRESETS[k])]),
          slot.difficulty || DEFAULT_AI_DIFFICULTY, false,
          v => { slot.difficulty = v; renderMpSetup(); })
      : slotSelect([['', i18n.t('lobby.mp.noDifficulty')]], '', true));

    row.appendChild(slotSelect(teamItems, String(slot.team), slot.kind === 'closed',
      v => { slot.team = Number(v); renderMpSetup(); }));

    box.appendChild(row);
  });
}

function renderMpSetup() {
  const setup = state.mpSetup;

  renderMpTransport(setup);
  renderMpPresets(setup);
  renderMpSlots(setup);

  // partia bez dwóch drużyn nie ma warunku końca — Start zostaje zablokowany. Ten sam
  // warunek (slotsProblem w state.js) naprawia awaryjnie skład wpuszczony bokiem, więc
  // lobby nie może blokować czegoś, co newGame i tak by przyjęło
  const problem = slotsProblem(setup.slots);
  const warn = document.getElementById('mp-slots-warning');
  warn.hidden = !problem;
  if (problem) warn.textContent = i18n.t('lobby.mp.' + problem);
  document.getElementById('mp-start').disabled = !!problem;

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
  state.spSetup.difficulty = opt.defaultDifficulty;
  // w multi trudność jest per slot, więc domyślna z Opcji spływa na wszystkie sloty AI
  for (const s of state.mpSetup.slots) {
    if (s.kind !== 'human') s.difficulty = opt.defaultDifficulty;
  }
  for (const setup of [state.spSetup, state.mpSetup]) {
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

  renderAudioOptions();
}

// Ustawienia dźwięku nie są częścią state.options ani zapisu gry — to preferencja
// użytkownika trzymana w localStorage (wzorem języka w i18n.js), dlatego czytamy je
// wprost z audio.js. Osłona typeof: headless harness ładuje menu.js bez audio.js.
function renderAudioOptions() {
  if (typeof getAudioSettings !== 'function') return;
  const s = getAudioSettings();
  const mute = document.getElementById('opt-mute');
  if (mute) {
    mute.checked = !!s.muted;
    mute.onchange = () => { setAudioSetting('muted', mute.checked); renderAudioOptions(); };
  }
  for (const [kind, id] of [['master', 'opt-vol-master'], ['music', 'opt-vol-music'], ['sfx', 'opt-vol-sfx']]) {
    const el = document.getElementById(id);
    const out = document.getElementById(id + '-val');
    if (!el) continue;
    el.value = Math.round(s[kind] * 100);
    el.disabled = !!s.muted;
    if (out) out.textContent = el.value + '%';
    el.oninput = () => {
      setAudioSetting(kind, Number(el.value) / 100);
      if (out) out.textContent = el.value + '%';
    };
  }
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
    // obserwator: 0 ludzi, a "liczba botów" oznacza przeciwników jak w trybie gry,
    // więc +1 zastępuje slot gracza (te same rozmiary partii w obu trybach)
    newGame({
      humanCount: s.spectate ? 0 : 1,
      botCount: s.spectate ? s.bots + 1 : s.bots,
      aiDifficulty: effectiveDifficulty(s), seed: s.seedValue,
    });
    kickOffAiGame();
  });
  document.getElementById('mp-start').addEventListener('click', () => {
    const s = state.mpSetup;
    // trudność jedzie w slotach (per gracz), więc lobby nie podaje już jednej wspólnej
    newGame({ slots: s.slots, seed: s.seedValue, timeLimit: s.time, transport: s.transport });
    // pierwszy slot może być botem albo bossem — wtedy partię trzeba ruszyć jawnie
    kickOffAiGame();
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
