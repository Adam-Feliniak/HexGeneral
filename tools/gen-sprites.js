'use strict';
/* Generator sprite'ów pixel-art (styl Metal Slug) -> assets/*.png
   Uruchomienie: node tools/gen-sprites.js
   Bez zależności — własny enkoder PNG (zlib + CRC32).
   Jednostki i budynki rysowane w dużej rozdzielczości "painterem"
   (prostokąty/elipsy + automatyczny kontur), drobiazgi jako siatki ASCII. */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets');

// kolory graczy — muszą zgadzać się z PLAYERS_DEF w src/config.js
const PLAYERS = [
  { color: '#d64550', dark: '#8c2530' },
  { color: '#3f7fd6', dark: '#24518f' },
  { color: '#3fae62', dark: '#22703c' },
  { color: '#d6a53f', dark: '#8f6a1f' },
];

function hexToRGB(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lighten(hex, k) {
  const [r, g, b] = hexToRGB(hex).map(v => Math.round(v + (255 - v) * k));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

const BASE_PAL = {
  o: '#16140c',                                // kontur
  g: '#4a4a42', G: '#6a6a5e', t: '#2e2c24',    // metal / gąsienice
  T: '#4a3e2c',                                // bieżnik gąsienic
  w: '#8f8d7a', W: '#b8b4a0',                  // koła / jasny metal
  s: '#cbb36a', S: '#a89050', z: '#e0cc8a',    // worki / piaskowiec
  e: '#241f14', i: '#7aa0b8',                  // mrok / szyby
  c: '#9aa38f', C: '#6e7566', x: '#b8bfa8',    // beton
  d: '#a8663c', D: '#7a4628', q: '#c07a48',    // cegła
  l: '#3f7a33', L: '#2c5c24', p: '#5a9c48',    // liście
  k: '#6b4a2a', K: '#4a3018',                  // pień / skóra ekwipunku
  r: '#8f8a76', R: '#6e6a58',                  // skała
  n: '#e8b98a', N: '#b8845a',                  // skóra
  a: '#c04a32', A: '#e8d8b0',                  // markiza / jasny akcent
  u: '#8f3222',                                // ciemna czerwień kontenera
  y: '#ffd91c', Y: '#b89410',                  // żółte akcenty
  F: '#dff0fa',                                // piana / kilwater
};

// ---------- painter: siatka znaków + proste kształty ----------

function makeGrid(w, h) { return Array.from({ length: h }, () => Array(w).fill('.')); }
function toRows(g) { return g.map(r => r.join('')); }

function P(g, x, y, ch) {
  x = Math.round(x); y = Math.round(y);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
}

function rect(g, x, y, w, h, ch) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(g, x + i, y + j, ch);
}

function ellipseFill(g, cx, cy, rx, ry, ch) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) P(g, x, y, ch);
    }
  }
}

// każdy kolorowy piksel stykający się z pustką (lub krawędzią) -> kontur
function outline(g) {
  const h = g.length, w = g[0].length;
  const src = g.map(r => r.slice());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y][x] === '.') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const row = src[y + dy];
        const v = row === undefined ? undefined : row[x + dx];
        if (v === undefined || v === '.') { g[y][x] = 'o'; break; }
      }
    }
  }
}

// ---------- czołg 48x28 w duchu SV-001 z Metal Sluga ----------

function tankGrid() {
  const g = makeGrid(48, 28);

  // gąsienica: masywna zaokrąglona bryła z bieżnikiem
  rect(g, 2, 17, 44, 10, 't');
  rect(g, 4, 16, 40, 12, 't');
  for (let x = 5; x <= 42; x += 2) { P(g, x, 17, 'T'); P(g, x + 1, 26, 'T'); }

  // koła: dwa napędowe + trzy jezdne
  const wheel = (cx, cy, r) => {
    ellipseFill(g, cx, cy, r, r, 'o');
    ellipseFill(g, cx, cy, r - 1.2, r - 1.2, 'w');
    ellipseFill(g, cx - r * 0.3, cy - r * 0.3, (r - 1.2) * 0.55, (r - 1.2) * 0.55, 'W');
    ellipseFill(g, cx, cy, r * 0.3, r * 0.3, 'e');
  };
  wheel(9, 21.5, 4.8);
  wheel(38, 21.5, 4.8);
  wheel(17.5, 22.5, 2.8);
  wheel(23.5, 22.5, 2.8);
  wheel(29.5, 22.5, 2.8);

  // pękata wieża-kadłub (jedna bryła jak w SV-001)
  ellipseFill(g, 17, 10, 13.5, 7, 'b');
  ellipseFill(g, 12, 7, 6.5, 2.8, 'h');
  for (let y = 14; y <= 17; y++) {
    for (let x = 0; x < 48; x++) if (g[y][x] === 'b') g[y][x] = 'B';
  }

  // właz z pokrywą na grzbiecie
  ellipseFill(g, 23, 3.5, 4, 2, 'b');
  rect(g, 21, 2, 3, 1, 'h');
  rect(g, 19, 5, 9, 1, 'B');

  // antenka z kulką
  rect(g, 14, 0, 3, 2, 'W');
  rect(g, 15, 2, 1, 3, 'e');

  // przednia płyta z "twarzą" (dwa ciemne wzierniki)
  rect(g, 26, 13, 8, 3, 'W');
  rect(g, 26, 15, 8, 1, 'w');
  P(g, 28, 14, 'e');
  P(g, 31, 14, 'e');

  // armata: krótka gruba lufa + rozszerzony stożkowy wylot
  rect(g, 28, 9, 10, 4, 'g');
  rect(g, 28, 9, 10, 1, 'G');
  rect(g, 37, 9, 9, 7, 'b');
  rect(g, 37, 9, 9, 2, 'h');
  rect(g, 37, 14, 9, 2, 'B');
  rect(g, 37, 9, 2, 7, 'G');
  P(g, 45, 9, '.'); P(g, 45, 15, '.');

  // ciemna linia wzdłuż górnej krawędzi gąsienicy
  for (let x = 0; x < 48; x++) if (g[16][x] !== '.') g[16][x] = 'o';

  outline(g);
  return toRows(g);
}

