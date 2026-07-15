'use strict';
/* ============================================================
   START — uruchomienie gry po wczytaniu wszystkich modułów
   ============================================================ */

if (typeof document !== 'undefined' && canvas) {
  setupCanvas();
  loadSprites();
  initInput();
  newGame();
  requestAnimationFrame(frame);
}
