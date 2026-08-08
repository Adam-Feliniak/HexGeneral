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
  // Ta sama informacja co w stopce, celowo zdublowana: stopke da sie ukryc
  // jednym CSS-em przy rehostingu, notki w konsoli trzeba juz szukac w kodzie.
  console.log('Hex General v' + GAME_VERSION + ' — ' + GAME_COPYRIGHT
    + '\nAll rights reserved. See LICENSE for terms.');
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