// ---------- piechur 24x30, dwie klatki (kroki / nogi razem) ----------

const SOLDIER_TOP = [
  '........oooooooo........',
  '......oohhhhhhhhoo......',
  '.....ohhhhhhhbbbbo......',
  '.....ohhhbbbbbbbbo......',
  '.....obbbbbbbbbbbo......',
  '.....oBBBBBBBBBBBo......',
  '......ooooooooooo.......',
  '......onnnnnnnnno.......',
  '......onnnnennneo.......',
  '......oNnnnnnnnNo.......',
  '.......oNNNNNNNo........',
  '.....oobbbbbbbboo.......',
  '....obbbbbbbbbbbbo......',
  '..okkobbbbbbbbbbbo......',
  '..okkobbbbbbbbbnnGgggggg',
  '..okkobbbbbbbbbnKKgggggg',
  '..oKkobbbbbbbbbbbo......',
  '..oKKobbbbbbbbbbbo......',
  '...ooeeeyyeeeeeoo.......',
];
const SOLDIER_LEGS_A = [
  '....obbbbbbbbbbbo.......',
  '....obbbbo.obbbbo.......',
  '...obbbbo..obbbbo.......',
  '...obbbo...obbbbo.......',
  '...oBBBo....oBBBo.......',
  '...oBBBo....oBBBo.......',
  '..okkkko....okkkko......',
  '..okkkko....okkkko......',
  '.okkkkko....okkkkko.....',
  '.oKKKKko....oKKKKko.....',
  '.oooooo.....ooooooo.....',
];
const SOLDIER_LEGS_B = [
  '....obbbbbbbbbbbo.......',
  '.....obbbbobbbbo........',
  '.....obbbbobbbbo........',
  '.....obbbobbbbo.........',
  '.....oBBBoBBBBo.........',
  '.....oBBBoBBBo..........',
  '....okkkokkkko..........',
  '....okkkokkkko..........',
  '...okkkkokkkkko.........',
  '...oKKKkoKKKkko.........',
  '...ooooo.oooooo.........',
];

// ---------- okręty — trzy klasy wg siły armii (piana malowana PO konturze,
// żeby kilwater nie dostał ciemnego obrysu) ----------

// barka desantowa 36x18 (armie < 20): sterówka, ładunek, uniesiona rampa
function ship0() {
  const g = makeGrid(36, 18);
  rect(g, 2, 8, 32, 6, 'g');
  rect(g, 2, 9, 32, 1, 'b');       // pas w kolorze gracza (pod krawędzią, by przetrwał kontur)
  rect(g, 3, 12, 30, 2, 't');      // linia wodna
  for (let i = 0; i < 6; i++) {    // rampa desantowa na dziobie
    P(g, 29 + i, 11 - i, 'W');
    P(g, 29 + i, 12 - i, 'w');
  }
  rect(g, 4, 3, 7, 5, 'b');        // sterówka
  rect(g, 4, 3, 7, 1, 'h');
  rect(g, 6, 5, 3, 2, 'i');
  rect(g, 14, 5, 9, 3, 'k');       // ładunek pod plandeką
  rect(g, 14, 5, 9, 1, 'K');
  outline(g);
  for (let x = 3; x < 33; x += 4) { P(g, x, 15, 'F'); P(g, x + 1, 15, 'F'); }
  P(g, 0, 12, 'F'); P(g, 1, 13, 'F'); P(g, 0, 14, 'F');
  P(g, 34, 13, 'F'); P(g, 35, 12, 'F');
  return toRows(g);
}

// pancernik 48x24 (armie 20-69): zwarty i masywny — długi kiosk od rufy
// po śródokręcie (mostek, komin, maszt), przed nim dwie wieże w układzie
// superfiring z podwójnymi lufami w stronę dziobu
function ship1() {
  const g = makeGrid(48, 24);
  // kadłub z dziobem ściętym ku prawej
  for (let j = 0; j < 5; j++) rect(g, 1, 13 + j, 45 - j, 1, 'g');
  rect(g, 1, 14, 44, 1, 'b');
  rect(g, 2, 18, 41, 2, 't');
  // długi kiosk na 2/3 długości okrętu
  rect(g, 3, 7, 22, 6, 'G');
  rect(g, 3, 12, 22, 1, 'g');
  for (let x = 5; x <= 21; x += 4) rect(g, x, 9, 2, 2, 'i');
  // mostek, maszt i komin na kiosku
  rect(g, 5, 3, 11, 4, 'G');
  rect(g, 6, 4, 9, 1, 'i');
  rect(g, 10, 0, 1, 3, 'e');
  rect(g, 18, 3, 4, 4, 'g');
  rect(g, 18, 3, 4, 1, 'e');
  // barbeta + wieża górna (bliżej kiosku, podniesiona)
  rect(g, 25, 10, 6, 3, 'G');
  rect(g, 25, 6, 7, 4, 'b');
  rect(g, 25, 6, 7, 1, 'h');
  rect(g, 32, 6, 8, 1, 'g');
  rect(g, 32, 8, 8, 1, 'g');
  // wieża dolna na dziobie
  rect(g, 31, 10, 7, 3, 'b');
  rect(g, 31, 10, 7, 1, 'h');
  rect(g, 38, 10, 8, 1, 'g');
  rect(g, 38, 12, 8, 1, 'g');
  outline(g);
  for (let x = 4; x < 42; x += 5) { P(g, x, 21, 'F'); P(g, x + 1, 21, 'F'); }
  P(g, 46, 14, 'F'); P(g, 47, 15, 'F'); P(g, 46, 16, 'F');
  P(g, 0, 15, 'F'); P(g, 0, 17, 'F');
  return toRows(g);
}

