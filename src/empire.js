'use strict';
/* ============================================================
   PODBOJE — zajmowanie pól, upadek imperiów, koniec gry
   ============================================================ */

function captureTile(t, playerId) {
  // pole sojusznika zostaje jego: przemarsz przez terytorium drużyny niczego nie przejmuje.
  // Skutek uboczny, i to zamierzony: stolica sojusznika nie może paść z naszej ręki
  if (t.owner >= 0 && t.owner !== playerId && sameTeam(t.owner, playerId)) return;
  const prevOwner = t.owner;
  if (t.land) t.owner = playerId;
  const isCapitalFall = t.city && t.city.capitalOf >= 0 && t.city.capitalOf !== playerId;
  if (!isCapitalFall && prevOwner !== playerId) {
    // pojedyncze zajęcie pola (nie cała stolica) — heks drogi wroga pęka (sieć się
    // rozspójnia na tym polu); złoże traci przypisane miasto zaopatrywane
    if (t.road) t.road = null;
    if (t.resource) t.supplyCity = null;
    // zajęte miasto porzuca swój projekt drogi (już położone heksy zostają w sieci)
    if (t.city) { cancelRoadProject(t); t.city.buildType = DEFAULT_UNIT_TYPE; }
  } else if (isCapitalFall && t.road) {
    t.road.owner = playerId; // stolica pada razem z całym imperium — jej heks drogi też przechodzi
  }
  if (isCapitalFall) {
    conquerEmpire(t.city.capitalOf, playerId);
    t.city.capitalOf = -1; // zdobyta stolica staje się zwykłym miastem
  } else if (t.city && prevOwner !== playerId && prevOwner >= 0) {
    addLog(i18n.t('log.captureCity', { player: state.players[playerId].name, city: t.city.name }));
    if (typeof playSfx === 'function') playSfx('city');
  } else if (t.city && prevOwner < 0) {
    addLog(i18n.t('log.claimCity', { player: state.players[playerId].name, city: t.city.name }));
    if (typeof playSfx === 'function') playSfx('city');
  }
  // uwaga: dźwięk tylko w gałęziach z miastem — captureTile odpala się przy KAŻDYM
  // zajętym polu, więc warunek na t.city jest tu konieczny
}

function conquerEmpire(loserId, winnerId) {
  const loser = state.players[loserId];
  const winner = state.players[winnerId];
  loser.alive = false;
  for (const row of state.tiles) for (const t of row) {
    if (t.owner === loserId) {
      t.owner = winnerId;
      // aneksja przenosi całą infrastrukturę pokonanego — jego heksy drogi stają się
      // własną siecią zwycięzcy; projekty budowy porzucamy (zwycięzca zbuduje od nowa)
      if (t.road) t.road.owner = winnerId;
      if (t.city && t.city.roadProject) t.city.roadProject = null;
    }
    if (t.army && t.army.player === loserId) t.army = null;
  }
  addLog(i18n.t('log.conquerEmpire', { winner: winner.name, loser: loser.name }));
  showBanner(i18n.t('banner.empireAnnexed', { loser: loser.name, winner: winner.name }));
  if (typeof playSfx === 'function') playSfx('annex');
  checkGameOver();
}

// koniec gry = zostaje JEDNA żywa drużyna (przy FFA każdy jest własną drużyną, więc
// to dokładnie dawny warunek „ostatnie żywe imperium")
function checkGameOver() {
  const alive = state.players.filter(p => p.alive);
  const teamsLeft = new Set(alive.map(p => p.team));
  if (alive.length && teamsLeft.size === 1) {
    state.phase = 'over';
    // rozstrzygnięta partia znika z autozapisu („Kontynuuj" jej nie wskrzesza);
    // osłona typeof — headless sim/harness ładuje empire.js bez save.js
    if (typeof clearAutosave === 'function') clearAutosave();
    const win = alive[0];
    const teamWin = alive.length > 1; // wygrana drużyny, nie pojedynczego imperium
    const names = alive.map(p => p.name).join(', ');
    // muzyka milknie, żeby sting końcowy nie kolidował z pętlą
    if (typeof stopMusic === 'function') stopMusic();
    if (state.mode === 'multi') {
      showOverlay(
        teamWin ? i18n.t('overlay.victoryTeamTitle') : i18n.t('overlay.victoryMultiTitle'),
        teamWin
          ? i18n.t('overlay.victoryTeamText', { names, turn: state.turn })
          : i18n.t('overlay.victoryMultiText', { n: win.id + 1, name: win.name, turn: state.turn }));
      if (typeof playSfx === 'function') playSfx('victory');
    } else {
      // w single liczy się los imperium gracza, a nie to, kto stoi pierwszy w `alive`
      const humanWon = alive.some(p => p.id === state.human);
      showOverlay(
        humanWon ? i18n.t('overlay.missionCompleteTitle') : i18n.t('overlay.gameOverTitle'),
        humanWon
          ? i18n.t('overlay.missionCompleteText', { name: state.players[state.human].name, turn: state.turn })
          : i18n.t('overlay.aiWinsText', { name: win.name })
      );
      if (typeof playSfx === 'function') playSfx(humanWon ? 'victory' : 'defeat');
    }
  } else if (state.mode === 'single' && !teamHasAlive(state.human) && state.phase !== 'over') {
    state.phase = 'over';
    if (typeof clearAutosave === 'function') clearAutosave();
    if (typeof stopMusic === 'function') stopMusic();
    showOverlay(i18n.t('overlay.gameOverTitle'), i18n.t('overlay.capitalFellText'));
    if (typeof playSfx === 'function') playSfx('defeat');
  }
}
