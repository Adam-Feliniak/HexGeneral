'use strict';
/* ============================================================
   START — uruchomienie gry po wczytaniu wszystkich modułów
   ============================================================ */

if (typeof document !== 'undefined' && canvas) {
  setupCanvas();
  loadSprites();
  initAudio();
  initInput();
  initMenu();
  const vt = document.getElementById('version-tag');
  if (vt) vt.textContent = 'v' + GAME_VERSION + (BUILD_TAG ? ' · ' + BUILD_TAG : '');
  const ct = document.getElementById('copyright-tag');
  if (ct) ct.textContent = GAME_COPYRIGHT;
  state = {
    screen: 'menu',
    spSetup: defaultSpSetup(),
    mpSetup: defaultMpSetup(),
    options: defaultOptions(),
  };
  applyScreen();
  applyI18n();
  requestAnimationFrame(frame);
}