// lotniskowiec 50x22 (armie 70+): płaski pokład, wyspa z radarem i samolot
function ship2() {
  const g = makeGrid(50, 22);
  rect(g, 0, 7, 50, 3, 'g');       // pokład lotniczy
  rect(g, 0, 7, 50, 1, 'G');
  for (let x = 2; x < 48; x += 4) P(g, x, 8, 'W'); // przerywana oś pasa
  rect(g, 3, 10, 44, 6, 'g');      // kadłub
  rect(g, 3, 10, 44, 1, 'b');
  rect(g, 4, 14, 41, 2, 't');
  rect(g, 34, 2, 8, 5, 'G');       // wyspa
  rect(g, 35, 3, 3, 2, 'i');
  rect(g, 40, 0, 1, 2, 'e');       // maszt radaru
  rect(g, 7, 4, 9, 2, 'W');        // samolocik na pokładzie
  P(g, 16, 4, 'w'); P(g, 16, 5, 'w');
  rect(g, 10, 3, 3, 1, 'w');       // skrzydła
  rect(g, 9, 6, 4, 1, 'w');
  P(g, 7, 3, 'W');                 // statecznik
  outline(g);
  for (let x = 6; x < 45; x += 5) { P(g, x, 17, 'F'); P(g, x + 1, 17, 'F'); }
  P(g, 48, 11, 'F'); P(g, 49, 12, 'F');
  P(g, 1, 12, 'F'); P(g, 0, 13, 'F');
  return toRows(g);
}

// ---------- stolica 48x34: bunkier-kwatera z flagą, bramą i workami ----------

function capitalGrid() {
  const g = makeGrid(48, 34);

  // maszt z flagą właściciela
  rect(g, 5, 0, 2, 9, 'e');
  rect(g, 8, 0, 13, 7, 'b');
  rect(g, 8, 0, 13, 1, 'h');
  rect(g, 8, 6, 13, 1, 'B');
  rect(g, 13, 2, 3, 3, 'A');

  // bryła bunkra z betonową płytą dachu
  rect(g, 1, 9, 46, 25, 'c');
  rect(g, 1, 9, 46, 2, 'x');
  rect(g, 1, 11, 46, 1, 'C');
  rect(g, 43, 11, 4, 23, 'C');
  for (let x = 3; x <= 44; x += 5) P(g, x, 10, 'C'); // nity płyty

  // szczeliny strzelnicze
  for (let x = 5; x <= 38; x += 8) {
    rect(g, x, 14, 5, 3, 'e');
    rect(g, x, 14, 5, 1, 'i');
  }

  // pas ostrzegawczy + brama z poziomych segmentów
  for (let x = 16; x <= 31; x++) P(g, x, 19, ((x >> 1) % 2) ? 'y' : 'e');
  rect(g, 16, 20, 16, 14, 'o');
  rect(g, 17, 21, 14, 13, 'e');
  for (let y = 23; y <= 33; y += 3) rect(g, 17, y, 14, 1, 't');

  // worki z piaskiem po obu stronach bramy
  sandbags(g, 2, 14, 24, 33);
  sandbags(g, 33, 45, 24, 33);

  outline(g);
  return toRows(g);
}

function sandbags(g, x0, x1, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const row = (y - y0) >> 1;
      const ph = (x - x0 + row * 2) % 4;      // worki 4 px, przesunięte co rząd
      const pv = (y - y0) % 2;
      let ch = 's';
      if (ph === 3) ch = 'S';                 // szew między workami
      else if (pv === 1) ch = 'S';            // dolny cień worka
      else if (ph === 0) ch = 'z';            // rozświetlony brzeg
      P(g, x, y, ch);
    }
  }
}

// ---------- miasta 46x38 — trzy warianty zabudowy ----------

// spoiny cegieł w murze
function bricks(g, x0, x1, y0, y1) {
  for (let y = y0; y <= y1; y += 3) {
    for (let x = x0 + ((y / 3 | 0) % 2) * 3; x <= x1; x += 6) rect(g, x, y, 2, 1, 'D');
  }
}

