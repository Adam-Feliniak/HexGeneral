'use strict';
/* ============================================================
   WEJŚCIE GRACZA — kliknięcia na planszy, wybór imperium, tooltip
   ============================================================ */

// przed pierwszym ruchem gry single-player można wybrać imperium, klikając jego stolicę
// (w hot-seat każdy gracz od startu prowadzi wyznaczone imperium, więc mechanika wyłączona)
function canPickEmpire() {
  return state.mode === 'single' && currentPlayer().isHuman &&
    state.turn === 1 && state.activationsLeft === ACTIVATIONS_PER_TURN;
}

// Czy klik w to konkretne pole przejmuje imperium. Osobno od canPickEmpire(), bo warunek
// mają sprawdzać dwa miejsca (klik i podpowiedź w tooltipie) i rozjazd między nimi
// obiecywałby wybór, którego klik nie wykona. Boss jest wyłączony: switchHuman celowo
// nie rusza slotu `kind === 'boss'` (boss zostaje bossem), więc przejęcie jego stolicy
// zostawiłoby partię bez ani jednego człowieka
function canPickEmpireAt(t) {
  return canPickEmpire() && !!t.city && t.city.capitalOf >= 0 &&
    t.city.capitalOf !== state.human && !isBossPlayer(t.city.capitalOf);
}

function switchHuman(id) {
  state.human = id;
  state.players.forEach(p => {
    // źródłem prawdy jest `kind` (obsada slotu) — isHuman tylko z niego wynika,
    // inaczej oba pola rozjechałyby się przy pierwszej zmianie imperium
    if (p.kind !== 'boss') p.kind = p.id === id ? 'human' : 'bot';
    p.isHuman = p.kind === 'human';
    // porzucone imperium przechodzi pod AI z trudnością tej gry
    if (!p.isHuman && p.difficulty == null) p.difficulty = state.aiDifficulty;
  });
  state.aiPlayers = state.players.filter(p => !p.isHuman).map(p => ({ id: p.id, difficulty: p.difficulty }));
  state.currentPlayerIndex = id;
  state.selected = null;
  addLog(i18n.t('log.empireSwitch', { name: state.players[id].name }));
  showBanner(i18n.t('banner.empireSwitch', { name: state.players[id].name }));
  updateUI();
}

function onTileClick(t) {
  if (!state || state.screen !== 'game' || state.phase === 'over') return;
  const cp = currentPlayer();
  if (!cp.isHuman) return;
  if (state.roadPickFrom) {
    const from = state.roadPickFrom;
    state.roadPickFrom = null;
    if (t !== from) {
      if (roadCost(from, t)) {
        startRoadProject(from, t, cp.id);
        state.selectedCity = from;
        updateUI();
        return;
      }
      // droga musi biec wyłącznie przez własne terytorium — brak trasy albo zły cel
      showBanner(i18n.t('build.roadPickInvalid'));
    }
  }
  state.selectedCity = (t.city && t.owner === cp.id) ? t : null;
  // własne, podłączone złoże bez armii → panel wyboru miasta zaopatrywanego (+1);
  // gdy stoi tam armia, klik ma ją wybrać do ruchu, nie otwierać panelu
  state.selectedResource = (t.resource && t.owner === cp.id && t.road && !t.army && connectedCities(t, cp.id).length)
    ? t : null;
  if (canPickEmpireAt(t)) {
    switchHuman(t.city.capitalOf);
    return;
  }
  const sel = state.selected;
  // legalność ruchu rozstrzyga combat.js (canOrderMove), nie input — ten sam kod ma
  // kiedyś walidować ruch przysłany przez sieć (Documents/15-Silnik-i-przenosnosc.md)
  if (canOrderMove(cp.id, sel, t)) {
    state.activationsLeft -= executeMove(sel, t);
    // jednostka z zapasem punktów ruchu zostaje zaznaczona, żeby dokończyć marsz
    // bez ponownego klikania — kolejny ruch tej samej armii nie kosztuje aktywacji
    state.selected = (t.army && t.army.player === cp.id && armyCanBeOrdered(t)) ? t : null;
    // Turę kończy WYŁĄCZNIE gracz (przycisk / Enter) — po wyczerpaniu ruchów nie
    // oddajemy jej automatycznie, bo zostają decyzje niezależne od puli ruchów:
    // wybór produkcji miasta, budowa drogi, przypisanie złoża, obejrzenie planszy.
    updateUI();
    return;
  }
  if (t.army && t.army.player === cp.id && armyCanBeOrdered(t)) {
    state.selected = (sel === t) ? null : t;
  } else {
    state.selected = null;
  }
  updateUI();
}

function pixelToTile(px, py) {
  let best = null, bestD = Infinity;
  const rApprox = Math.round((py - HEX * 1.2) / (1.5 * HEX));
  for (let r = rApprox - 1; r <= rApprox + 1; r++) {
    if (r < 0 || r >= MAP_H) continue;
    for (let c = 0; c < MAP_W; c++) {
      const { x, y } = hexCenter(c, r);
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bestD) { bestD = d; best = state.tiles[r][c]; }
    }
  }
  return bestD <= HEX * HEX * 1.1 ? best : null;
}

