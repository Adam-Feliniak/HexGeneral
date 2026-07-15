'use strict';
/* ============================================================
   START — uruchomienie gry po wczytaniu wszystkich modułów
   ============================================================ */

if (typeof document !== 'undefined' && canvas) {
  setupCanvas();
  loadSprites();
  initInput();
  initMenu();
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