// kamienica z cegły + sklepik z szyldem, markizą i witryną
function city0() {
  const g = makeGrid(46, 38);

  // kamienica
  rect(g, 1, 3, 21, 35, 'd');
  rect(g, 1, 3, 21, 2, 'x');
  rect(g, 1, 5, 21, 1, 'D');
  rect(g, 19, 6, 3, 32, 'D');
  bricks(g, 2, 18, 8, 34);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const x = 3 + c * 6, y = 7 + r * 6;
      rect(g, x, y, 4, 4, 'i');
      rect(g, x, y + 3, 4, 1, 'e');
      rect(g, x, y + 4, 4, 1, 'q');   // parapet
    }
  }
  rect(g, 7, 31, 8, 7, 'o');
  rect(g, 8, 32, 6, 6, 'e');

  // sklepik
  rect(g, 23, 13, 22, 25, 'c');
  rect(g, 23, 13, 22, 2, 'x');
  rect(g, 23, 15, 22, 1, 'C');
  rect(g, 43, 15, 2, 23, 'C');
  rect(g, 24, 17, 20, 5, 'y');       // szyld
  rect(g, 24, 21, 20, 1, 'Y');
  for (let x = 26; x <= 40; x += 4) rect(g, x, 18, 2, 2, 'e');
  for (let y = 23; y <= 25; y++) {   // markiza w paski
    for (let x = 23; x <= 44; x++) P(g, x, y, ((x >> 1) % 2) ? 'a' : 'A');
  }
  rect(g, 24, 27, 13, 11, 'o');      // witryna
  rect(g, 25, 28, 11, 9, 'i');
  rect(g, 25, 33, 11, 4, 'e');
  rect(g, 38, 27, 7, 11, 'o');       // drzwi
  rect(g, 39, 28, 5, 10, 'e');
  P(g, 40, 32, 'y');

  outline(g);
  return toRows(g);
}

// fabryka: blaszany dach, komin z cegły, rząd okien i wielka brama
function city1() {
  const g = makeGrid(46, 38);

  // komin
  rect(g, 33, 0, 7, 13, 'd');
  rect(g, 33, 0, 7, 2, 'D');
  rect(g, 38, 2, 2, 11, 'D');
  rect(g, 33, 2, 1, 11, 'q');
  rect(g, 33, 6, 7, 1, 'D');

  // hala z dachem z blachy falistej
  rect(g, 1, 8, 44, 4, 'w');
  for (let x = 2; x <= 44; x += 3) rect(g, x, 8, 1, 4, 'G');
  rect(g, 1, 12, 44, 26, 'c');
  rect(g, 1, 12, 44, 1, 'x');
  rect(g, 1, 13, 44, 1, 'C');
  rect(g, 42, 13, 3, 25, 'C');

  // rząd okien
  for (let x = 4; x <= 38; x += 7) {
    rect(g, x, 16, 5, 4, 'i');
    rect(g, x, 19, 5, 1, 'e');
  }

  // wentylator ścienny
  rect(g, 4, 26, 7, 7, 'o');
  rect(g, 5, 27, 5, 5, 'g');
  rect(g, 7, 27, 1, 5, 'G');
  rect(g, 5, 29, 5, 1, 'G');

  // pas ostrzegawczy + brama przesuwna
  for (let x = 14; x <= 31; x++) P(g, x, 23, ((x >> 1) % 2) ? 'y' : 'e');
  rect(g, 14, 24, 18, 14, 'o');
  rect(g, 15, 25, 16, 13, 'e');
  for (let y = 27; y <= 37; y += 3) rect(g, 15, y, 16, 1, 't');

  outline(g);
  return toRows(g);
}

// miasteczko: dom z dwuspadowym dachem + piaskowy zajazd z szyldem na słupie
function city2() {
  const g = makeGrid(46, 38);

  // dom z cegły z dwuspadowym dachem
  for (let j = 0; j <= 7; j++) rect(g, 10 - j, 3 + j, 2 + j * 2, 1, 'D');
  for (let j = 2; j <= 7; j++) P(g, 10 - j, 3 + j, 'q');
  rect(g, 1, 11, 21, 2, 'D');
  rect(g, 2, 13, 19, 25, 'd');
  rect(g, 19, 13, 2, 25, 'D');
  bricks(g, 3, 18, 15, 35);
  rect(g, 4, 16, 5, 5, 'i');  rect(g, 4, 20, 5, 1, 'e');
  rect(g, 13, 16, 5, 5, 'i'); rect(g, 13, 20, 5, 1, 'e');
  rect(g, 4, 25, 5, 5, 'i');  rect(g, 4, 29, 5, 1, 'e');
  rect(g, 13, 25, 5, 5, 'i'); rect(g, 13, 29, 5, 1, 'e');
  rect(g, 8, 31, 7, 7, 'o');
  rect(g, 9, 32, 5, 6, 'e');

  // szyld na słupie
  rect(g, 39, 1, 2, 13, 'e');
  rect(g, 30, 1, 12, 8, 'o');
  rect(g, 31, 2, 10, 6, 'y');
  rect(g, 31, 7, 10, 1, 'Y');
  for (let x = 33; x <= 38; x += 3) rect(g, x, 3, 2, 3, 'e');

  // piaskowy zajazd
  rect(g, 23, 14, 22, 24, 's');
  rect(g, 23, 14, 22, 2, 'x');
  rect(g, 23, 16, 22, 1, 'S');
  rect(g, 43, 16, 2, 22, 'S');
  rect(g, 25, 19, 6, 5, 'i'); rect(g, 25, 23, 6, 1, 'e');
  rect(g, 37, 19, 6, 5, 'i'); rect(g, 37, 23, 6, 1, 'e');
  rect(g, 25, 24, 6, 1, 'z');
  rect(g, 37, 24, 6, 1, 'z');
  rect(g, 31, 28, 8, 10, 'o');
  rect(g, 32, 29, 6, 9, 'e');
  P(g, 36, 33, 'y');

  outline(g);
  return toRows(g);
}

