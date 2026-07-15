'use strict';
/* ============================================================
   MENU — ekran startowy, submenu gry wieloosobowej, nawigacja
   ============================================================ */

function applyScreen() {
  if (typeof document === 'undefined' || !state) return;
  const s = state.screen;
  document.getElementById('app').hidden = s !== 'game';
  document.getElementById('menu-main').hidden = s !== 'menu';
  document.getElementById('menu-mp-setup').hidden = s !== 'mp-setup';
  document.getElementById('menu-options').hidden = s !== 'options';
}

function goToScreen(name) {
  state.screen = name;
  if (name === 'mp-setup') renderMpSetup();
  applyScreen();
}

function timeLimitLabel(t) {
  return isFinite(t) ? `${t}s` : '∞ nieskończony';
}

function renderMpSetup() {
  const countBox = document.getElementById('mp-count-group');
  countBox.innerHTML = '';
  for (const n of MP_PLAYER_COUNTS) {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.className = n === state.mpSetup.count ? 'selected' : '';
    btn.addEventListener('click', () => { state.mpSetup.count = n; renderMpSetup(); });
    countBox.appendChild(btn);
  }

  const timeBox = document.getElementById('mp-time-group');
  timeBox.innerHTML = '';
  for (const t of TURN_TIME_LIMIT_OPTIONS) {
    const btn = document.createElement('button');
    btn.textContent = timeLimitLabel(t);
    btn.className = t === state.mpSetup.time ? 'selected' : '';
    btn.addEventListener('click', () => { state.mpSetup.time = t; renderMpSetup(); });
    timeBox.appendChild(btn);
  }
}

function initMenu() {
  document.getElementById('menu-single').addEventListener('click', () => {
    newGame({ mode: 'single', playerCount: 4 });
  });
  document.getElementById('menu-multi').addEventListener('click', () => goToScreen('mp-setup'));
  document.getElementById('menu-options').addEventListener('click', () => goToScreen('options'));
  document.getElementById('menu-exit').addEventListener('click', () => location.reload());
  document.getElementById('mp-back').addEventListener('click', () => goToScreen('menu'));
  document.getElementById('options-back').addEventListener('click', () => goToScreen('menu'));
  document.getElementById('mp-start').addEventListener('click', () => {
    newGame({ mode: 'multi', playerCount: state.mpSetup.count, timeLimit: state.mpSetup.time });
  });
  document.getElementById('menu-btn').addEventListener('click', () => goToScreen('menu'));
  document.getElementById('overlay-menu-btn').addEventListener('click', () => {
    hideOverlay();
    goToScreen('menu');
  });
}
