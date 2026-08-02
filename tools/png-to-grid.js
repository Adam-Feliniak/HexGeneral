'use strict';
/* ============================================================
   png-to-grid.js — zamienia PNG na siatkę znaków do wklejenia w gen-sprites.js

   Po co: sprite'y jednostek najlepiej wychodzą, gdy piksele są stawiane świadomie,
   a nie składane z elips. Ten skrypt pozwala narysować sprite'a w dowolnym edytorze
   pixel-artu (albo wygenerować go inaczej), a potem wnieść go do generatora jako
   mapę znaków — dzięki czemu dalej działa przemalowanie na 6 graczy, automatyczny
   kontur i cień, a `node tools/gen-sprites.js` nadal odtwarza całe assets/
   bez żadnych zależności.

   Paleta NIE jest tu powielona: skrypt wczytuje tools/gen-sprites.js do sandboxa vm
   (z zaślepionym fs, więc nic nie nadpisuje) i bierze BASE_PAL oraz kolory graczy
   prosto stamtąd. Jedno źródło prawdy.

   Użycie:
     node tools/png-to-grid.js rysunek.png            # -> mapa znaków na stdout
     node tools/png-to-grid.js rysunek.png --player=2 # barwy gracza 2 jako b/B/h/m
     node tools/png-to-grid.js --palette              # paleta znak -> kolor do edytora
     node tools/png-to-grid.js --selftest             # test poprawności na assets/tank_0.png

   Wymagania wobec pliku: PNG bez przeplotu, 8 bitów na kanał (RGBA, RGB, szarość
   albo indeksowany). Piksele o alfie < 128 stają się przezroczystością ('.').
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { decodePNG, encodePNG } = require('./png.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argVal = name => {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : null;
};
const PLAYER = parseInt(argVal('player') || '0', 10);

/* Generator jest zwykłym skryptem, który przy wczytaniu od razu zapisuje pliki —
   więc uruchamiamy go z zaślepionym fs. Dzięki temu mamy dostęp do jego palety
   i funkcji malujących bez kopiowania ich tutaj i bez dotykania assets/. */
function loadGenerator() {
  const sandbox = {
    console: { log() {}, error: console.error },
    Buffer,
    __dirname: path.join(ROOT, 'tools'),
    require: name => (name === './png.js' ? require('./png.js') : require(name)),
  };
  // zaślepka fs: czytać wolno (generator tego nie robi), pisać nie
  const realRequire = sandbox.require;
  sandbox.require = name => (name === 'fs'
    ? { mkdirSync() {}, writeFileSync() {}, readFileSync: fs.readFileSync }
    : realRequire(name));
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools', 'gen-sprites.js'), 'utf8'),
    sandbox, { filename: 'gen-sprites.js' });
  // `const` z najwyższego poziomu skryptu nie staje się właściwością obiektu
  // sandboxa (żyje w leksykalnym zakresie kontekstu), więc czytamy je wyrażeniem —
  // tym samym sposobem, którym tools/gen-sounds.js sięga po SFX_RECIPES
  return expr => vm.runInContext(expr, sandbox);
}

const gen = loadGenerator();
const PLAYERS = gen('PLAYERS');
const BASE_PAL = gen('BASE_PAL');

function playerPalette(i) {
  const p = PLAYERS[i];
  if (!p) throw new Error('nie ma gracza ' + i + ' (jest ' + PLAYERS.length + ')');
  return Object.assign({}, BASE_PAL, {
    b: p.color,
    B: p.dark,
    h: gen('lighten')(p.color, 0.4),
    m: gen('coolShade')(p.color, 0.28),
  });
}

// kolor -> litera; przy kolizji wygrywa litera barwy gracza, bo o nią chodzi
function reverseMap(pal) {
  const teamLetters = { b: 1, B: 1, h: 1, m: 1 };
  const map = new Map();
  for (const [ch, hex] of Object.entries(pal)) {
    const key = hex.toLowerCase();
    if (map.has(key) && !teamLetters[ch]) continue;
    map.set(key, ch);
  }
  return map;
}

function pngToRows(file, pal) {
  const { w, h, px } = decodePNG(fs.readFileSync(file));
  const rmap = reverseMap(pal);
  const unknown = new Map();
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 128) { row += '.'; continue; }
      const hex = '#' + [px[i], px[i + 1], px[i + 2]]
        .map(v => v.toString(16).padStart(2, '0')).join('');
      const ch = rmap.get(hex);
      if (ch) { row += ch; continue; }
      const seen = unknown.get(hex);
      if (seen) seen.n++;
      else unknown.set(hex, { n: 1, x, y });
      row += '?';
    }
    rows.push(row);
  }
  return { rows, w, h, unknown };
}