// miasto portowe: magazyn z blachy, żuraw ze zwisającym kontenerem,
// keja z pasem ostrzegawczym, kontenery i pachołek cumowniczy
function cityPort() {
  const g = makeGrid(46, 38);

  // wysięgnik żurawia z przeciwwagą
  rect(g, 9, 2, 35, 2, 'y');
  rect(g, 9, 4, 35, 1, 'Y');
  rect(g, 40, 5, 4, 3, 'g');

  // kratownicowa wieża
  rect(g, 31, 4, 2, 26, 'y');
  rect(g, 36, 4, 2, 26, 'y');
  for (let y = 7; y <= 27; y += 4) rect(g, 33, y, 3, 1, 'Y');

  // kabina operatora
  rect(g, 27, 5, 4, 5, 'y');
  rect(g, 28, 6, 2, 2, 'i');

  // lina i zwisający czerwony kontener
  rect(g, 15, 4, 1, 4, 'e');
  rect(g, 11, 8, 10, 6, 'a');
  rect(g, 11, 13, 10, 1, 'u');
  for (let x = 12; x <= 19; x += 2) rect(g, x, 9, 1, 4, 'u');

  // magazyn z blachy falistej
  rect(g, 0, 15, 24, 2, 'g');
  rect(g, 0, 15, 24, 1, 'G');
  rect(g, 1, 17, 22, 13, 'w');
  for (let x = 2; x <= 21; x += 3) rect(g, x, 17, 1, 13, 'G');
  rect(g, 4, 21, 10, 9, 'o');
  rect(g, 5, 22, 8, 8, 'e');
  for (let y = 24; y <= 29; y += 3) rect(g, 5, y, 8, 1, 't');

  // keja z pasem ostrzegawczym na krawędzi
  rect(g, 0, 30, 46, 8, 'c');
  rect(g, 0, 32, 46, 1, 'C');
  for (let x = 0; x < 46; x++) P(g, x, 30, ((x >> 1) % 2) ? 'y' : 'e');

  // niebieski kontener, skrzynia i pachołek cumowniczy
  rect(g, 22, 24, 9, 6, 'i');
  for (let x = 24; x <= 28; x += 3) rect(g, x, 25, 1, 4, 'e');
  rect(g, 40, 26, 5, 4, 'k');
  rect(g, 40, 29, 5, 1, 'K');
  rect(g, 2, 33, 3, 3, 'g');
  rect(g, 2, 33, 3, 1, 'G');

  outline(g);
  return toRows(g);
}

// mały żuraw dostawiany do stolicy z portem
function craneGrid() {
  const g = makeGrid(20, 26);
  rect(g, 3, 2, 14, 2, 'y');
  rect(g, 3, 4, 14, 1, 'Y');
  rect(g, 11, 4, 3, 18, 'y');
  for (let y = 6; y <= 20; y += 4) rect(g, 11, y, 3, 1, 'Y');
  rect(g, 5, 5, 1, 4, 'e');
  rect(g, 2, 9, 7, 5, 'a');
  rect(g, 2, 13, 7, 1, 'u');
  rect(g, 4, 10, 1, 3, 'u');
  rect(g, 6, 10, 1, 3, 'u');
  rect(g, 1, 22, 18, 4, 'g');
  rect(g, 1, 22, 18, 1, 'G');
  outline(g);
  return toRows(g);
}

// ---------- złoża surowców 30x28 ----------

// szyb naftowy: żółty kiwon (koń pompowy) na stalowym podeście, z kałużą ropy
function resOil() {
  const g = makeGrid(30, 28);
  rect(g, 4, 24, 22, 3, 'g');            // podest
  rect(g, 4, 24, 22, 1, 'G');
  for (let j = 0; j < 14; j++) {         // trójnóg
    P(g, Math.round(14 - j / 3), 10 + j, 'g');
    P(g, Math.round(14 - j / 3) + 1, 10 + j, 'g');
    P(g, Math.round(14 + j / 3), 10 + j, 'g');
    P(g, Math.round(14 + j / 3) + 1, 10 + j, 'g');
  }
  rect(g, 3, 8, 24, 3, 'y');             // belka wahacza
  rect(g, 3, 10, 24, 1, 'Y');
  ellipseFill(g, 5, 9.5, 3, 3, 'g');     // przeciwwaga
  ellipseFill(g, 4, 8.5, 1.4, 1.4, 'G');
  rect(g, 25, 11, 4, 6, 'Y');            // łeb kiwona
  rect(g, 27, 17, 1, 7, 'e');            // żerdź
  outline(g);
  ellipseFill(g, 24, 26.5, 4, 1.4, 'e'); // kałuża ropy (bez konturu)
  return toRows(g);
}

