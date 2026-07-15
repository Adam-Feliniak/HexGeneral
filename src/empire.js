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
    addLog(`<b>${state.players[playerId].name}</b> zdobywa miasto ${t.city.name}.`);
  } else if (t.city && prevOwner < 0) {
    addLog(`<b>${state.players[playerId].name}</b> zajmuje ${t.city.name}.`);
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
  addLog(`💥 <b>${winner.name}</b> zdobywa stolicę — <b>${loser.name}</b> upada!`);
  showBanner(`${loser.name} zostaje zaanektowana przez ${winner.name}!`);
  checkGameOver();
}

function checkGameOver() {
  const alive = state.players.filter(p => p.alive);
  if (alive.length === 1) {
    state.phase = 'over';
    const win = alive[0];
    if (state.mode === 'multi') {
      showOverlay('★ ZWYCIĘSTWO! ★',
        `Gracz ${win.id + 1}: ${win.name} jednoczy świat w turze ${state.turn}.`);
    } else {
      showOverlay(
        win.isHuman ? '★ MISSION COMPLETE! ★' : 'GAME OVER',
        win.isHuman
          ? `Zjednoczyłeś świat pod sztandarem imperium ${win.name} w turze ${state.turn}.`
          : `Świat podbiło imperium ${win.name}. Spróbuj jeszcze raz!`
      );
    }
  } else if (state.mode === 'single' && !state.players[state.human].alive && state.phase !== 'over') {
    state.phase = 'over';
    showOverlay('GAME OVER', 'Twoja stolica padła. Spróbuj jeszcze raz!');
  }
}