/* ------------------------------ selftest ------------------------------ */
/* Darmowy test poprawności: assets/tank_0.png powstał jako
   gridToPixels(tankGrid(), paleta gracza 0) + dropShadow. Jeśli dekoder i mapowanie
   kolorów są poprawne, przepuszczenie tego pliku z powrotem musi dać dokładnie
   te same wiersze, które zwraca tankGrid(). Cień jest półprzezroczysty (alfa 90),
   więc wraca jako '.' — tak jak był przed jego dołożeniem. */
if (args.includes('--selftest')) {
  const pal = playerPalette(0);
  const expected = gen('tankGrid')();
  const file = path.join(ROOT, 'assets', 'tank_0.png');
  const { rows, unknown } = pngToRows(file, pal);

  let bad = 0;
  if (rows.length !== expected.length) {
    console.error('BŁĄD: inna liczba wierszy: ' + rows.length + ' vs ' + expected.length);
    bad++;
  }
  for (let y = 0; y < Math.min(rows.length, expected.length); y++) {
    if (rows[y] !== expected[y]) {
      if (bad < 3) {
        console.error('BŁĄD w wierszu ' + y + ':');
        console.error('  z PNG:      ' + rows[y]);
        console.error('  z tankGrid: ' + expected[y]);
      }
      bad++;
    }
  }
  if (unknown.size) {
    console.error('BŁĄD: kolory spoza palety: ' +
      [...unknown.entries()].map(([hex, v]) => hex + ' x' + v.n).join(', '));
    bad++;
  }

  // druga runda: pełna pętla znaki -> piksele -> PNG -> znaki, bez dotykania dysku
  const img = gen('gridToPixels')(expected, pal);
  const tmp = encodePNG(img.w, img.h, img.px);
  const round = (() => {
    const dec = decodePNG(tmp);
    const rmap = reverseMap(pal);
    const out = [];
    for (let y = 0; y < dec.h; y++) {
      let row = '';
      for (let x = 0; x < dec.w; x++) {
        const i = (y * dec.w + x) * 4;
        if (dec.px[i + 3] < 128) { row += '.'; continue; }
        const hex = '#' + [dec.px[i], dec.px[i + 1], dec.px[i + 2]]
          .map(v => v.toString(16).padStart(2, '0')).join('');
        row += rmap.get(hex) || '?';
      }
      out.push(row);
    }
    return out;
  })();
  for (let y = 0; y < expected.length; y++) {
    if (round[y] !== expected[y]) { console.error('BŁĄD w pętli enkoder->dekoder, wiersz ' + y); bad++; break; }
  }

  if (bad) { console.error('\nSELFTEST NIE PRZESZEDŁ (' + bad + ' problemów)'); process.exit(1); }
  console.log('SELFTEST OK — assets/tank_0.png odtworzony znak w znak (' +
    expected.length + ' wierszy x ' + expected[0].length + '), pętla enkoder->dekoder zgodna.');
  process.exit(0);
}

/* ------------------------------ zrzut palety ------------------------------ */
/* Rysowanie sprite'a poza repo (edytor pixel-artu, Aseprite przez MCP) wymaga
   wprowadzenia tam palety. Przepisywanie kilkudziesięciu hexów z BASE_PAL ręcznie
   kończy się literówką, która wychodzi na jaw dopiero tutaj — jako '?' na końcu
   łańcucha. Ten tryb podaje dokładnie tę samą paletę, której użyje mapowanie
   z powrotem, więc obie strony nie mogą się rozjechać.

   Musi być PRZED sprawdzeniem nazwy pliku niżej, bo nie bierze żadnego pliku. */
if (args.includes('--palette')) {
  console.log(JSON.stringify(playerPalette(PLAYER), null, 2));
  process.exit(0);
}

/* ------------------------------ tryb zwykły ------------------------------ */

const file = args.find(a => !a.startsWith('--'));
if (!file) {
  console.error('Użycie: node tools/png-to-grid.js <plik.png> [--player=N]');
  console.error('        node tools/png-to-grid.js --palette [--player=N]');
  console.error('        node tools/png-to-grid.js --selftest');
  process.exit(1);
}

const pal = playerPalette(PLAYER);
const { rows, w, h, unknown } = pngToRows(file, pal);

if (unknown.size) {
  console.error('UWAGA: ' + unknown.size + ' kolorów spoza palety (oznaczone "?"):');
  for (const [hex, v] of [...unknown.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
    console.error('  ' + hex + '  x' + v.n + '  pierwszy raz w (' + v.x + ',' + v.y + ')');
  }
  console.error('  Dopisz je do BASE_PAL w tools/gen-sprites.js albo popraw rysunek.\n');
}

const team = rows.join('').split('').filter(c => 'bBhm'.includes(c)).length;
const solid = rows.join('').split('').filter(c => c !== '.').length;
console.log('// ' + w + 'x' + h + ', barwa gracza: ' +
  (solid ? Math.round((team / solid) * 100) : 0) + '% sylwetki' +
  ' (cel: 25-35%)');
console.log('[');
for (const r of rows) console.log("  '" + r + "',");
console.log('];');