// pole uprawne: łan zboża w rządkach + mały wiatrak
function resFarm() {
  const g = makeGrid(30, 28);
  ellipseFill(g, 15, 20, 13, 7, 's');    // łan
  for (let y = 15; y <= 26; y += 3) {    // rządki
    for (let x = 3; x <= 27; x++) if (g[y][x] === 's') g[y][x] = 'S';
  }
  for (let y = 13; y <= 26; y++) {       // kłosy
    for (let x = 3; x <= 27; x++) {
      if (g[y][x] === 's' && (x * 7 + y * 5) % 11 === 0) g[y][x] = 'z';
    }
  }
  for (let j = 1; j <= 4; j++) {         // śmigła wiatraka
    P(g, 6 - j, 6 - j, 'W'); P(g, 6 + j, 6 + j, 'W');
    P(g, 6 - j, 6 + j, 'W'); P(g, 6 + j, 6 - j, 'W');
  }
  P(g, 6, 6, 'e');
  rect(g, 4, 8, 4, 9, 'd');              // wieżyczka
  rect(g, 6, 8, 1, 9, 'D');
  outline(g);
  return toRows(g);
}

// kopalnia: hałda z obudowanym wejściem i wagonikiem
function resMine() {
  const g = makeGrid(30, 28);
  ellipseFill(g, 15, 17, 13, 9, 'r');    // hałda
  ellipseFill(g, 10, 12, 6, 3.5, 'w');
  ellipseFill(g, 21, 21, 6, 3, 'R');
  rect(g, 10, 15, 9, 11, 'e');           // wejście
  rect(g, 9, 14, 11, 1, 'k');            // drewniana obudowa
  rect(g, 9, 14, 1, 12, 'k');
  rect(g, 19, 14, 1, 12, 'K');
  rect(g, 22, 21, 6, 4, 'g');            // wagonik
  rect(g, 22, 21, 6, 1, 'G');
  P(g, 23, 25, 'e'); P(g, 26, 25, 'e');
  outline(g);
  return toRows(g);
}

// ---------- drzewa 26x28 — dwa warianty ----------

// posiane deterministycznie plamki tekstury w koronie
function leafTexture(g, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < g[0].length; x++) {
      if (g[y][x] !== 'l') continue;
      if ((x * 7 + y * 11) % 13 === 0) g[y][x] = 'L';
      else if ((x * 5 + y * 3) % 17 === 0) g[y][x] = 'p';
    }
  }
}

// rozłożyste drzewo z kilku kęp liści
function tree0() {
  const g = makeGrid(26, 28);
  ellipseFill(g, 13, 9, 10, 7, 'l');
  ellipseFill(g, 7, 7, 5.5, 4, 'l');
  ellipseFill(g, 19, 8, 5.5, 4.5, 'l');
  ellipseFill(g, 13, 4, 6, 3.5, 'l');
  ellipseFill(g, 9, 5, 5, 2.6, 'p');
  ellipseFill(g, 16, 3.5, 3, 1.6, 'p');
  ellipseFill(g, 17, 13, 6, 3, 'L');
  ellipseFill(g, 8, 13.5, 4, 2.2, 'L');
  leafTexture(g, 2, 16);
  rect(g, 12, 16, 3, 10, 'k');
  rect(g, 14, 17, 1, 9, 'K');
  P(g, 11, 24, 'k'); P(g, 16, 24, 'K');
  rect(g, 10, 25, 7, 1, 'k');
  rect(g, 9, 26, 9, 1, 'K');
  outline(g);
  return toRows(g);
}

// wyższe drzewo o dwóch kondygnacjach korony
function tree1() {
  const g = makeGrid(26, 28);
  ellipseFill(g, 13, 5, 6.5, 4, 'l');
  ellipseFill(g, 13, 12, 9.5, 5.5, 'l');
  ellipseFill(g, 10, 3.5, 3.5, 1.8, 'p');
  ellipseFill(g, 8, 10, 4, 2.4, 'p');
  ellipseFill(g, 17, 14.5, 5.5, 2.6, 'L');
  leafTexture(g, 1, 17);
  rect(g, 12, 17, 3, 9, 'k');
  rect(g, 14, 18, 1, 8, 'K');
  rect(g, 10, 26, 7, 1, 'K');
  outline(g);
  return toRows(g);
}

// ---------- skały 22x13 — dwa warianty ----------

// wielki głaz z pęknięciem i małym kamieniem obok
function rock0() {
  const g = makeGrid(22, 13);
  ellipseFill(g, 9, 7, 8.5, 5, 'r');
  ellipseFill(g, 7, 5, 5, 2.6, 'w');
  ellipseFill(g, 12, 9.5, 5.5, 2.6, 'R');
  ellipseFill(g, 18, 9.5, 3, 2.4, 'r');
  P(g, 18, 8, 'w');
  P(g, 9, 4, 'R'); P(g, 10, 5, 'R'); P(g, 10, 6, 'R');
  P(g, 11, 7, 'R'); P(g, 11, 8, 'R');
  outline(g);
  return toRows(g);
}

// rumowisko trzech kamieni (z odstępami, żeby kontur je rozdzielił)
function rock1() {
  const g = makeGrid(22, 13);
  ellipseFill(g, 5, 7.5, 4.4, 4, 'r');
  ellipseFill(g, 4, 6, 2.6, 1.8, 'w');
  ellipseFill(g, 6, 10, 3, 1.4, 'R');
  ellipseFill(g, 14, 8, 3.4, 3.4, 'r');
  ellipseFill(g, 13, 6.5, 2, 1.3, 'w');
  ellipseFill(g, 15, 10, 2.2, 1.2, 'R');
  ellipseFill(g, 19.5, 10.5, 1.9, 1.7, 'r');
  P(g, 19, 10, 'w');
  outline(g);
  return toRows(g);
}

// ---------- heksy terenu 50x58 (pointy-top, o 1 px szersze niż siatka,
// żeby sąsiednie kafle zachodziły na siebie i nie było szczelin) ----------

