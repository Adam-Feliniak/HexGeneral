'use strict';
/* ============================================================
   START — uruchomienie gry po wczytaniu wszystkich modułów
   ============================================================ */

if (typeof document !== 'undefined' && canvas) {
  setupCanvas();
  loadSprites();
  initInput();
  initMenu();
  state = { screen: 'menu', mpSetup: { count: MP_PLAYER_COUNTS[2], time: TURN_TIME_LIMIT_DEFAULT } };
  applyScreen();
  requestAnimationFrame(frame);
}