function canvasPos(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (BOARD_PX_W / rect.width),
    y: (ev.clientY - rect.top) * (BOARD_PX_H / rect.height),
  };
}

function tileTooltip(t) {
  const lines = [];
  if (!t.land) lines.push(i18n.t('tooltip.sea'));
  else if (t.owner >= 0) lines.push(i18n.t('tooltip.landOf', { player: state.players[t.owner].name }));
  else lines.push(i18n.t('tooltip.unclaimedLand'));
  if (t.city) {
    lines.push(t.city.capitalOf >= 0
      ? i18n.t('tooltip.capital', { city: t.city.name })
      : i18n.t('tooltip.city', { city: t.city.name }) + (t.city.port ? i18n.t('tooltip.portSuffix') : ''));
    // produkcja tylko dla miast, które mają właściciela — niczyje nic nie produkują
    if (t.owner >= 0) {
      lines.push(i18n.t('tooltip.cityProduction', {
        gain: cityGain(t, t.owner, resourceBonusMap(t.owner).get(t) || 0),
      }));
    }
  }
  if (t.resource) {
    const RES_NAMES = { oil: i18n.t('tooltip.resourceOil'), farm: i18n.t('tooltip.resourceFarm'), mine: i18n.t('tooltip.resourceMine') };
    lines.push(i18n.t('tooltip.resourceBonus', { resource: RES_NAMES[t.resource] }));
    if (t.owner >= 0) {
      const supply = t.road ? supplyCityFor(t, t.owner) : null;
      if (supply) lines.push(i18n.t('tooltip.supplying', { city: supply.city.name }));
      else if (t.road) lines.push(i18n.t('tooltip.roadUnconnected'));
      else lines.push(i18n.t('tooltip.noRoad'));
    }
  }
  if (t.army) {
    const m = Math.min(110, moraleAt(t.army.player, t) + t.army.vet);
    lines.push(i18n.t('tooltip.army', {
      type: i18n.t('unit.' + t.army.type), player: state.players[t.army.player].name, str: t.army.str, morale: m,
    }));
    // punkty ruchu tylko dla własnych jednostek — u wroga byłaby to darmowa informacja
    // wywiadowcza, a gracz i tak nie może nim rozkazywać
    if (t.army.player === currentPlayer().id && currentPlayer().isHuman) {
      lines.push(i18n.t('tooltip.movePoints', { mp: t.army.mp, total: maxMovePoints(t) }));
    }
  }
  if (canPickEmpireAt(t)) {
    lines.push(i18n.t('tooltip.pickEmpireHint'));
  }
  return lines.join('<br>');
}

function initInput() {
  canvas.addEventListener('click', ev => {
    const { x, y } = canvasPos(ev);
    const t = pixelToTile(x, y);
    if (t) onTileClick(t);
  });
  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    state.selected = null;
    state.roadPickFrom = null;
    state.selectedResource = null;
    updateUI();
  });
  canvas.addEventListener('mousemove', ev => {
    const { x, y } = canvasPos(ev);
    hoverTile = pixelToTile(x, y);
    const tip = document.getElementById('tooltip');
    if (hoverTile) {
      tip.innerHTML = tileTooltip(hoverTile);
      tip.hidden = false;
      const wrap = document.getElementById('board-wrap').getBoundingClientRect();
      tip.style.left = Math.min(ev.clientX - wrap.left + 16, wrap.width - 240) + 'px';
      tip.style.top = (ev.clientY - wrap.top + 14) + 'px';
    } else tip.hidden = true;
  });
  canvas.addEventListener('mouseleave', () => {
    hoverTile = null;
    document.getElementById('tooltip').hidden = true;
  });
  document.getElementById('end-turn').addEventListener('click', requestEndTurn);
  document.getElementById('new-game').addEventListener('click', () => { newGame(); kickOffAiGame(); });
  document.getElementById('overlay-btn').addEventListener('click', () => { newGame(); kickOffAiGame(); });
  document.querySelectorAll('#ai-speed-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.aiSpeed = Number(btn.dataset.speed) || 1;
      updateUI();
    });
  });
  document.querySelectorAll('#mark-view-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      setMarkDetailView(btn.dataset.detail === '1');
      updateUI();
    });
  });
  document.addEventListener('keydown', ev => {
    if (!state || state.screen !== 'game') return;
    if (ev.key === 'Enter') requestEndTurn();
    if (ev.key === 'Escape') { state.selected = null; state.selectedCity = null; state.roadPickFrom = null; state.selectedResource = null; updateUI(); }
    // sprawdzenie modyfikatorów, którego Enter i Esc nie potrzebują: bez niego
    // zjadamy Ctrl+D (zakładka). ev.key, nie ev.code — w pomocy stoi litera „D"
    if ((ev.key === 'd' || ev.key === 'D') && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      setMarkDetailView(!isMarkDetailView());
      updateUI();
    }
  });
}
