'use strict';
/* ============================================================
   team-check.js — inwarianty gry drużynowej (headless, zero zależności)

   Trzecie narzędzie obok sim.js i stress.js. Sim gra wyłącznie FFA (newGame
   z humanCount/botCount), a stress od 0.7.1 losuje też składy drużynowe — ale losowo
   i tylko na inwariantach. Tutaj drużyny sprawdzamy SCENARIUSZOWO: pojedyncze reguły
   na spreparowanym stanie, których fuzz nie trafi przypadkiem (np. zaopatrzenie przez
   złoże sojusznika albo równość dystansów przy rozstawieniu). Podział pracy jest taki:
   team-check pilnuje, że reguła jest napisana poprawnie, stress — że nic jej nie łamie
   w losowej partii. Sprawdzamy to, co wchodzi razem ze slotami:

   - skład partii ze slotów (id ciągłe, skiny z wierszy lobby, zamknięte pomijane),
   - reguły sojuszu (brak walki i zajmowania pól, AI nie celuje w sojusznika),
   - koniec gry liczony na DRUŻYNY, w tym porażka w single dopiero po całej drużynie,
   - bossa (jeden na partię, własny skin, mnożniki na wierzchu presetu),
   - rozstawienie stolic: sojusznik nie może być dalej niż wróg, a FFA musi zostać
     bit w bit takie jak dotąd (inaczej wyniki sim.js/stress.js przestają być porównywalne),
   - nazwy stolic (przy zamkniętych slotach i bossie id ≠ wiersz lobby),
   - zapis/wczytanie partii drużynowej (SAVE_FORMAT),
   - lobby: tabela slotów i blokada Startu — przez stub DOM, więc brakujące id
     w index.html wywala test zamiast objawiać się dopiero w przeglądarce,
   - pełne partie AI-vs-AI w układzie 2v2 i z bossem (kończą się, nikt nie bije swoich).

   Przykłady:
     node tools/team-check.js
     node tools/team-check.js --games=8     (więcej pełnych partii na układ)
     node tools/team-check.js --quiet       (tylko podsumowanie i błędy)
   ============================================================ */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const arg = (name, def) => {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
};
const GAMES = Math.max(1, Number(arg('games', 3)) || 3);
const QUIET = process.argv.includes('--quiet');

// jak SRC_FILES w sim.js + save.js (kodek) — bez render/sprites/input/main, które
// wymagają canvasu; ui.js i menu.js wchodzą, bo newGame woła applyScreen/updateUI
const SRC_FILES = [
  'config.js', 'locales-data.js', 'i18n.js', 'geometry.js', 'utils.js',
  'mapgen.js', 'state.js', 'combat.js', 'roads.js', 'empire.js', 'turns.js',
  'ai.js', 'save.js', 'ui.js', 'menu.js',
];

/* ---------------- raportowanie ---------------- */

let failures = 0, passed = 0;
function section(title) { if (!QUIET) console.log('\n== ' + title); }
function check(name, cond, detail) {
  if (cond) { passed++; if (!QUIET) console.log('  ok   ' + name); return true; }
  failures++;
  console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : ''));
  return false;
}

/* ---------------- sandboxy ---------------- */

