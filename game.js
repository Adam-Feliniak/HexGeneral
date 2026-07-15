'use strict';
/* ============================================================
   HEX IMPERIUM — turowa strategia heksagonalna w 2D
   (inspirowana Hex Empire) — czysty JS + Canvas, bez zależności
   ============================================================ */

// ---------- Konfiguracja ----------
const MAP_W = 23;
const MAP_H = 14;
const HEX = 28;                       // promień heksa (px)
const HEX_W = Math.sqrt(3) * HEX;     // szerokość heksa (pointy-top)
const MOVES_PER_TURN = 5;
const MAX_ARMY = 99;
const CITY_COUNT = 16;
const RESOURCE_COUNT = 6;             // złoża surowców na mapie

const PLAYERS_DEF = [
  { name: 'Karmazynia', color: '#d64550', dark: '#8c2530', isHuman: true },
  { name: 'Lazuria',    color: '#3f7fd6', dark: '#24518f', isHuman: false },
  { name: 'Werdania',   color: '#3fae62', dark: '#22703c', isHuman: false },
  { name: 'Aurelia',    color: '#d6a53f', dark: '#8f6a1f', isHuman: false },
];

const CITY_NAMES = [
  'Ostrów', 'Bielsk', 'Toruniec', 'Grodziec', 'Sokole', 'Rawka', 'Jarowo',
  'Miłogród', 'Węgrów', 'Charne', 'Dobrzyń', 'Lipnica', 'Orłowo', 'Strumień',
  'Zawada', 'Turza', 'Chełmno', 'Radogoszcz', 'Karczew', 'Młyniec', 'Piaski',
  'Kruszwin', 'Sielec', 'Bystrza', 'Łęgowo', 'Drwęck', 'Postoliny', 'Wierzno',
];

// pozycje stolic (narożniki mapy)
const CAPITAL_SPOTS = [
  [2, 2], [MAP_W - 3, MAP_H - 3], [MAP_W - 3, 2], [2, MAP_H - 3],
];

// ---------- Geometria heksów (odd-r, pointy-top) ----------
// kierunki: E, SE, SW, W, NW, NE (kolejność zgodna z krawędziami rogów)
const DIRS_EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const DIRS_ODD  = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];

function inBounds(c, r) { return c >= 0 && c < MAP_W && r >= 0 && r < MAP_H; }

function neighborCoords(c, r) {
  const dirs = (r % 2 === 0) ? DIRS_EVEN : DIRS_ODD;
  const out = [];
  for (const [dc, dr] of dirs) out.push([c + dc, r + dr]);
  return out;
}