// paint(x, y, r) -> '#rrggbb' lub null; r = deterministyczny szum per piksel
function hexTilePixels(seed, paint) {
  const W = 50, H = 58, R = 29;
  const half = R * Math.sqrt(3) / 2;
  const px = new Uint8Array(W * H * 4);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = rnd(); // stały strumień, niezależny od kształtu heksa
      const dx = x - (W - 1) / 2, dy = y - (H - 1) / 2;
      if (Math.abs(dx) > half || Math.abs(dx) / Math.sqrt(3) + Math.abs(dy) > R) continue;
      const col = paint(x, y, r);
      if (!col) continue;
      const [cr, cg, cb] = hexToRGB(col);
      const i = (y * W + x) * 4;
      px[i] = cr; px[i + 1] = cg; px[i + 2] = cb; px[i + 3] = 255;
    }
  }
  return { w: W, h: H, px };
}

// pustynny piach: dither, pasy wydm, kamyki i rozświetlone ziarna
function sandTile(v) {
  return hexTilePixels(191 + v * 53, (x, y, r) => {
    let c = ((x + y) & 1) ? '#d3ba7c' : '#c9b06a';
    const band = (y + Math.round(3 * Math.sin((x + v * 9) / 5)) + v * 5 + 28) % 14;
    if (band === 0) c = '#bda45e';
    if (r < 0.030) c = '#a89050';
    else if (r < 0.050) c = '#e2cf92';
    else if (r < 0.058) c = '#8f8a76';
    return c;
  });
}

// oliwkowa trawa: plamy ciemniejszej zieleni, kępki i przetarcia piachu
function grassTile(v) {
  return hexTilePixels(577 + v * 41, (x, y, r) => {
    let c = ((x + y) & 1) ? '#8f9c4a' : '#859240';
    if ((x * 13 + y * 7 + v * 29) % 31 < 3) c = '#75823a';
    if ((x * 3 + y * 17 + v * 11) % 43 < 2) c = '#c9b06a';
    if (r < 0.035) c = '#a4b358';
    else if (r < 0.050) c = '#67742f';
    return c;
  });
}

// głębia z grzywami fal i pojedynczymi rozbłyskami
function waterTile(v) {
  return hexTilePixels(863 + v * 67, (x, y, r) => {
    let c = ((x + y) & 1) ? '#2a6aa8' : '#2865a0';
    if ((y * 3 + (x >> 1) + v * 5) % 19 < 1) c = '#245c94';
    const ph = (y * 7 + v * 13) % 11;
    if (ph === 0 && (x + y * 3) % 23 < 6) c = '#4f92c8';
    if (ph === 0 && (x + y * 3) % 23 === 5) c = '#9cc8e8';
    if (r < 0.008) c = '#bfe0f8';
    return c;
  });
}

// płycizna przy brzegu: jaśniejsza toń z prześwitującym dnem i pianą
function shallowTile() {
  return hexTilePixels(1409, (x, y, r) => {
    let c = ((x + y) & 1) ? '#4f8cc0' : '#4a85b6';
    if ((x * 5 + y * 9) % 27 < 2) c = '#5f9cc8';
    if (r < 0.040) c = '#8fae9a';
    else if (r < 0.055) c = '#c9b06a';
    else if (r < 0.068) c = '#dff0fa';
    return c;
  });
}

// ---------- enkoder PNG ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// pixels: Uint8Array RGBA (w*h*4)
function encodePNG(w, h, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filtr: none
    pixels.subarray(y * w * 4, (y + 1) * w * 4)
      .forEach((v, i) => { raw[y * (1 + w * 4) + 1 + i] = v; });
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- rysowanie ----------
function gridToPixels(rows, palette) {
  const h = rows.length, w = rows[0].length;
  const px = new Uint8Array(w * h * 4);
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`nierówny wiersz sprite'a (${row.length} vs ${w}): "${row}"`);
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) throw new Error(`nieznany znak '${ch}' w wierszu: "${row}"`);
      const [r, g, b] = hexToRGB(col);
      const i = (y * w + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  });
  return { w, h, px };
}

// pikselowy cień: przezroczyste piksele na prawo-dół od sylwetki dostają półmrok
function dropShadow({ w, h, px }) {
  const out = new Uint8Array(px);
  for (let y = h - 1; y >= 1; y--) {
    for (let x = w - 1; x >= 1; x--) {
      const i = (y * w + x) * 4;
      if (out[i + 3] !== 0) continue;
      const j = ((y - 1) * w + (x - 1)) * 4;
      if (px[j + 3] > 200) {
        out[i] = 20; out[i + 1] = 16; out[i + 2] = 8; out[i + 3] = 90;
      }
    }
  }
  return { w, h, px: out };
}

// skleja klatki animacji w poziomy sprite-sheet
function composeH(frames) {
  const h = frames[0].h, w = frames.reduce((s, f) => s + f.w, 0);
  const px = new Uint8Array(w * h * 4);
  let ox = 0;
  for (const f of frames) {
    for (let y = 0; y < f.h; y++) {
      px.set(f.px.subarray(y * f.w * 4, (y + 1) * f.w * 4), (y * w + ox) * 4);
    }
    ox += f.w;
  }
  return { w, h, px };
}