// Bez `document` (domyślnie): osłony headless (typeof document === 'undefined') wyłączają
// UI, dokładnie jak w sim.js/stress.js. Oba sandboxy budujemy tą samą funkcją, żeby
// połowa testów nie zaczęła po cichu chodzić w innym środowisku niż druga
function makeCtx(extraGlobals) {
  const ctx = vm.createContext({
    console, JSON, Math, Infinity, Date,
    performance: { now: () => 0 },
    setTimeout: () => 0, clearTimeout: () => {},
    ...extraGlobals,
  });
  for (const f of SRC_FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

// Stub DOM do sprawdzenia lobby. getElementById zwraca element TYLKO dla id, które
// naprawdę są w index.html — dzięki temu literówka albo zapomniany kontener wywala
// test, zamiast czekać na ręczne kliknięcie w przeglądarce
function makeDomCtx() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const realIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const nodes = new Map();

  function element(tag) {
    const node = {
      tagName: tag, children: [], textContent: '', className: '', value: '',
      hidden: false, disabled: false, title: '', style: {}, dataset: {},
      classList: { toggle() {}, add() {}, remove() {} },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener() {},
      querySelectorAll: () => [],
    };
    // wiernie jak w przeglądarce: innerHTML = '' kasuje dzieci (bez tego wiersze
    // z poprzedniego renderu zostają i test daje fałszywy alarm)
    let inner = '';
    Object.defineProperty(node, 'innerHTML', {
      get: () => inner,
      set(v) { inner = v; if (v === '') node.children.length = 0; },
    });
    return node;
  }

  const document = {
    title: '',
    createElement: element,
    querySelectorAll: () => [],
    getElementById(id) {
      if (!realIds.has(id)) throw new Error('brak id="' + id + '" w index.html');
      if (!nodes.has(id)) nodes.set(id, element('div'));
      return nodes.get(id);
    },
  };
  return makeCtx({ document });
}

const logic = makeCtx();
const run = src => vm.runInContext(src, logic);

const SLOTS = {
  coop2v2: `[{ kind: 'human', team: 0 }, { kind: 'human', team: 0 },
             { kind: 'bot', team: 1 }, { kind: 'bot', team: 1 },
             { kind: 'closed', team: 2 }, { kind: 'closed', team: 3 }]`,
  boss: `[{ kind: 'human', team: 0 }, { kind: 'human', team: 0 },
          { kind: 'closed', team: 2 }, { kind: 'closed', team: 3 }, { kind: 'closed', team: 4 },
          { kind: 'boss', team: 1 }]`,
  gaps: `[{ kind: 'human', team: 0 }, { kind: 'closed', team: 5 },
          { kind: 'human', team: 0 }, { kind: 'bot', team: 1 },
          { kind: 'closed', team: 5 }, { kind: 'bot', team: 1 }]`,
  team3v3: `[{ kind: 'bot', team: 0 }, { kind: 'bot', team: 0 }, { kind: 'bot', team: 0 },
             { kind: 'bot', team: 1 }, { kind: 'bot', team: 1 }, { kind: 'bot', team: 1 }]`,
  soloWithAlly: `[{ kind: 'human', team: 0 }, { kind: 'bot', team: 0 },
                  { kind: 'bot', team: 1 }, { kind: 'closed', team: 3 },
                  { kind: 'closed', team: 4 }, { kind: 'closed', team: 5 }]`,
};

// Nowa partia z podanego układu slotów. Od razu wystawia w sandboxie `A` i `B` — id
// imperiów drużyny 0 i 1 — bo assignTeamPositions przestawia sloty, więc stały indeks nic
// nie znaczy i każdy test i tak musi szukać graczy po drużynie, nie po pozycji w tabeli
const newTeamGame = (slots, seed) => run(`
  newGame({ slots: ${slots}, aiDifficulty: 'normal', seed: ${seed}, timeLimit: Infinity });
  var A = state.players.filter(p => p.team === 0).map(p => p.id);
  var B = state.players.filter(p => p.team === 1).map(p => p.id);`);

/* ---------------- 1. skład partii ze slotów ---------------- */

section('Skład partii ze slotów');
newTeamGame(SLOTS.coop2v2, 4242);
const A = run('A'), B = run('B');

check('zamknięte sloty nie tworzą imperium', run('state.players.length') === 4, run('state.players.length'));
check('id są ciągłe (0..n-1)', run('state.players.map(p => p.id).join()') === '0,1,2,3');
check('skiny to otwarte wiersze lobby',
  run('state.players.map(p => p.skin).slice().sort().join()') === '0,1,2,3',
  run('state.players.map(p => p.skin).join()'));
check('dwie drużyny po dwa imperia', A.length === 2 && B.length === 2, JSON.stringify({ A, B }));
check('sameTeam: sojusznicy', run('sameTeam(A[0], A[1])') === true);
check('sameTeam: wrogowie', run('sameTeam(A[0], B[0])') === false);
check('dwoje ludzi => tryb multi', run('state.mode') === 'multi');
check('transport domyślnie lokalny', run('state.transport') === 'local');
check('nie da się przekroczyć MAX_PLAYERS', run(`
  newGame({ slots: [0,1,2,3,4,5,6,7].map(function (i) { return { kind: 'bot', team: i }; }),
            aiDifficulty: 'normal', seed: 1, timeLimit: Infinity });
  state.players.length`) === run('MAX_PLAYERS'));

/* ---------------- 2. reguły sojuszu ---------------- */

section('Reguły sojuszu');
newTeamGame(SLOTS.coop2v2, 4242);

run(`var t = state.tiles[3][3];
     t.land = true; t.city = null; t.road = null; t.resource = null; t.army = null;
     t.owner = A[1]; captureTile(t, A[0]);`);
check('captureTile nie zabiera pola sojusznika', run('state.tiles[3][3].owner') === run('A[1]'));
run(`state.tiles[3][3].owner = B[0]; captureTile(state.tiles[3][3], A[0]);`);
check('captureTile zabiera pole wroga', run('state.tiles[3][3].owner') === run('A[0]'));

run(`var a = state.tiles[5][5], b = state.tiles[5][6];
     a.land = true; b.land = true;
     a.army = { player: A[0], str: 10, vet: 0, type: 'infantry', mp: 2, activated: false };
     b.army = { player: A[1], str: 10, vet: 0, type: 'infantry', mp: 2, activated: false };`);
check('canStep blokuje pole z armią sojusznika',
  run(`canStep(state.tiles[5][5], state.tiles[5][6], A[0], 'infantry')`) === false);
check('validMoves nie proponuje pola sojusznika',
  run(`validMoves(state.tiles[5][5]).indexOf(state.tiles[5][6])`) === -1);
run(`state.tiles[5][6].army.player = B[0];`);
check('canStep dopuszcza atak na wroga',
  run(`canStep(state.tiles[5][5], state.tiles[5][6], A[0], 'infantry')`) === true);
check('canOrderMove odrzuca cudzą armię',
  run(`canOrderMove(B[0], state.tiles[5][5], state.tiles[5][6])`) === false);
run(`state.tiles[5][5].army = null; state.tiles[5][6].army = null;`);

run(`var ally = state.tiles[7][7]; ally.land = true; ally.owner = A[1]; ally.resource = 'oil';
     var foe = state.tiles[7][9]; foe.land = true; foe.owner = B[0]; foe.resource = 'oil';`);
check('aiTargets pomija złoże sojusznika',
  run(`aiTargets(A[0]).some(g => g.t === state.tiles[7][7])`) === false);
check('aiTargets widzi złoże wroga',
  run(`aiTargets(A[0]).some(g => g.t === state.tiles[7][9])`) === true);
check('aiFrontDistance ignoruje teren sojusznika',
  run(`aiFrontDistance(A[0], state.tiles[7][7]) > 0`) === true);

// drogi są wspólne dla drużyny — ale tylko do jazdy, nie do zaopatrzenia
run(`var rA = state.tiles[9][9], rB = state.tiles[9][10];
     rA.land = true; rB.land = true; rA.army = null; rB.army = null;
     rB.owner = A[1]; rB.road = { owner: A[1] };`);
check('droga sojusznika jest przejezdna jak własna',
  run(`moveCostStep(rA, rB, A[0])`) === run('MOVE_COST_ROAD'));
check('droga wroga nie daje zniżki',
  run(`(function () { rB.owner = B[0]; rB.road = { owner: B[0] };
       return moveCostStep(rA, rB, A[0]); })()`) === run('MOVE_COST_DEFAULT'));
check('pole sojusznika BEZ drogi kosztuje normalnie (nie ma linii wewnętrznych poza bossem)',
  run(`(function () { rB.owner = A[1]; rB.road = null;
       return moveCostStep(rA, rB, A[0]); })()`) === run('MOVE_COST_DEFAULT'));
check('złoże sojusznika NIE zasila mojego miasta (gospodarka zostaje osobna)', run(`
  (function () {
    // pełny łańcuch: moje miasto — droga sojusznika — złoże sojusznika
    var res = state.tiles[9][11];
    res.land = true; res.owner = A[1]; res.resource = 'oil'; res.road = { owner: A[1] };
    var mine = connectedCities(res, A[0]);
    return mine.length === 0;
  })()`) === true);

/* ---------------- 3. koniec gry na drużyny ---------------- */

section('Koniec gry liczony na drużyny');
newTeamGame(SLOTS.coop2v2, 4242);
run(`state.players[A[1]].alive = false; checkGameOver();`);
check('gra trwa, gdy ginie jedno imperium z drużyny', run('state.phase') === 'active');
run(`B.forEach(function (id) { state.players[id].alive = false; }); checkGameOver();`);
check('koniec, gdy zostaje jedna żywa drużyna', run('state.phase') === 'over');

// single-player z sojusznikiem: porażka dopiero po całej drużynie człowieka
newTeamGame(SLOTS.soloWithAlly, 77);
check('jeden człowiek => tryb single', run('state.mode') === 'single');
check('state.human wskazuje człowieka po przestawieniu slotów',
  run('state.players[state.human].kind') === 'human',
  JSON.stringify(run('({ human: state.human, kinds: state.players.map(p => p.kind) })')));
run(`state.players[state.human].alive = false; checkGameOver();`);
check('single: gra trwa, gdy człowiek padł, a sojusznik żyje', run('state.phase') === 'active');
run(`state.players.forEach(function (p) {
       if (p.team === state.players[state.human].team) p.alive = false;
     }); checkGameOver();`);
check('single: porażka po śmierci całej drużyny człowieka', run('state.phase') === 'over');

/* ---------------- 4. boss ---------------- */

section('Boss');
newTeamGame(SLOTS.boss, 777);
run(`var boss = state.players.find(p => p.kind === 'boss');
     var hum = state.players.find(p => p.kind === 'human');`);
check('dokładnie jeden boss', run(`state.players.filter(p => p.kind === 'boss').length`) === 1);
check('boss ma własny zestaw sprite\'ów (BOSS_SKIN)', run('boss.skin') === run('BOSS_SKIN'));
check('boss ma barwę z PLAYERS_DEF[BOSS_SKIN]', run('boss.color') === run('PLAYERS_DEF[BOSS_SKIN].color'));
check('boss nie jest człowiekiem', run('boss.isHuman') === false);
check('boss jest po drugiej stronie', run('sameTeam(hum.id, boss.id)') === false);
check('boss dostaje premię ekonomiczną',
  run(`playerDifficulty(boss).economy > resolveDifficulty(boss.difficulty).economy`) === true,
  run('playerDifficulty(boss).economy'));
check('boss dostaje premię do agresji',
  run(`playerDifficulty(boss).aggression > resolveDifficulty(boss.difficulty).aggression`) === true);
check('boss atakuje przy gorszym stosunku sił',
  run(`playerDifficulty(boss).aggressionThreshold < resolveDifficulty(boss.difficulty).aggressionThreshold`) === true);
check('premia bossa siedzi NA presecie (suwak trudności dalej działa)', run(`
  (function () {
    var e = [];
    ['easy', 'normal', 'hard'].forEach(function (d) {
      newGame({ slots: ${SLOTS.boss}, aiDifficulty: d, seed: 5, timeLimit: Infinity });
      e.push(playerDifficulty(state.players.find(p => p.kind === 'boss')).economy);
    });
    return e[0] < e[1] && e[1] < e[2];
  })()`) === true);
check('zwykły gracz bez premii bossa', run(`
  (function () {
    newGame({ slots: ${SLOTS.coop2v2}, aiDifficulty: 'normal', seed: 5, timeLimit: Infinity });
    var p = state.players.find(function (q) { return q.kind === 'bot'; });
    return playerDifficulty(p).economy === resolveDifficulty(p.difficulty).economy;
  })()`) === true);

/* ---------------- 4a. zdolności bossa (reguły, nie liczby) ---------------- */

section('Zdolności bossa');
newTeamGame(SLOTS.boss, 4242);
run(`var boss = state.players.find(p => p.kind === 'boss');
     var hum = state.players.find(p => p.kind === 'human');
     // pole daleko od czyichkolwiek miast — tam kara za dystans jest największa
     var far = null, farD = -1;
     for (var r = 0; r < MAP_H; r++) for (var c = 0; c < MAP_W; c++) {
       var t = state.tiles[r][c];
       if (!t.land) continue;
       var d = Math.min(hexDist(t.c, t.r, boss.capital[0], boss.capital[1]),
                        hexDist(t.c, t.r, hum.capital[0], hum.capital[1]));
       if (d > farD) { farD = d; far = t; }
     }
     var sea = null;
     for (var r2 = 0; r2 < MAP_H && !sea; r2++) for (var c2 = 0; c2 < MAP_W && !sea; c2++) {
       if (!state.tiles[r2][c2].land) sea = state.tiles[r2][c2];
     }`);

check('boss ma pełne morale wszędzie na lądzie', run('moraleAt(boss.id, far)') === 100,
  run('moraleAt(boss.id, far)'));
check('nie-boss dostaje karę za dystans na tym samym polu',
  run('moraleAt(hum.id, far) < 100') === true, run('moraleAt(hum.id, far)'));
check('boss nadal traci morale na morzu', run('sea ? moraleAt(boss.id, sea) === 85 : true') === true,
  run('sea ? moraleAt(boss.id, sea) : "brak morza"'));
check('reguła morale dotyczy WYŁĄCZNIE bossa', run(`
  state.players.filter(function (p) { return p.kind !== 'boss'; })
    .every(function (p) { return moraleAt(p.id, far) < 100; })`) === true);

// linie wewnętrzne: własne terytorium w cenie drogi
run(`var a = null, b = null;
     for (var r = 1; r < MAP_H - 1 && !b; r++) for (var c = 1; c < MAP_W - 1 && !b; c++) {
       var t = state.tiles[r][c];
       if (!t.land) continue;
       var n = neighborsOf(t).filter(function (o) { return o.land; })[0];
       if (n) { a = t; b = n; }
     }
     b.road = null; b.owner = boss.id;`);
check('boss: wejście na własne pole kosztuje jak droga',
  run('moveCostStep(a, b, boss.id)') === run('MOVE_COST_ROAD'));
run(`b.owner = hum.id;`);
check('boss: cudze pole kosztuje normalnie',
  run('moveCostStep(a, b, boss.id)') === run('MOVE_COST_DEFAULT'));
check('zwykły gracz nie ma linii wewnętrznych',
  run('moveCostStep(a, b, hum.id)') === run('MOVE_COST_DEFAULT'));
check('reguła ruchu nie omija zaokrętowania (krok ląd<->woda dalej terminalny)',
  run(`sea ? moveCostStep(a, sea, boss.id) === Infinity : true`) === true);

// całościowo: na tym samym terenie boss dojeżdża dalej niż identyczny bot
check('boss przemieszcza się po swoim terenie dalej niż zwykły bot', run(`
  (function () {
    function reach(kind) {
      newGame({ slots: [
        { kind: kind, team: 1, difficulty: 'normal' },
        { kind: 'bot', team: 0, difficulty: 'normal' },
        { kind: 'closed', team: 2, difficulty: 'normal' }, { kind: 'closed', team: 3, difficulty: 'normal' },
        { kind: 'closed', team: 4, difficulty: 'normal' }, { kind: 'closed', team: 5, difficulty: 'normal' },
      ], seed: 4242, timeLimit: Infinity });
      var me = state.players[0];
      // całe otoczenie stolicy staje się terytorium testowanego gracza
      var cap = state.tiles[me.capital[1]][me.capital[0]];
      for (var r = 0; r < MAP_H; r++) for (var c = 0; c < MAP_W; c++) {
        var t = state.tiles[r][c];
        if (t.land && hexDist(t.c, t.r, cap.c, cap.r) <= 5) t.owner = me.id;
      }
      cap.army.type = 'tank';
      cap.army.mp = UNIT_TYPES.tank.mp;
      return validMoves(cap).length;
    }
    return reach('boss') > reach('bot');
  })()`) === true);

/* ---------------- 4b. trudność per slot ---------------- */

section('Trudność per slot');
run(`newGame({ slots: [
  { kind: 'human', team: 0, difficulty: null },
  { kind: 'bot', team: 1, difficulty: 'easy' },
  { kind: 'bot', team: 1, difficulty: 'nightmare' },
  { kind: 'boss', team: 2, difficulty: 'hard' },
  { kind: 'closed', team: 4, difficulty: 'normal' },
  { kind: 'closed', team: 5, difficulty: 'normal' },
], seed: 31, timeLimit: Infinity });`);
check('każdy bot dostaje SWOJĄ trudność ze slotu', run(`
  JSON.stringify(state.players.map(function (p) { return p.difficulty; }).slice().sort())`)
  === JSON.stringify([null, 'easy', 'hard', 'nightmare'].sort()),
  run('JSON.stringify(state.players.map(p => [p.kind, p.difficulty]))'));
check('człowiek nie dostaje trudności', run(`state.players.find(p => p.kind === 'human').difficulty`) === null);
check('różne sloty => różna realna siła botów', run(`
  (function () {
    var easy = state.players.find(function (p) { return p.difficulty === 'easy'; });
    var night = state.players.find(function (p) { return p.difficulty === 'nightmare'; });
    // brak któregokolwiek = poprzednie sprawdzenie już zgłosiło błąd; tu tylko nie wywalamy się
    if (!easy || !night) return false;
    return playerDifficulty(easy).economy < playerDifficulty(night).economy;
  })()`) === true);
check('boss liczy premię od SWOJEGO presetu', run(`
  (function () {
    var b = state.players.find(function (p) { return p.kind === 'boss'; });
    if (!b) return false;
    return b.difficulty === 'hard' &&
      playerDifficulty(b).economy > resolveDifficulty('hard').economy;
  })()`) === true);
check('state.aiDifficulty = najczęstsza trudność botów (fallback dla switchHuman)',
  run('state.aiDifficulty') === 'easy' || run('state.aiDifficulty') === 'hard' ||
  run('state.aiDifficulty') === 'nightmare', run('state.aiDifficulty'));
check('trudności per slot przeżywają zapis', run(`
  (function () {
    var before = JSON.stringify(state.players.map(function (p) { return p.difficulty; }));
    deserializeGame(JSON.parse(JSON.stringify(serializeGame())));
    return JSON.stringify(state.players.map(function (p) { return p.difficulty; })) === before;
  })()`) === true);
check('brak trudności w slocie => wspólna trudność gry (zgodność wsteczna)', run(`
  (function () {
    newGame({ humanCount: 0, botCount: 3, aiDifficulty: 'hard', seed: 9, timeLimit: Infinity });
    return state.players.every(function (p) { return p.difficulty === 'hard'; });
  })()`) === true);

/* ---------------- 5. rozstawienie stolic ---------------- */

section('Rozstawienie stolic');
// Wymóg: sojusznik NIE DALEJ niż najbliższy wróg. Równość jest poprawna — przy sześciu
// stolicach na mapie 23×14 fronty stykają się w środku i inaczej być nie może.
function spawnOk(label, slots, seed) {
  newTeamGame(slots, seed);
  const players = run('state.players.map(p => ({ id: p.id, team: p.team, cap: p.capital }))');
  let worst = null;
  for (const p of players) {
    const mates = players.filter(o => o.id !== p.id && o.team === p.team);
    if (!mates.length) continue;
    const d = o => run(`hexDist(${p.cap[0]}, ${p.cap[1]}, ${o.cap[0]}, ${o.cap[1]})`);
    const mate = Math.min(...mates.map(d));
    const foe = Math.min(...players.filter(o => o.team !== p.team).map(d));
    if (mate > foe) worst = `#${p.id}: sojusznik ${mate}, wróg ${foe}`;
  }
  check('sojusznicy startują razem — ' + label, worst === null, worst);
}
spawnOk('co-op 2v2', SLOTS.coop2v2, 123);
spawnOk('tryb bossa', SLOTS.boss, 123);
spawnOk('3v3', SLOTS.team3v3, 123);
spawnOk('zamknięte sloty w środku tabeli', SLOTS.gaps, 123);

// FFA musi zostać dokładnie takie jak przed wprowadzeniem drużyn — inaczej wyniki
// sim.js i stress.js przestają być porównywalne z historycznymi pomiarami
run(`newGame({ humanCount: 1, botCount: 3, aiDifficulty: 'normal', seed: 123, timeLimit: Infinity });`);
check('FFA: stolice dokładnie jak CAPITAL_SPOTS[0..n-1]',
  run('JSON.stringify(state.players.map(p => p.capital))') === run('JSON.stringify(CAPITAL_SPOTS.slice(0, 4))'),
  run('JSON.stringify(state.players.map(p => p.capital))'));
check('FFA: każdy we własnej drużynie', run('new Set(state.players.map(p => p.team)).size') === 4);
check('FFA: skin = id', run('state.players.every(p => p.skin === p.id)') === true);

/* ---------------- 6. nazwy stolic ---------------- */

section('Nazwy stolic');
for (const [label, slots] of [['co-op 2v2', SLOTS.coop2v2], ['tryb bossa', SLOTS.boss], ['zamknięte sloty', SLOTS.gaps]]) {
  newTeamGame(slots, 909);
  const bad = run(`state.players.filter(function (p) {
    var t = state.tiles[p.capital[1]][p.capital[0]];
    return !t.city || t.city.name !== p.name;
  }).map(function (p) { return p.name; })`);
  check('stolica nosi nazwę swojego imperium — ' + label, bad.length === 0, JSON.stringify(bad));
}

/* ---------------- 7. zapis i wczytanie ---------------- */

section('Zapis partii drużynowej');
newTeamGame(SLOTS.boss, 777);
const before = run('JSON.stringify(state.players.map(p => [p.kind, p.team, p.skin, p.capital]))');
run(`var __ok = deserializeGame(JSON.parse(JSON.stringify(serializeGame())));`);
check('deserializeGame przeszło', run('__ok') === true);
check('obsada, drużyny, skiny i stolice przeżyły zapis',
  run('JSON.stringify(state.players.map(p => [p.kind, p.team, p.skin, p.capital]))') === before);
check('transport przeżył zapis', run('state.transport') === 'local');
check('zapis starszego formatu odrzucony',
  run(`deserializeGame({ format: SAVE_FORMAT - 1, game: {} })`) === false);

/* ---------------- 8. lobby (stub DOM) ---------------- */

section('Lobby: tabela slotów');
const dom = makeDomCtx();
const runDom = src => vm.runInContext(src, dom);
runDom(`newGame({ humanCount: 2, botCount: 2, aiDifficulty: 'normal', seed: 1, timeLimit: 120 });`);
check('renderMpSetup nie wywala się (wszystkie id są w index.html)',
  (() => { try { runDom('renderMpSetup()'); return true; } catch (e) { return e.message; } })() === true,
  (() => { try { runDom('renderMpSetup()'); return ''; } catch (e) { return e.message; } })());
check('tabela ma MAX_PLAYERS wierszy',
  runDom(`document.getElementById('mp-slots').children.length`) === runDom('MAX_PLAYERS'));
// obsada + trudność + drużyna = trzy wyborniki w każdym wierszu
check('każdy wiersz ma trzy wyborniki (obsada, trudność, drużyna)',
  runDom(`document.getElementById('mp-slots').children
            .every(function (r) { return r.children.length === 3; })`) === true,
  runDom(`document.getElementById('mp-slots').children.map(function (r) { return r.children.length; }).join()`));
check('trudność wyłączona dla slotów bez AI, włączona dla botów i bossa', runDom(`
  (function () {
    state.mpSetup.slots = mpPreset('boss');
    renderMpSetup();
    var rows = document.getElementById('mp-slots').children;
    return state.mpSetup.slots.every(function (s, i) {
      var ai = s.kind === 'bot' || s.kind === 'boss';
      return rows[i].children[1].disabled === !ai;
    });
  })()`) === true);
check('zmiana trudności w slocie trafia do gracza', runDom(`
  (function () {
    state.mpSetup.slots = mpPreset('coop');
    state.mpSetup.slots[2].difficulty = 'nightmare';
    state.mpSetup.slots[3].difficulty = 'easy';
    newGame({ slots: state.mpSetup.slots, seed: 3, timeLimit: 120 });
    var diffs = state.players.map(function (p) { return p.difficulty; }).filter(Boolean).sort();
    return diffs.join() === 'easy,nightmare';
  })()`) === true, runDom(`state.players.map(function (p) { return p.kind + ':' + p.difficulty; }).join()`));
check('domyślny układ (co-op) pozwala wystartować',
  runDom(`document.getElementById('mp-start').disabled`) === false);

runDom(`state.mpSetup.slots.forEach(function (s, i) { s.kind = i === 0 ? 'human' : 'closed'; }); renderMpSetup();`);
check('Start zablokowany przy jednym otwartym slocie',
  runDom(`document.getElementById('mp-start').disabled`) === true &&
  runDom(`document.getElementById('mp-slots-warning').hidden`) === false);

runDom(`state.mpSetup.slots.forEach(function (s) { s.kind = 'human'; s.team = 0; }); renderMpSetup();`);
check('Start zablokowany, gdy wszyscy w jednej drużynie',
  runDom(`document.getElementById('mp-start').disabled`) === true);

runDom(`state.mpSetup.slots = mpPreset('boss'); renderMpSetup();`);
check('preset "tryb bossa": jeden boss, dwie drużyny, Start wolny',
  runDom(`state.mpSetup.slots.filter(s => s.kind === 'boss').length`) === 1 &&
  runDom(`document.getElementById('mp-start').disabled`) === false);
runDom(`state.mpSetup.slots = mpPreset('ffa'); renderMpSetup();`);
check('preset FFA: cztery osobne drużyny',
  runDom(`new Set(state.mpSetup.slots.filter(s => s.kind !== 'closed').map(s => s.team)).size`) === 4);
runDom(`state.mpSetup.slots = mpPreset('coop'); renderMpSetup();`);
check('preset co-op: dwie drużyny po dwa sloty',
  runDom(`new Set(state.mpSetup.slots.filter(s => s.kind !== 'closed').map(s => s.team)).size`) === 2);

section('Panel boczny');
runDom(`newGame({ slots: ${SLOTS.boss}, aiDifficulty: 'normal', seed: 5, timeLimit: 120 }); updateUI();`);
const teamRows = runDom(`document.getElementById('players').children.map(c => c.innerHTML).join('|')`);
check('drużynowa partia pokazuje litery drużyn', /team-badge/.test(teamRows));
check('boss ma własną ikonę', /💀/.test(teamRows), teamRows);
runDom(`newGame({ humanCount: 1, botCount: 3, aiDifficulty: 'normal', seed: 7, timeLimit: Infinity }); updateUI();`);
check('FFA nie pokazuje liter drużyn (byłyby szumem)',
  !/team-badge/.test(runDom(`document.getElementById('players').children.map(c => c.innerHTML).join('|')`)));

/* ---------------- 9. pełne partie ---------------- */

section('Pełne partie AI-vs-AI (' + GAMES + ' na układ)');
// Sterownik wierny pętli gry (wzorem sim.js): resetMoved -> aktywacje -> produce.
// Trudność przez playerDifficulty, żeby boss dostał swoje mnożniki.
run(`
  function __playTeams(slots, seed, rngSeed, maxRounds) {
    newGame({ slots: slots, aiDifficulty: 'normal', seed: seed, timeLimit: Infinity });
    Math.random = makeRng(rngSeed);
    var diff = state.players.map(function (p) { return playerDifficulty(p); });
    var round = 0, allyHits = 0;
    while (round < maxRounds && state.phase !== 'over') {
      round++;
      state.turn = round;
      for (var i = 0; i < state.players.length; i++) {
        var p = state.players[i];
        if (!p.alive || state.phase === 'over') continue;
        resetMoved(p.id);
        var act = ACTIVATIONS_PER_TURN, guard = 0;
        while (act > 0 && guard++ < 200) {
          var mv = aiPickMove(p.id, diff[p.id]);
          if (!mv) break;
          // ruch na pole sojusznika nie powinien być w ogóle wykonalny
          if (mv.to.army && mv.to.army.player !== p.id && sameTeam(mv.to.army.player, p.id)) allyHits++;
          act -= executeMove(mv.from, mv.to);
          if (state.phase === 'over') break;
        }
        if (state.phase === 'over') break;
        produce(p.id);
      }
    }
    var alive = state.players.filter(function (p) { return p.alive; });
    return {
      over: state.phase === 'over', round: round, allyHits: allyHits,
      aliveTeams: new Set(alive.map(function (p) { return p.team; })).size,
      alive: alive.length,
    };
  }
`);

for (const [label, slots] of [['2v2', SLOTS.coop2v2], ['boss', SLOTS.boss], ['3v3', SLOTS.team3v3]]) {
  let decided = 0, allyHits = 0, badEnd = 0;
  const rounds = [];
  for (let i = 0; i < GAMES; i++) {
    const r = run(`__playTeams(${slots}, ${2000 + i * 53}, ${7000 + i * 67}, 400)`);
    if (r.over) { decided++; if (r.aliveTeams !== 1) badEnd++; }
    allyHits += r.allyHits;
    rounds.push(r.round);
  }
  rounds.sort((a, b) => a - b);
  check(`${label}: zero ataków na sojusznika`, allyHits === 0, allyHits);
  check(`${label}: rozstrzygnięta partia zostawia jedną drużynę`, badEnd === 0, badEnd);
  // remisy nie są błędem (limit rund istnieje też w FFA), ale całkowity brak
  // rozstrzygnięć oznaczałby, że drużyny zepsuły domykanie gier
  check(`${label}: partie się kończą (${decided}/${GAMES}, mediana ${rounds[Math.floor(rounds.length / 2)]} rund)`,
    decided > 0, decided);
}

/* ---------------- podsumowanie ---------------- */

console.log('');
if (failures) {
  console.log(`BŁĘDY: ${failures} (przeszło ${passed})`);
  process.exit(1);
}
console.log(`OK: ${passed} sprawdzeń — drużyny, boss, rozstawienie, zapis i lobby bez zastrzeżeń.`);
