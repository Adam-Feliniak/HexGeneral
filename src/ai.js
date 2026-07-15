'use strict';
/* ============================================================
   AI — wybór celów i ruchów dla imperiów sterowanych komputerowo
   ============================================================ */

function aiTargets(playerId) {
  const targets = [];
  for (const row of state.tiles) for (const t of row) {
    if (t.resource && t.owner !== playerId) { targets.push({ t, val: 7 }); continue; }
    if (!t.city) continue;
    if (t.owner === playerId) continue;
    let val;
    if (t.city.capitalOf >= 0 && state.players[t.city.capitalOf].alive) val = 30;
    else if (t.owner < 0) val = 14;
    else val = 10;
    targets.push({ t, val });
  }
  return targets;
}

function aiPickMove(playerId) {
  const armies = [];
  for (const row of state.tiles) for (const t of row) {
    if (t.army && t.army.player === playerId && t.army.movesUsed < moveCap(t)) armies.push(t);
  }
  if (!armies.length) return null;
  armies.sort((a, b) => b.army.str - a.army.str);
  const targets = aiTargets(playerId);
  const me = state.players[playerId];
  const [capC, capR] = me.capital;

  // czy stolica zagrożona?
  let threat = null;
  for (const row of state.tiles) for (const t of row) {
    if (t.army && t.army.player !== playerId &&
        hexDist(t.c, t.r, capC, capR) <= 2 &&
        state.players[t.army.player].alive) {
      threat = t; break;
    }
  }

  let best = null; // { from, to, score }
  for (const from of armies) {
    const moves = validMoves(from);
    for (const to of moves) {
      let score = -Infinity;
      const myPow = armyPowerAt(from.army, to) + 0.12 * supportFor(playerId, to, from);
      if (to.army && to.army.player !== playerId) {
        let defPow = armyPowerAt(to.army, to) + 0.12 * supportFor(to.army.player, to, null);
        if (to.city) defPow *= (to.city.capitalOf >= 0 ? 1.25 : 1.15);
        const ratio = myPow / Math.max(0.1, defPow);
        if (to.city && to.city.capitalOf >= 0 && ratio > 0.8) score = 100 + ratio * 10;
        else if (ratio > 1.05) score = 40 + ratio * 5 + (to.city ? 15 : 0);
        else if (ratio > 0.8) score = 5 + from.army.str * 0.25; // atak na wyniszczenie — najpierw duże stosy
        else if (threat && to === threat && ratio > 0.9) score = 60;
        else score = -Infinity;
      } else if (to.army && to.army.player === playerId) {
        // łączenie armii: traktuj jak marsz w stronę celu (siła idzie do przodu)
        if (threat && hexDist(to.c, to.r, capC, capR) <= 2) {
          score = 30;
        } else if (from.army.str + to.army.str <= MAX_ARMY) {
          for (const { t, val } of targets) {
            const dNow = hexDist(from.c, from.r, t.c, t.r);
            const dNew = hexDist(to.c, to.r, t.c, t.r);
            const s = val * 2 - dNew * 2 +
                      (dNew < dNow ? 8 : dNew === dNow ? 0 : -10) - 3;
            if (s > score) score = s;
          }
        }
      } else {
        // ruch w kierunku najlepszego celu (dopuszcza obejścia, karze cofanie)
        for (const { t, val } of targets) {
          const dNow = hexDist(from.c, from.r, t.c, t.r);
          const dNew = hexDist(to.c, to.r, t.c, t.r);
          const s = val * 2 - dNew * 2 +
                    (dNew < dNow ? 8 : dNew === dNow ? 0 : -10) +
                    (to.city && to.owner !== playerId ? 25 : 0) +
                    (to.land && to.owner !== playerId ? 3 : 0) -
                    (!to.land ? 2 : 0);
          if (s > score) score = s;
        }
        // obrona stolicy
        if (threat) {
          const dCap = hexDist(to.c, to.r, capC, capR);
          if (dCap < hexDist(from.c, from.r, capC, capR)) score = Math.max(score, 45 - dCap * 5);
        }
        // garnizon: nie ruszaj ostatniej armii ze stolicy gdy wróg w pobliżu
        if (from.c === capC && from.r === capR && threat) score = -Infinity;
      }
      if (score > -Infinity) score += rnd(0, 3);
      if (!best || score > best.score) best = { from, to, score };
    }
  }
  if (!best || best.score <= 0) return null;
  return best;
}

function aiStep(playerId, movesLeft, done) {
  if (state.phase === 'over') { updateUI(); return; }
  if (movesLeft <= 0) { done(); return; }
  const mv = aiPickMove(playerId);
  if (!mv) { done(); return; }
  executeMove(mv.from, mv.to);
  if (state.phase === 'over') return;
  setTimeout(() => aiStep(playerId, movesLeft - 1, done), 160);
}
