'use strict';
/* ============================================================
   AI — wybór celów i ruchów dla imperiów sterowanych komputerowo
   ============================================================ */

// AI: dopasowuje buildType garnizonu do stojącej tam armii (nigdy nie marnuje
// własnej produkcji), a dla pustych miast dobiera typ wg odległości od
// najbliższego wroga: blisko frontu -> artyleria (obrona+wsparcie), średnio ->
// czołg (ofensywa), głębokie zaplecze -> piechota (baza)
function aiAssignBuildType(t, playerId) {
  if (t.army && t.army.player === playerId) { t.city.buildType = t.army.type; return; }
  if (t.army) return; // pole chwilowo zajęte (np. w trakcie walki) — nic nie rób
  const d = aiFrontDistance(playerId, t);
  t.city.buildType = d <= 2 ? 'artillery' : d <= 5 ? 'tank' : 'infantry';
}

// decyduje, czy miasto AI w tej turze zaczyna budować drogę zamiast jednostki —
// tylko z dala od frontu, tylko jeśli jest jeszcze jakieś własne złoże bez drogi,
// i tylko z pewnym prawdopodobieństwem (żeby AI nie ignorowało budowy armii)
function aiAssignCityProject(t, playerId) {
  if (t.city.roadProject) return; // już buduje infrastrukturę — nie przerywamy w trakcie
  if (aiFrontDistance(playerId, t) > 2) {
    const target = aiFindRoadTarget(t, playerId);
    // startRoadProject może się nie udać (brak trasy przez własne terytorium) —
    // wtedy spadamy do zwykłego wyboru jednostki zamiast marnować turę
    if (target && rnd(0, 1) < AI_ROAD_BUILD_CHANCE && startRoadProject(t, target, playerId)) return;
  }
  aiAssignBuildType(t, playerId);
}

// najbliższe własne złoże spoza sieci dróg (bez heksu drogi), pomijając złoża,
// do których inne własne miasto już buduje drogę
function aiFindRoadTarget(t, playerId) {
  const inProgress = new Set();
  for (const row of state.tiles) for (const c of row) {
    if (c.city && c.owner === playerId && c.city.roadProject) inProgress.add(c.city.roadProject.target);
  }
  let best = null, bd = Infinity;
  for (const row of state.tiles) for (const cand of row) {
    if (!cand.resource || cand.owner !== playerId || cand.road || inProgress.has(cand)) continue;
    const d = hexDist(t.c, t.r, cand.c, cand.r);
    if (d < bd) { bd = d; best = cand; }
  }
  return best;
}

function aiFrontDistance(playerId, t) {
  let d = Infinity;
  for (const row of state.tiles) for (const o of row) {
    if (o.owner >= 0 && o.owner !== playerId && state.players[o.owner].alive) {
      const dd = hexDist(t.c, t.r, o.c, o.r);
      if (dd < d) d = dd;
    }
  }
  return d;
}

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

