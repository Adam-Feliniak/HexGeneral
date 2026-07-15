'use strict';
/* ============================================================
   RUCH I WALKA — morale, siła bojowa, rozstrzyganie bitew
   ============================================================ */

function moraleAt(playerId, t) {
  // morale zależy od odległości do najbliższego własnego miasta —
  // podbijanie miast przesuwa front morale do przodu
  let d = Infinity;
  for (const row of state.tiles) for (const o of row) {
    if (o.city && o.owner === playerId) {
      const dd = hexDist(t.c, t.r, o.c, o.r);
      if (dd < d) d = dd;
    }
  }
  if (!isFinite(d)) d = 8;
  let m = 100 - 7 * d;
  m = Math.max(40, m);
  if (t.city && t.owner === playerId) m += 5;
  if (!t.land) m -= 15;
  return Math.max(25, Math.min(100, m));
}

function armyPowerAt(army, t) {
  const m = Math.min(110, moraleAt(army.player, t) + army.vet);
  return army.str * m / 100;
}

function canStep(from, to, playerId) {
  if (!to) return false;
  if (hexDist(from.c, from.r, to.c, to.r) !== 1) return false;
  if (to.land) {
    if (to.army && to.army.player === playerId && to.army.str >= MAX_ARMY) return false;
    return true;
  }
  // wejście na morze: z morza albo z portu
  const fromSea = !from.land;
  const fromPort = !!(from.city && from.city.port && from.owner === playerId);
  if (!fromSea && !fromPort) return false;
  if (to.army && to.army.player === playerId && to.army.str >= MAX_ARMY) return false;
  return true;
}

// limit ruchów jednostki w tej turze — 1, albo 2 gdy stoi na aktywnej drodze
function moveCap(t) {
  if (!t.army) return 0;
  return tileOnRoad(t, t.army.player) ? 2 : 1;
}

function validMoves(t) {
  if (!t.army) return [];
  return neighborsOf(t).filter(n => canStep(t, n, t.army.player));
}

function supportFor(playerId, battleTile, excludeTile) {
  let s = 0;
  for (const n of neighborsOf(battleTile)) {
    if (n === excludeTile) continue;
    if (n.army && n.army.player === playerId) s += n.army.str;
  }
  return s;
}

function resolveBattle(from, to) {
  const att = from.army, def = to.army;
  let aPow = armyPowerAt(att, to) + 0.12 * supportFor(att.player, to, from);
  let dPow = armyPowerAt(def, to) + 0.12 * supportFor(def.player, to, null);
  if (to.city) dPow *= (to.city.capitalOf >= 0 ? 1.25 : 1.15);
  aPow *= rnd(0.92, 1.08);
  dPow *= rnd(0.92, 1.08);

  const c = hexCenter(to.c, to.r);
  effects.push({ x: c.x, y: c.y, t: 0 });
  if (aPow > dPow) {
    const loss = Math.min(att.str - 1, Math.round(att.str * 0.75 * (dPow / aPow)));
    att.str -= loss;
    att.vet = Math.min(15, att.vet + 4);
    floaters.push({ x: c.x, y: c.y, text: `-${def.str}`, color: '#ff7b7b', t: 0 });
    addLog(i18n.t('log.battleWon', { winner: state.players[att.player].name, defStr: def.str, loss }));
    to.army = null;
    return true;
  } else {
    const loss = Math.min(def.str - 1, Math.round(def.str * 0.75 * (aPow / dPow)));
    def.str -= loss;
    def.vet = Math.min(15, def.vet + 4);
    floaters.push({ x: c.x, y: c.y, text: `-${att.str}`, color: '#ffd27b', t: 0 });
    addLog(i18n.t('log.battleLost', { attacker: state.players[att.player].name, attStr: att.str, loss }));
    from.army = null;
    return false;
  }
}

// wykonuje ruch armii (zakłada, że jest legalny); zwraca true jeśli ruch doszedł do skutku
function executeMove(from, to) {
  const army = from.army;
  if (to.army && to.army.player !== army.player) {
    const won = resolveBattle(from, to);
    if (!won) { updateUI(); return true; } // armia atakująca zniszczona — ruch zużyty
  }
  if (to.army && to.army.player === army.player) {
    // łączenie armii
    to.army.str = Math.min(MAX_ARMY, to.army.str + army.str);
    to.army.vet = Math.max(to.army.vet, army.vet);
    to.army.movesUsed = Infinity;
    from.army = null;
  } else {
    from.army = null;
    to.army = army;
    army.movesUsed++;
    captureTile(to, army.player);
  }
  const a = hexCenter(from.c, from.r), b = hexCenter(to.c, to.r);
  anims.push({ tile: to, x0: a.x, y0: a.y, x1: b.x, y1: b.y, t: 0 });
  updateUI();
  return true;
}
