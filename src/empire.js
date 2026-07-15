'use strict';
/* ============================================================
   PODBOJE — zajmowanie pól, upadek imperiów, koniec gry
   ============================================================ */

function captureTile(t, playerId) {
  const prevOwner = t.owner;
  if (t.land) t.owner = playerId;
  if (t.resource && prevOwner !== playerId) establishRoad(t, playerId);
  if (t.city && t.city.capitalOf >= 0 && t.city.capitalOf !== playerId) {
    conquerEmpire(t.city.capitalOf, playerId);
    t.city.capitalOf = -1; // zdobyta stolica staje się zwykłym miastem
  } else if (t.city && prevOwner !== playerId && prevOwner >= 0) {
    addLog(i18n.t('log.captureCity', { player: state.players[playerId].name, city: t.city.name }));
  } else if (t.city && prevOwner < 0) {
    addLog(i18n.t('log.claimCity', { player: state.players[playerId].name, city: t.city.name }));
  }
}

function conquerEmpire(loserId, winnerId) {
  const loser = state.players[loserId];
  const winner = state.players[winnerId];
  loser.alive = false;
  const transferredResources = [];
  for (const row of state.tiles) for (const t of row) {
    if (t.owner === loserId) {
      t.owner = winnerId;
      if (t.resource) transferredResources.push(t);
    }
    if (t.army && t.army.player === loserId) t.army = null;
  }
  // aneksja to też zmiana właściciela — złoża dostają świeżo wytyczone drogi
  for (const t of transferredResources) establishRoad(t, winnerId);
  addLog(i18n.t('log.conquerEmpire', { winner: winner.name, loser: loser.name }));
  showBanner(i18n.t('banner.empireAnnexed', { loser: loser.name, winner: winner.name }));
  checkGameOver();
}

function checkGameOver() {
  const alive = state.players.filter(p => p.alive);
  if (alive.length === 1) {
    state.phase = 'over';
    const win = alive[0];
    if (state.mode === 'multi') {
      showOverlay(i18n.t('overlay.victoryMultiTitle'),
        i18n.t('overlay.victoryMultiText', { n: win.id + 1, name: win.name, turn: state.turn }));
    } else {
      showOverlay(
        win.isHuman ? i18n.t('overlay.missionCompleteTitle') : i18n.t('overlay.gameOverTitle'),
        win.isHuman
          ? i18n.t('overlay.missionCompleteText', { name: win.name, turn: state.turn })
          : i18n.t('overlay.aiWinsText', { name: win.name })
      );
    }
  } else if (state.mode === 'single' && !state.players[state.human].alive && state.phase !== 'over') {
    state.phase = 'over';
    showOverlay(i18n.t('overlay.gameOverTitle'), i18n.t('overlay.capitalFellText'));
  }
}