function aiPickMove(playerId, diff) {
  const armies = [];
  let myStr = 0, enemyStr = 0; // łączna siła — do oceny przewagi materialnej
  for (const row of state.tiles) for (const t of row) {
    if (!t.army) continue;
    if (t.army.player === playerId) {
      myStr += t.army.str;
      if (t.army.movesUsed < moveCap(t)) armies.push(t);
    } else if (state.players[t.army.player].alive) {
      enemyStr += t.army.str;
    }
  }
  if (!armies.length) return null;
  armies.sort((a, b) => b.army.str - a.army.str);
  // ocena ruchów niczego nie mutuje, więc na jej czas włączamy cache miast dla
  // moraleAt (patrz combat.js) — bez niego każda ocena kandydata skanuje planszę
  moraleCityCache = new Map();
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

  // eskalacja przełamująca pat — WYŁĄCZNIE dla strony z przewagą materialną
  // (dominance 0 przy równowadze, 1 przy podwójnej przewadze): silniejszy obniża
  // progi ataku i kieruje siły na stolicę-cel, słabszy gra dokładnie po staremu.
  // Bez bramki przewagi obie strony wyrównanej partii zmieniały zachowanie naraz
  // i psuło to partie, które wcześniej się rozstrzygały (pomiary w iteracjach)
  const dominance = Math.max(0, Math.min(1,
    (myStr / Math.max(1, enemyStr) - 1) / (AI_ESC_DOMINANCE_FULL - 1)));
  const escProgress = Math.min(1, state.turn / AI_ESC_TURNS) * dominance;
  const AT = diff.aggressionThreshold * (1 - AI_ESC_MAX * escProgress);

  // stolica-cel oblężenia: najsłabiej broniona i najbliższa żywa stolica wroga —
  // nacisk idzie na jeden punkt (pierścień wsparcia) zamiast rozpraszania sił
  let focus = null, focusBest = Infinity;
  for (const { t } of targets) {
    if (!t.city || t.city.capitalOf < 0 || !state.players[t.city.capitalOf].alive) continue;
    const s = (t.army ? t.army.str : 0) + 2 * hexDist(capC, capR, t.c, t.r);
    if (s < focusBest) { focusBest = s; focus = t; }
  }
  // wraz z eskalacją stolica-cel staje się coraz cenniejsza — marsz i scalanie ku
  // niej wygrywają z lokalnymi potyczkami, więc pula ruchów (dowóz sił!) idzie na
  // oblężenie; escProgress zawiera już bramkę przewagi
  let focusDist = null;
  if (focus && escProgress > 0) {
    for (const g of targets) {
      if (g.t === focus) { g.val += AI_ESC_FOCUS_VAL * escProgress; break; }
    }
    // pole odległości BFS po lądzie od stolicy-celu: marsz ku niej liczy dystans
    // ścieżkowy zamiast hexDist w linii prostej — bez tego armie zbijały się w
    // ślepe zaułki na linii brzegowej (najbliżej celu w linii prostej, za wodą)
    focusDist = new Map([[focus, 0]]);
    const fq = [focus];
    while (fq.length) {
      const cur = fq.shift();
      const fd = focusDist.get(cur);
      for (const n of neighborsOf(cur)) {
        if (!n.land || focusDist.has(n)) continue;
        focusDist.set(n, fd + 1);
        fq.push(n);
      }
    }
  }
  // szturm falowy: pojedynczo dowożone pod twierdzę armie są zjadane wycieczkami
  // wysokomoralnych obrońców, więc siły gromadzą się w strefie zbornej (dystans 2-3
  // od celu), a na pierścień (dystans 1) front wchodzi dopiero, gdy zgromadzona
  // siła przewyższa lokalną obronę — wtedy wiele armii naraz w jednej turze
  let assaultReady = false;
  if (focusDist) {
    let massedStr = 0, defLocalStr = 0;
    for (const row of state.tiles) for (const t of row) {
      if (!t.army) continue;
      const fd = focusDist.get(t);
      if (fd === undefined || fd > 3) continue;
      if (t.army.player === playerId) massedStr += t.army.str;
      // obrona lokalna: tylko obrońcy w zasięgu wsparcia bitew na pierścieniu (fd<=2)
      else if (fd <= 2 && state.players[t.army.player].alive) defLocalStr += t.army.str;
    }
    // cierpliwość oblężnicza wyczerpuje się z czasem: na ciasnych mapach strefa
    // zborna bywa za mała, żeby kiedykolwiek osiągnąć pełną przewagę — po długiej
    // partii fala rusza także przy gorszych szansach (okresowe fale golą twierdzę,
    // wieczne czekanie nie robi nic)
    const patience = Math.min(1, state.turn / (3 * AI_ESC_TURNS));
    assaultReady = massedStr > (1.2 - 0.65 * patience) * defLocalStr;
  }

  // dystans do celu: dla stolicy-celu ścieżkowy (BFS po lądzie, omija wodę),
  // dla pozostałych celów zwykły hexDist w linii prostej
  const targetDist = (g, tile) => g.bfs && g.bfs.has(tile)
    ? g.bfs.get(tile) : hexDist(tile.c, tile.r, g.tc, g.tr);

  let best = null; // { from, to, score }
  for (const from of armies) {
    const moves = validMoves(from);
    // dystans armia->cel nie zależy od rozważanego pola docelowego — liczony raz
    // na armię zamiast przy każdym kandydacie ruchu
    const targetInfo = targets.map(({ t, val }) => {
      const g = { tc: t.c, tr: t.r, val, bfs: focusDist && t === focus ? focusDist : null };
      g.dNow = targetDist(g, from);
      return g;
    });
    for (const to of moves) {
      let score = -Infinity;
      if (to.army && to.army.player !== playerId) {
        // siła własna liczona tylko dla kandydatów bitewnych — gałęzie marszu
        // i łączenia jej nie używają, a to najdroższa część oceny ruchu
        const myPow = armyPowerAt(from.army, to, 'attack') + 0.12 * supportFor(playerId, to, from);
        let defPow = armyPowerAt(to.army, to, 'defense') + 0.12 * supportFor(to.army.player, to, null);
        if (to.city) defPow *= (to.city.capitalOf >= 0 ? 1.25 : 1.15);
        const ratio = myPow / Math.max(0.1, defPow);
        // AT (liczone wyżej): mnożnik progów ataku z trudności × eskalacja — łatwe AI
        // potrzebuje większej przewagi, trudne/koszmarne atakuje przy gorszym stosunku
        if (to.city && to.city.capitalOf >= 0 && ratio > 0.8 * AT) score = (100 + ratio * 10) * diff.aggression;
        else if (ratio > 1.05 * AT) score = (40 + ratio * 5 + (to.city ? 15 : 0)) * diff.aggression;
        else if (ratio > 0.8 * AT) score = (5 + from.army.str * 0.25) * diff.aggression; // atak na wyniszczenie — najpierw duże stosy
        else if (threat && to === threat && ratio > 0.9 * AT) score = 60 * diff.aggression;
        else score = -Infinity;
        // premia szturmowa: obrońcy blokujący dojście do stolicy-celu muszą być
        // bici, nie omijani — inaczej marsz z podbitą wartością celu wygrywa ocenę
        // i oblężenie tańczy wokół tarczy wroga, nigdy jej nie atakując
        if (score > -Infinity && focusDist && escProgress > 0) {
          const fd = focusDist.get(to);
          if (fd !== undefined && fd <= AI_ESC_ASSAULT_RANGE) {
            score += escProgress * AI_ESC_ASSAULT * (AI_ESC_ASSAULT_RANGE + 1 - fd);
          }
        }
      } else if (to.army && to.army.player === playerId) {
        // łączenie armii: traktuj jak marsz w stronę celu (siła idzie do przodu)
        if (threat && hexDist(to.c, to.r, capC, capR) <= 2) {
          score = 30;
        } else if (from.army.str + to.army.str <= MAX_ARMY) {
          for (const g of targetInfo) {
            const dNew = targetDist(g, to);
            const s = g.val * 2 - dNew * 2 +
                      (dNew < g.dNow ? 8 : dNew === g.dNow ? 0 : -10) - 3;
            if (s > score) score = s;
          }
        }
      } else {
        // ruch w kierunku najlepszego celu (dopuszcza obejścia, karze cofanie)
        for (const g of targetInfo) {
          const dNew = targetDist(g, to);
          const s = g.val * 2 - dNew * 2 +
                    (dNew < g.dNow ? 8 : dNew === g.dNow ? 0 : -10) +
                    (to.city && to.owner !== playerId ? 25 : 0) +
                    (to.land && to.owner !== playerId ? 3 : 0) -
                    (!to.land ? 2 : 0);
          if (s > score) score = s;
        }
        // oblężenie: przed zebraniem sił premiowana strefa zborna (dystans 2-3,
        // wzajemne wsparcie, poza zasięgiem wypadu), po zebraniu — pierścień
        // (dystans 1; wsparcie w bitwie liczy się z siły, nie z morale, więc
        // pierścień realnie przełamuje obronę stolicy). Artyleria — największy
        // supportWeight — obsadza pozycje preferencyjnie, czołgi zostają do szturmu
        if (focusDist && escProgress > 0) {
          const fd = focusDist.get(to);
          if (fd !== undefined) {
            if (assaultReady ? fd <= 1 : (fd >= 2 && fd <= 3)) {
              score += AI_SIEGE_BONUS * escProgress * UNIT_TYPES[from.army.type].supportWeight;
            } else if (!assaultReady && fd <= 1) {
              score -= AI_SIEGE_BONUS * escProgress; // nie karm wypadów pojedynczymi armiami
            }
          }
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
  moraleCityCache = null; // koniec oceny — dalej mogą być mutacje (executeMove)
  if (!best || best.score <= 0) return null;
  return best;
}

function aiStep(playerId, movesLeft, done) {
  if (state.phase === 'over') { updateUI(); return; }
  if (movesLeft <= 0) { done(); return; }
  const diff = resolveDifficulty(state.players[playerId].difficulty);
  const mv = aiPickMove(playerId, diff);
  if (!mv) { done(); return; }
  const hops = executeMove(mv.from, mv.to);
  if (state.phase === 'over') return;
  const gid = state.gameId;
  setTimeout(() => {
    if (state.gameId !== gid) return; // gra została zrestartowana w międzyczasie
    aiStep(playerId, movesLeft - hops, done);
  }, diff.thinkDelay);
}