function hexDist(c1, r1, c2, r2) {
  // offset odd-r -> cube
  const q1 = c1 - ((r1 - (r1 & 1)) >> 1), q2 = c2 - ((r2 - (r2 & 1)) >> 1);
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function hexCenter(c, r) {
  return {
    x: HEX_W * (c + 0.5 * (r & 1)) + HEX_W * 0.6,
    y: 1.5 * HEX * r + HEX * 1.2,
  };
}

function hexCorner(cx, cy, i) {
  const ang = Math.PI / 180 * (60 * i - 30);
  return [cx + HEX * Math.cos(ang), cy + HEX * Math.sin(ang)];
}

// ---------- Stan gry ----------
let state = null;
let anims = [];        // animacje ruchu armii
let floaters = [];     // napisy unoszące się nad polem bitwy
let effects = [];      // eksplozje na polach bitew
let hoverTile = null;
let lastFrame = 0;

function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(n) { return Math.floor(Math.random() * n); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = irnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- Generator mapy ----------
function generateMap() {
  let land = [];
  for (let r = 0; r < MAP_H; r++) {
    land.push(Array.from({ length: MAP_W }, () => Math.random() < 0.58));
  }
  // automat komórkowy — wygładzenie kontynentów
  for (let it = 0; it < 3; it++) {
    const next = land.map(row => row.slice());
    for (let r = 0; r < MAP_H; r++) {
      for (let c = 0; c < MAP_W; c++) {
        let n = 0, tot = 0;
        for (const [nc, nr] of neighborCoords(c, r)) {
          if (!inBounds(nc, nr)) continue;
          tot++;
          if (land[nr][nc]) n++;
        }
        if (n > tot / 2) next[r][c] = true;
        else if (n < tot / 2) next[r][c] = false;
      }
    }
    land = next;
  }
  // wymuś ląd wokół stolic
  for (const [cc, cr] of CAPITAL_SPOTS) {
    for (let r = 0; r < MAP_H; r++) {
      for (let c = 0; c < MAP_W; c++) {
        if (hexDist(c, r, cc, cr) <= 2) land[r][c] = true;
      }
    }
  }

  const tiles = [];
  for (let r = 0; r < MAP_H; r++) {
    const row = [];
    for (let c = 0; c < MAP_W; c++) {
      row.push({
        c, r,
        land: land[r][c],
        city: null,       // { name, capitalOf, port }
        resource: null,   // 'oil' | 'farm' | 'mine'
        owner: -1,
        army: null,       // { player, str, vet, moved }
        shade: rnd(-1, 1), // drobna wariacja koloru terenu
      });
    }
    tiles.push(row);
  }

  // stolice
  const names = shuffle(CITY_NAMES.slice());
  PLAYERS_DEF.forEach((p, i) => {
    const [c, r] = CAPITAL_SPOTS[i];
    tiles[r][c].city = { name: p.name, capitalOf: i, port: false };
    tiles[r][c].owner = i;
  });

  // miasta
  const landTiles = shuffle(tiles.flat().filter(t => t.land && !t.city));
  let placed = 0;
  for (const t of landTiles) {
    if (placed >= CITY_COUNT) break;
    let ok = true;
    for (const row of tiles) for (const o of row) {
      if (o.city && hexDist(t.c, t.r, o.c, o.r) < 3) { ok = false; break; }
    }
    if (!ok) continue;
    t.city = { name: names[placed % names.length], capitalOf: -1, port: false, variant: irnd(3) };
    placed++;
  }

  // porty: miasto sąsiadujące z wodą
  for (const row of tiles) for (const t of row) {
    if (!t.city) continue;
    t.city.port = neighborCoords(t.c, t.r)
      .some(([nc, nr]) => inBounds(nc, nr) && !tiles[nr][nc].land);
  }

  // złoża surowców: typ zależy od terenu (trawa/piach/skały)
  const resSpots = shuffle(tiles.flat().filter(t => t.land && !t.city));
  let resPlaced = 0;
  for (const t of resSpots) {
    if (resPlaced >= RESOURCE_COUNT) break;
    let ok = true;
    for (const row of tiles) for (const o of row) {
      if ((o.city && hexDist(t.c, t.r, o.c, o.r) < 2) ||
          (o.resource && hexDist(t.c, t.r, o.c, o.r) < 3)) { ok = false; break; }
    }
    if (!ok) continue;
    t.resource = t.shade < -0.45 ? 'mine' : t.shade > 0.15 ? 'farm' : 'oil';
    resPlaced++;
  }

  // linia brzegowa: ląd zapamiętuje krawędzie z wodą (piana),
  // a woda przy lądzie jest płycizną (jaśniejsza)
  for (const row of tiles) for (const t of row) {
    const dirs = (t.r % 2 === 0) ? DIRS_EVEN : DIRS_ODD;
    if (t.land) {
      t.coast = [];
      for (let d = 0; d < 6; d++) {
        const [nc, nr] = [t.c + dirs[d][0], t.r + dirs[d][1]];
        if (inBounds(nc, nr) && !tiles[nr][nc].land) t.coast.push(d);
      }
    } else {
      t.shallow = dirs.some(([dc, dr]) =>
        inBounds(t.c + dc, t.r + dr) && tiles[t.r + dr][t.c + dc].land);
    }
  }
  return tiles;
}

// ---------- Nowa gra ----------
function newGame() {
  const tiles = generateMap();
  state = {
    tiles,
    turn: 1,
    phase: 'human',      // 'human' | 'ai' | 'over'
    human: 0,            // id imperium prowadzonego przez człowieka
    movesLeft: MOVES_PER_TURN,
    selected: null,      // wybrane pole z armią gracza
    players: PLAYERS_DEF.map((p, i) => ({
      ...p, id: i, alive: true, capital: CAPITAL_SPOTS[i], isHuman: i === 0,
    })),
    log: [],
  };
  anims = [];
  floaters = [];
  effects = [];
  // armie startowe na stolicach
  state.players.forEach(p => {
    const [c, r] = p.capital;
    tiles[r][c].army = { player: p.id, str: 5, vet: 0, moved: false };
  });
  addLog('Nowa gra! Zdobądź stolice wrogów.');
  addLog('Przed pierwszym ruchem możesz kliknąć obcą stolicę, by zagrać tym imperium.');
  hideOverlay();
  showBanner('MISSION START!');
  updateUI();
}

// ---------- Pomocnicze ----------
function tileAt(c, r) { return inBounds(c, r) ? state.tiles[r][c] : null; }

function neighborsOf(t) {
  return neighborCoords(t.c, t.r).map(([c, r]) => tileAt(c, r)).filter(Boolean);
}

function addLog(msg) {
  state.log.push(msg);
  if (state.log.length > 40) state.log.shift();
  if (typeof document === 'undefined') return;
  const el = document.getElementById('log');
  if (el) {
    el.innerHTML = state.log.slice(-10).map(l => `<div class="log-line">${l}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }
}

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

// ---------- Ruch i walka ----------
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
    addLog(`<b>${state.players[att.player].name}</b> rozbija armię (${def.str}) — straty ${loss}.`);
    to.army = null;
    return true;
  } else {
    const loss = Math.min(def.str - 1, Math.round(def.str * 0.75 * (aPow / dPow)));
    def.str -= loss;
    def.vet = Math.min(15, def.vet + 4);
    floaters.push({ x: c.x, y: c.y, text: `-${att.str}`, color: '#ffd27b', t: 0 });
    addLog(`Atak <b>${state.players[att.player].name}</b> (${att.str}) odparty — obrońca traci ${loss}.`);
    from.army = null;
    return false;
  }
}

function captureTile(t, playerId) {
  const prevOwner = t.owner;
  if (t.land) t.owner = playerId;
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
  for (const row of state.tiles) for (const t of row) {
    if (t.owner === loserId) t.owner = winnerId;
    if (t.army && t.army.player === loserId) t.army = null;
  }
  addLog(`💥 <b>${winner.name}</b> zdobywa stolicę — <b>${loser.name}</b> upada!`);
  showBanner(`${loser.name} zostaje zaanektowana przez ${winner.name}!`);
  checkGameOver();
}

function checkGameOver() {
  const alive = state.players.filter(p => p.alive);
  if (alive.length === 1) {
    state.phase = 'over';
    const win = alive[0];
    showOverlay(
      win.isHuman ? '★ MISSION COMPLETE! ★' : 'GAME OVER',
      win.isHuman
        ? `Zjednoczyłeś świat pod sztandarem imperium ${win.name} w turze ${state.turn}.`
        : `Świat podbiło imperium ${win.name}. Spróbuj jeszcze raz!`
    );
  } else if (!state.players[state.human].alive && state.phase !== 'over') {
    state.phase = 'over';
    showOverlay('GAME OVER', 'Twoja stolica padła. Spróbuj jeszcze raz!');
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
    to.army.moved = true;
    from.army = null;
  } else {
    from.army = null;
    to.army = army;
    army.moved = true;
    captureTile(to, army.player);
  }
  const a = hexCenter(from.c, from.r), b = hexCenter(to.c, to.r);
  anims.push({ tile: to, x0: a.x, y0: a.y, x1: b.x, y1: b.y, t: 0 });
  updateUI();
  return true;
}

// ---------- Produkcja ----------
function produce(playerId) {
  const cities = [];
  for (const row of state.tiles) for (const t of row) {
    if (t.city && t.owner === playerId) cities.push(t);
  }
  // każde własne złoże dodaje +1 produkcji najbliższemu własnemu miastu
  const bonus = new Map();
  if (cities.length) {
    for (const row of state.tiles) for (const t of row) {
      if (!t.resource || t.owner !== playerId) continue;
      let best = null, bd = Infinity;
      for (const c of cities) {
        const d = hexDist(t.c, t.r, c.c, c.r);
        if (d < bd) { bd = d; best = c; }
      }
      bonus.set(best, (bonus.get(best) || 0) + 1);
    }
  }
  for (const t of cities) {
    const gain = (t.city.capitalOf === playerId ? 3 : 1) + (bonus.get(t) || 0);
    if (t.army && t.army.player === playerId) {
      t.army.str = Math.min(MAX_ARMY, t.army.str + gain);
    } else if (!t.army) {
      t.army = { player: playerId, str: gain, vet: 0, moved: true };
    }
  }
}

// ---------- Tury ----------
function resetMoved(playerId) {
  for (const row of state.tiles) for (const t of row) {
    if (t.army && t.army.player === playerId) t.army.moved = false;
  }
}

function endHumanTurn() {
  if (state.phase !== 'human') return;
  state.selected = null;
  produce(state.human);
  state.phase = 'ai';
  updateUI();
  runAIPlayers(0);
}

function startHumanTurn() {
  if (state.phase === 'over') return;
  state.turn++;
  state.phase = 'human';
  state.movesLeft = MOVES_PER_TURN;
  resetMoved(state.human);
  showBanner(`Tura ${state.turn} — Twój ruch`);
  updateUI();
}

function runAIPlayers(idx) {
  if (state.phase === 'over') { updateUI(); return; }
  while (idx < state.players.length && (idx === state.human || !state.players[idx].alive)) idx++;
  if (idx >= state.players.length) { startHumanTurn(); return; }
  resetMoved(idx);
  aiStep(idx, MOVES_PER_TURN, () => {
    produce(idx);
    runAIPlayers(idx + 1);
  });
}

// ---------- AI ----------
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
    if (t.army && t.army.player === playerId && !t.army.moved) armies.push(t);
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

// ---------- Wejście gracza ----------
// przed pierwszym ruchem w grze można wybrać imperium, klikając jego stolicę
function canPickEmpire() {
  return state.phase === 'human' && state.turn === 1 && state.movesLeft === MOVES_PER_TURN;
}

function switchHuman(id) {
  state.human = id;
  state.players.forEach(p => { p.isHuman = p.id === id; });
  state.selected = null;
  addLog(`Przejmujesz dowodzenie: <b>${state.players[id].name}</b>!`);
  showBanner(`Grasz jako ${state.players[id].name}!`);
  updateUI();
}

function onTileClick(t) {
  if (!state || state.phase !== 'human') return;
  if (canPickEmpire() && t.city && t.city.capitalOf >= 0 && t.city.capitalOf !== state.human) {
    switchHuman(t.city.capitalOf);
    return;
  }
  const sel = state.selected;
  if (sel && sel !== t && validMoves(sel).includes(t)) {
    state.selected = null;
    executeMove(sel, t);
    state.movesLeft--;
    if (state.movesLeft <= 0 && state.phase === 'human') {
      setTimeout(() => { if (state.phase === 'human') endHumanTurn(); }, 350);
    }
    updateUI();
    return;
  }
  if (t.army && t.army.player === state.human && !t.army.moved && state.movesLeft > 0) {
    state.selected = (sel === t) ? null : t;
  } else {
    state.selected = null;
  }
  updateUI();
}

// ---------- Rysowanie ----------
const canvas = typeof document !== 'undefined' ? document.getElementById('board') : null;
const ctx = canvas ? canvas.getContext('2d') : null;

// ---------- Sprite'y: pliki PNG w assets/ (generuje tools/gen-sprites.js) ----------
let SPR = null;

function loadSprite(name) {
  if (typeof Image === 'undefined') return { complete: false, naturalWidth: 0 };
  const img = new Image();
  img.src = 'assets/' + name + '.png';
  return img;
}

function loadSprites() {
  SPR = {
    tanks: [], soldiers: [], capitals: [],
    cities: [loadSprite('city_0'), loadSprite('city_1'), loadSprite('city_2')],
    cityPort: loadSprite('city_port'),
    crane: loadSprite('crane'),
    trees: [loadSprite('tree_0'), loadSprite('tree_1')],
    res: { oil: loadSprite('res_oil'), farm: loadSprite('res_farm'), mine: loadSprite('res_mine') },
    rocks: [loadSprite('rock_0'), loadSprite('rock_1')],
    hexSand: [0, 1, 2].map(v => loadSprite('hex_sand_' + v)),
    hexGrass: [0, 1, 2].map(v => loadSprite('hex_grass_' + v)),
    hexWater: [0, 1, 2].map(v => loadSprite('hex_water_' + v)),
    hexShallow: loadSprite('hex_shallow'),
    explosion: loadSprite('explosion'), // 6 klatek 48x48 obok siebie
  };
  SPR.ships = [];
  for (let i = 0; i < PLAYERS_DEF.length; i++) {
    SPR.tanks.push(loadSprite('tank_' + i));
    SPR.soldiers.push(loadSprite('soldier_' + i)); // 2 klatki 24x30 obok siebie
    SPR.capitals.push(loadSprite('capital_' + i));
    // klasy okrętów: barka / pancernik / lotniskowiec
    SPR.ships.push([loadSprite('ship0_' + i), loadSprite('ship1_' + i), loadSprite('ship2_' + i)]);
  }
}

function sprOk(img) { return !!img && img.complete && img.naturalWidth > 0; }

const BOARD_PX_W = Math.ceil(HEX_W * (MAP_W + 1.2));
const BOARD_PX_H = Math.ceil(1.5 * HEX * (MAP_H - 1) + HEX * 2.5);

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = BOARD_PX_W * dpr;
  canvas.height = BOARD_PX_H * dpr;
  canvas.style.aspectRatio = `${BOARD_PX_W} / ${BOARD_PX_H}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; // pixel-art bez rozmycia
}

function hexPath(cx, cy, scale = 1) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = Math.PI / 180 * (60 * i - 30);
    const x = cx + HEX * scale * Math.cos(ang);
    const y = cy + HEX * scale * Math.sin(ang);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function parseColor(str) {
  // obsługuje '#rrggbb' oraz 'rgb(r,g,b)' — mixColor bywa wołany na własnym wyniku
  if (str[0] === '#') {
    return [parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16)];
  }
  return str.match(/\d+/g).slice(0, 3).map(Number);
}

function mixColor(c1, c2, k) {
  const a = parseColor(c1), b = parseColor(c2);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function drawTile(t) {
  const { x, y } = hexCenter(t.c, t.r);
  // pixel-artowe kafle terenu (3 warianty na typ, wybór deterministyczny per heks)
  const hsh = (t.c * 73 + t.r * 151) % 97;
  const grass = t.shade > 0.15;
  let spr;
  if (!t.land) spr = t.shallow ? SPR.hexShallow : SPR.hexWater[hsh % 3];
  else spr = grass ? SPR.hexGrass[hsh % 3] : SPR.hexSand[hsh % 3];
  if (sprOk(spr)) {
    ctx.drawImage(spr, Math.round(x - 25), Math.round(y - 29), 50, 58);
  } else {
    // zapasowe płaskie wypełnienie, nim wczytają się PNG
    hexPath(x, y);
    ctx.fillStyle = !t.land ? '#2a6aa8' : grass ? '#8f9c4a' : '#c9b06a';
    ctx.fill();
  }
  // barwa właściciela jako półprzezroczysta kalka na teksturze
  if (t.land && t.owner >= 0) {
    const [r, g, b] = parseColor(state.players[t.owner].color);
    hexPath(x, y);
    ctx.fillStyle = `rgba(${r},${g},${b},0.30)`;
    ctx.fill();
  }
  hexPath(x, y);
  ctx.strokeStyle = t.land ? 'rgba(90,70,30,0.35)' : 'rgba(20,40,70,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // piana na linii wybrzeża
  if (t.land && t.coast && t.coast.length) {
    ctx.strokeStyle = 'rgba(244,232,180,0.75)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const d of t.coast) {
      const [x1, y1] = hexCorner(x, y, d);
      const [x2, y2] = hexCorner(x, y, (d + 1) % 6);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
}

function drawDecor(t) {
  if (!t.land || t.city) return;
  const { x, y } = hexCenter(t.c, t.r);
  // złoże rysuje się też pod stojącą armią
  if (t.resource) {
    const spr = SPR.res[t.resource];
    if (sprOk(spr)) ctx.drawImage(spr, Math.round(x - 15), Math.round(y - 16), 30, 28);
    return;
  }
  if (t.army) return;
  const v = (t.c * 5 + t.r * 11) % 2; // wariant dekoracji per heks
  if (t.shade > 0.55 && sprOk(SPR.trees[v])) {
    ctx.drawImage(SPR.trees[v], Math.round(x - 13), Math.round(y - 17), 26, 28);
  } else if (t.shade < -0.65 && sprOk(SPR.rocks[v])) {
    ctx.drawImage(SPR.rocks[v], Math.round(x - 11), Math.round(y - 2), 22, 13);
  }
}

function drawBorders() {
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const row of state.tiles) for (const t of row) {
    if (t.owner < 0 || !t.land) continue;
    const { x, y } = hexCenter(t.c, t.r);
    const dirs = (t.r % 2 === 0) ? DIRS_EVEN : DIRS_ODD;
    for (let d = 0; d < 6; d++) {
      const n = tileAt(t.c + dirs[d][0], t.r + dirs[d][1]);
      if (n && n.land && n.owner === t.owner) continue;
      const [x1, y1] = hexCorner(x, y, d);
      const [x2, y2] = hexCorner(x, y, (d + 1) % 6);
      ctx.strokeStyle = state.players[t.owner].dark;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
}

function drawCity(t) {
  const { x, y } = hexCenter(t.c, t.r);
  const cap = t.city.capitalOf >= 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (cap) {
    // stolica: kwatera główna z flagą w kolorze właściciela (+ żuraw, gdy port)
    const spr = SPR.capitals[t.owner >= 0 ? t.owner : t.city.capitalOf];
    if (sprOk(spr)) ctx.drawImage(spr, -24, -22, 48, 34);
    if (t.city.port && sprOk(SPR.crane)) ctx.drawImage(SPR.crane, 5, -14, 20, 26);
  } else if (t.city.port) {
    // port: magazyn z żurawiem, keja i kontenery
    if (sprOk(SPR.cityPort)) ctx.drawImage(SPR.cityPort, -23, -26, 46, 38);
  } else {
    // miasto: jeden z 3 wariantów zabudowy
    const spr = SPR.cities[t.city.variant || 0];
    if (sprOk(spr)) ctx.drawImage(spr, -23, -26, 46, 38);
  }
  ctx.restore();
}

function drawArmy(t, now) {
  const army = t.army;
  let { x, y } = hexCenter(t.c, t.r);
  const anim = anims.find(a => a.tile === t);
  if (anim) {
    const k = Math.min(1, anim.t / 0.18);
    x = anim.x0 + (anim.x1 - anim.x0) * k;
    y = anim.y0 + (anim.y1 - anim.y0) * k;
  }
  const dim = army.moved && army.player === state.human && state.phase === 'human';
  ctx.save();
  ctx.globalAlpha = dim ? 0.55 : 1;
  x = Math.round(x); y = Math.round(y);
  // mała armia = piechur (animowany marsz), duża = czołg;
  // na morzu armia płynie okrętem: barka / pancernik / lotniskowiec
  const infantry = army.str < 20;
  let selBox;
  if (!t.land) {
    const tier = army.str < 20 ? 0 : army.str < 70 ? 1 : 2;
    const spr = SPR.ships[army.player][tier];
    selBox = tier === 0 ? [x - 18, y - 10, 36, 18]
      : tier === 1 ? [x - 24, y - 13, 48, 24]
      : [x - 25, y - 12, 50, 22];
    if (sprOk(spr)) ctx.drawImage(spr, selBox[0], selBox[1], selBox[2], selBox[3]);
  } else {
    const spr = infantry ? SPR.soldiers[army.player] : SPR.tanks[army.player];
    if (sprOk(spr)) {
      if (infantry) {
        const fr = Math.floor(now / 280) % 2;
        ctx.drawImage(spr, fr * 24, 0, 24, 30, x - 12, y - 17, 24, 30);
      } else {
        ctx.drawImage(spr, x - 24, y - 15, 48, 28);
      }
    }
    selBox = infantry ? [x - 13, y - 18, 26, 32] : [x - 25, y - 16, 50, 30];
  }
  // puls zaznaczenia
  if (state.selected === t) {
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(now / 140)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(selBox[0] - 1, selBox[1] - 1, selBox[2] + 2, selBox[3] + 2);
  }
  // arcade'owa liczba siły (żółta z czarnym konturem)
  ctx.font = 'bold 12px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#16140c';
  ctx.strokeText(army.str, x + 9, y + 19);
  ctx.fillStyle = '#ffd91c';
  ctx.fillText(army.str, x + 9, y + 19);
  // pasek morale (amunicyjny)
  const m = Math.min(110, moraleAt(army.player, t) + army.vet) / 100;
  ctx.fillStyle = '#16140c';
  ctx.fillRect(x - 17, y + 15, 16, 4);
  ctx.fillStyle = m > 0.75 ? '#7be05a' : m > 0.5 ? '#ffd91c' : '#e05a2a';
  ctx.fillRect(x - 16, y + 16, 14 * Math.min(1, m), 2);
  ctx.restore();
}

function draw(now) {
  if (!state) return;
  ctx.fillStyle = '#0f0e08';
  ctx.fillRect(0, 0, BOARD_PX_W, BOARD_PX_H);

  for (const row of state.tiles) for (const t of row) drawTile(t);
  drawBorders();

  // podświetlenia
  if (state.selected && state.phase === 'human') {
    const sel = state.selected;
    const { x, y } = hexCenter(sel.c, sel.r);
    hexPath(x, y, 0.92);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    for (const n of validMoves(sel)) {
      const c = hexCenter(n.c, n.r);
      hexPath(c.x, c.y, 0.86);
      const hostile = n.army && n.army.player !== state.human;
      ctx.fillStyle = hostile ? 'rgba(255,80,80,0.3)' : 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = hostile ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (hoverTile && state.phase === 'human') {
    const { x, y } = hexCenter(hoverTile.c, hoverTile.r);
    hexPath(x, y, 0.95);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (const row of state.tiles) for (const t of row) {
    if (t.city) drawCity(t); else drawDecor(t);
  }
  for (const row of state.tiles) for (const t of row) if (t.army) drawArmy(t, now);

  // eksplozje (sprite-sheet 6 klatek)
  if (sprOk(SPR.explosion)) {
    for (const e of effects) {
      const fi = Math.min(5, Math.floor(e.t / 0.08));
      ctx.drawImage(SPR.explosion, fi * 48, 0, 48, 48,
        Math.round(e.x - 28), Math.round(e.y - 34), 56, 56);
    }
  }

  // floatery — arcade'owe napisy strat
  ctx.font = 'bold 15px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    ctx.strokeStyle = '#16140c';
    ctx.strokeText(f.text, f.x, f.y - 14 - f.t * 26);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 14 - f.t * 26);
  }
  ctx.globalAlpha = 1;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  for (const a of anims) a.t += dt;
  anims = anims.filter(a => a.t < 0.18);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1.2);
  for (const e of effects) e.t += dt;
  effects = effects.filter(e => e.t < 0.48);
  draw(now);
  requestAnimationFrame(frame);
}

// ---------- UI ----------
function updateUI() {
  if (typeof document === 'undefined' || !state) return;
  document.getElementById('turn-label').textContent = `Tura ${state.turn}`;
  document.getElementById('moves-label').textContent =
    state.phase === 'human' ? `Ruchy: ${state.movesLeft}/${MOVES_PER_TURN}`
    : state.phase === 'ai' ? 'Ruch przeciwników…' : 'Koniec gry';
  document.getElementById('end-turn').disabled = state.phase !== 'human';

  const box = document.getElementById('players');
  box.innerHTML = '';
  for (const p of state.players) {
    let cities = 0, str = 0, res = 0;
    for (const row of state.tiles) for (const t of row) {
      if (t.city && t.owner === p.id) cities++;
      if (t.resource && t.owner === p.id) res++;
      if (t.army && t.army.player === p.id) str += t.army.str;
    }
    const div = document.createElement('div');
    div.className = 'player-row'
      + (!p.alive ? ' dead' : '')
      + (p.alive && ((state.phase === 'human' && p.id === state.human)) ? ' active' : '');
    div.innerHTML =
      `<span class="player-dot" style="background:${p.color}"></span>` +
      `<span class="player-name">${p.name}${p.isHuman ? ' (Ty)' : ''}</span>` +
      `<span class="player-stats">🏛 ${cities} ⛏ ${res} ⚔ ${str}</span>`;
    box.appendChild(div);
  }
}

let bannerTimer = null;
function showBanner(text) {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = text;
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 2200);
}

function showOverlay(title, text) {
  if (typeof document === 'undefined') return;
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-text').textContent = text;
  document.getElementById('overlay').hidden = false;
}
function hideOverlay() {
  if (typeof document === 'undefined') return;
  const o = document.getElementById('overlay');
  if (o) o.hidden = true;
}

// ---------- Obsługa myszy ----------
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
  if (!t.land) lines.push('🌊 Morze');
  else if (t.owner >= 0) lines.push(`Ziemie: <b>${state.players[t.owner].name}</b>`);
  else lines.push('Ziemia niczyja');
  if (t.city) {
    lines.push(t.city.capitalOf >= 0
      ? `★ Stolica: <b>${t.city.name}</b>`
      : `🏛 Miasto: <b>${t.city.name}</b>${t.city.port ? ' (port ⚓)' : ''}`);
  }
  if (t.resource) {
    const RES_NAMES = { oil: '🛢 Szyb naftowy', farm: '🌾 Pole uprawne', mine: '⛏ Kopalnia' };
    lines.push(`${RES_NAMES[t.resource]} — <b>+1</b> produkcji najbliższego miasta`);
  }
  if (t.army) {
    const m = Math.min(110, moraleAt(t.army.player, t) + t.army.vet);
    lines.push(`⚔ Armia ${state.players[t.army.player].name}: siła <b>${t.army.str}</b>, morale <b>${m}%</b>`);
  }
  if (canPickEmpire() && t.city && t.city.capitalOf >= 0 && t.city.capitalOf !== state.human) {
    lines.push('👉 Kliknij, aby zagrać tym imperium');
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
  document.getElementById('end-turn').addEventListener('click', endHumanTurn);
  document.getElementById('new-game').addEventListener('click', newGame);
  document.getElementById('overlay-btn').addEventListener('click', newGame);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') endHumanTurn();
    if (ev.key === 'Escape') { state.selected = null; updateUI(); }
  });
}

// ---------- Start ----------
if (typeof document !== 'undefined' && canvas) {
  setupCanvas();
  loadSprites();
  initInput();
  newGame();
  requestAnimationFrame(frame);
}

// eksport do testów w Node
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateMap, newGame, produce, resolveBattle, executeMove,
    aiPickMove, hexDist, neighborCoords, moraleAt, resetMoved, mixColor,
    getState: () => state, setState: s => { state = s; },
    endHumanTurn, runAIPlayers, onTileClick, canPickEmpire, MAP_W, MAP_H,
  };
}