// eksplozja: 6 klatek 48x48 obok siebie — biały rdzeń, żółć, pomarańcz,
// rozrzucone odłamki, na końcu dogasający pierścień dymu
function explosionSheet() {
  const F = 6, S = 48, w = F * S;
  const px = new Uint8Array(w * S * 4);
  let seed = 1337;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const put = (x, y, rgb, a) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= S) return;
    const i = (y * w + x) * 4;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = a;
  };
  const C = {
    core: hexToRGB('#fff8d8'), yellow: hexToRGB('#ffd91c'),
    orange: hexToRGB('#ff8c1a'), red: hexToRGB('#a8341a'),
    dark: hexToRGB('#3a2415'),
    smoke: hexToRGB('#787468'), smokeDark: hexToRGB('#524e44'),
  };
  const CTR = (S - 1) / 2;
  for (let f = 0; f < F; f++) {
    const r = 6 + f * 3.2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - CTR, dy = y - CTR;
        const jag = Math.sqrt(dx * dx + dy * dy) + (rand() - 0.5) * 4.5;
        const gx = f * S + x;
        if (f < 4) {
          if (jag < r * 0.4) put(gx, y, C.core, 255);
          else if (jag < r * 0.7) put(gx, y, C.yellow, 255);
          else if (jag < r * 0.95) put(gx, y, C.orange, 255);
          else if (jag < r * 1.15) put(gx, y, C.red, 255);
        } else {
          // dogasający pierścień dymu
          if (jag > r * 0.45 && jag < r * 1.05) {
            const dark = rand() < 0.4;
            put(gx, y, dark ? C.smokeDark : C.smoke, f === 4 ? 210 : 130);
          }
        }
      }
    }
    // odłamki wyrzucone poza kulę ognia
    if (f < 4) {
      const m = 10 + f * 5;
      for (let i = 0; i < m; i++) {
        const ang = rand() * Math.PI * 2;
        const dist = r * (1.2 + rand() * 0.55);
        const ex = f * S + CTR + Math.cos(ang) * dist;
        const ey = CTR + Math.sin(ang) * dist;
        const col = rand() < 0.4 ? C.orange : rand() < 0.6 ? C.red : C.dark;
        put(ex, ey, col, 255);
        if (rand() < 0.5) put(ex + 1, ey, col, 255);
      }
    }
  }
  return { w, h: S, px };
}

// kafelek tła strony 48x48: ciemna nitowana blacha (bardzo stonowana)
function bgTile() {
  const S = 48;
  const px = new Uint8Array(S * S * 4);
  let s = 4242;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = rnd();
      let c = ((x + y) & 1) ? '#1a180e' : '#18160d';
      const row = Math.floor(y / 16), off = (row % 2) * 12;
      const lx = (x + off) % 24, ly = y % 16;
      if (lx === 0 || ly === 0) c = '#100e07';                       // szew płyt
      else if ((lx === 2 || lx === 21) && (ly === 2 || ly === 13)) c = '#2a2512'; // nity
      else if (r < 0.02) c = '#211e10';
      const [cr, cg, cb] = hexToRGB(c);
      const i = (y * S + x) * 4;
      px[i] = cr; px[i + 1] = cg; px[i + 2] = cb; px[i + 3] = 255;
    }
  }
  return { w: S, h: S, px };
}

// ---------- zapis ----------
fs.mkdirSync(OUT_DIR, { recursive: true });

function save(name, { w, h, px }) {
  fs.writeFileSync(path.join(OUT_DIR, name + '.png'), encodePNG(w, h, px));
  console.log(`assets/${name}.png (${w}x${h})`);
}

const hq = img => dropShadow(img);

[city0(), city1(), city2()].forEach((rows, i) => save('city_' + i, hq(gridToPixels(rows, BASE_PAL))));
save('city_port', hq(gridToPixels(cityPort(), BASE_PAL)));
save('crane', hq(gridToPixels(craneGrid(), BASE_PAL)));
[tree0(), tree1()].forEach((rows, i) => save('tree_' + i, hq(gridToPixels(rows, BASE_PAL))));
save('res_oil', hq(gridToPixels(resOil(), BASE_PAL)));
save('res_farm', hq(gridToPixels(resFarm(), BASE_PAL)));
save('res_mine', hq(gridToPixels(resMine(), BASE_PAL)));
[rock0(), rock1()].forEach((rows, i) => save('rock_' + i, hq(gridToPixels(rows, BASE_PAL))));
for (let v = 0; v < 3; v++) {
  save('hex_sand_' + v, sandTile(v));
  save('hex_grass_' + v, grassTile(v));
  save('hex_water_' + v, waterTile(v));
}
save('hex_shallow', shallowTile());
save('explosion', explosionSheet());
save('bg', bgTile());
PLAYERS.forEach((p, i) => {
  const pal = { ...BASE_PAL, b: p.color, B: p.dark, h: lighten(p.color, 0.4) };
  save('tank_' + i, hq(gridToPixels(tankGrid(), pal)));
  save('soldier_' + i, composeH([
    hq(gridToPixels(SOLDIER_TOP.concat(SOLDIER_LEGS_A), pal)),
    hq(gridToPixels(SOLDIER_TOP.concat(SOLDIER_LEGS_B), pal)),
  ]));
  save('capital_' + i, hq(gridToPixels(capitalGrid(), pal)));
  save('ship0_' + i, hq(gridToPixels(ship0(), pal)));
  save('ship1_' + i, hq(gridToPixels(ship1(), pal)));
  save('ship2_' + i, hq(gridToPixels(ship2(), pal)));
});
console.log('Gotowe.');
