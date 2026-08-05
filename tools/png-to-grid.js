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
     node tools/png-to-grid.js --palette --format=list  # sama lista hexów (Aseprite set_palette)
     node tools/png-to-grid.js --palette --format=gpl   # plik .gpl (GIMP/Aseprite/Krita)
     node tools/png-to-grid.js --palette --format=gpl --write  # -> dist/palette/ (gitignored)
     node tools/png-to-grid.js --selftest             # test poprawności na assets/artillery_0.png

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
/* Darmowy test poprawności: assets/artillery_0.png powstał jako
   gridToPixels(artilleryGrid(), paleta gracza 0) + dropShadow. Jeśli dekoder
   i mapowanie kolorów są poprawne, przepuszczenie tego pliku z powrotem musi dać
   dokładnie te same wiersze, które zwraca artilleryGrid(). Cień jest
   półprzezroczysty (alfa 90), więc wraca jako '.' — tak jak był przed dołożeniem.

   Wzorcem był wcześniej czołg, ale od czasu animacji jazdy assets/tank_*.png to
   pasek czterech klatek 192x28, a nie pojedynczy obraz — porównanie wiersz
   w wiersz przestałoby mieć sens. Armata zostaje jednoklatkowa i powstaje
   dokładnie tym samym potokiem, więc pilnuje dekodera tak samo dobrze. */
if (args.includes('--selftest')) {
  const pal = playerPalette(0);
  const expected = gen('artilleryGrid')();
  const file = path.join(ROOT, 'assets', 'artillery_0.png');
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

  /* Trzecia runda: rozróżnialność palety u każdego gracza. reverseMap() mapuje
     hex -> znak, więc dwa znaki o tym samym kolorze są nierozróżnialne w drodze
     powrotnej — jeden po cichu znika i PNG wraca z podmienionym znakiem. Barwy
     b/B/h/m są liczone z koloru gracza, więc kolizja może pojawić się u jednego
     gracza i nie istnieć u pozostałych; stąd pętla po wszystkich. */
  for (let p = 0; p < PLAYERS.length; p++) {
    const pal = playerPalette(p);
    const byHex = new Map();
    for (const [ch, hex] of Object.entries(pal)) {
      const k = hex.toLowerCase();
      if (byHex.has(k)) {
        console.error('BŁĄD: gracz ' + p + ' — znaki "' + byHex.get(k) + '" i "' + ch +
          '" mają ten sam kolor ' + hex + ' (drugi zniknie przy PNG -> siatka)');
        bad++;
      } else byHex.set(k, ch);
    }
  }

  if (bad) { console.error('\nSELFTEST NIE PRZESZEDŁ (' + bad + ' problemów)'); process.exit(1); }
  console.log('SELFTEST OK — assets/artillery_0.png odtworzony znak w znak (' +
    expected.length + ' wierszy x ' + expected[0].length + '), pętla enkoder->dekoder zgodna.');
  process.exit(0);
}

/* ------------------------------ zrzut palety ------------------------------ */
/* Rysowanie sprite'a poza repo (edytor pixel-artu, Aseprite przez MCP) wymaga
   wprowadzenia tam palety. Przepisywanie kilkudziesięciu hexów z BASE_PAL ręcznie
   kończy się literówką, która wychodzi na jaw dopiero tutaj — jako '?' na końcu
   łańcucha. Ten tryb podaje dokładnie tę samą paletę, której użyje mapowanie
   z powrotem, więc obie strony nie mogą się rozjechać.

   Musi być PRZED sprawdzeniem nazwy pliku niżej, bo nie bierze żadnego pliku.

   Trzy formaty tego samego: obiekt znak -> hex (domyślny, do rysowania ręcznego),
   płaska lista hexów (`--format=list`, wprost do `set_palette` w Aseprite przez MCP)
   i plik .gpl (`--format=gpl`, do wczytania w Aseprite/GIMP/Kricie jako plik).
   Lista gubi znaczenie znaków — i tak ma być, bo `set_palette` przyjmuje tylko
   kolory; rolę każdego z nich opisuje Documents/07-Grafika-i-sprite-y.md. */
if (args.includes('--palette')) {
  const pal = playerPalette(PLAYER);
  const fmt = argVal('format') || 'json';
  let out;
  if (fmt === 'json') {
    out = JSON.stringify(pal, null, 2);
  } else if (fmt === 'list') {
    // kolejność wpisów palety = kolejność definicji w BASE_PAL, więc lista jest
    // stabilna między uruchomieniami — indeks koloru w Aseprite się nie przesuwa
    out = JSON.stringify([...new Set(Object.values(pal))]);
  } else if (fmt === 'gpl') {
    const lines = ['GIMP Palette', 'Name: Hex General (gracz ' + PLAYER + ')', 'Columns: 8', '#'];
    for (const [ch, hex] of Object.entries(pal)) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      lines.push([r, g, b].map(v => String(v).padStart(3, ' ')).join(' ') + '\t' + ch + ' ' + hex);
    }
    out = lines.join('\n');
  } else {
    console.error('nieznany --format=' + fmt + ' (json | list | gpl)');
    process.exit(1);
  }

  /* --write kładzie to samo w dist/ — tam, gdzie gen-sounds.js kładzie .wav-y
     do odsłuchania. Katalog jest w .gitignore i gra nigdy z niego nie czyta:
     plik palety jest do otwarcia w edytorze, a nie drugim źródłem prawdy.
     Paleta w repo to BASE_PAL w gen-sprites.js i nic poza tym. */
  if (args.includes('--write')) {
    const dir = path.join(ROOT, 'dist', 'palette');
    // json i list to oba JSON, ale o różnej strukturze (obiekt znak->hex vs płaska
    // tablica) — bez rozróżnienia w nazwie drugi zapis po cichu nadpisałby pierwszy
    const file = path.join(dir, 'hexgeneral-p' + PLAYER +
      (fmt === 'list' ? '-list.json' : '.' + fmt));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, out + '\n');
    console.log(file);
  } else {
    console.log(out);
  }
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
