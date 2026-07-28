'use strict';
/* ============================================================
   pack-build.js — pakuje build testerski (czysty Node, zero zależności)

   Po co: build dla testerów musi zawierać SAMĄ GRĘ. Spakowanie katalogu
   projektu wysyła 2,1 MB `.git`, a w nim *każdą wersję* `Documents/` —
   i usunięcie `Documents/` z kopii nic nie daje, dopóki `.git` jedzie razem.
   Ten skrypt kopiuje wyłącznie allowlistę, więc pułapki nie da się powtórzyć.

   Allowlista, nie blacklista: nowy plik dodany do repo (dokument, narzędzie,
   notatka) NIE wycieknie do buildu, bo nie ma go na liście. Blacklista
   przeciekałaby przy każdym nowym pliku.

   Lista `src/*.js` jest wyprowadzana z <script src=...> w index.html, żeby
   nie mogła się rozjechać z kolejnością wczytywania (readdir dałby porządek
   alfabetyczny, a ten w tym projekcie jest znaczący).

   Użycie:
     node tools/pack-build.js --tag=kt-1     # -> dist/kt-1/
     node tools/pack-build.js                # -> dist/dev/ (bez znacznika)
     node tools/pack-build.js --tag=kt-1 --out=D:/wysylka
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function argVal(name) {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : null;
}

const TAG = argVal('tag') || '';
const OUT_BASE = argVal('out') || path.join(ROOT, 'dist');
const OUT = path.join(OUT_BASE, TAG || 'dev');

// znacznik trafia do nazwy katalogu i do config.js — bez znaków, które psują
// ścieżki albo string w JS
if (TAG && !/^[A-Za-z0-9._-]+$/.test(TAG)) {
  fail('Niedozwolony --tag: "' + TAG + '". Dozwolone: litery, cyfry, . _ -');
}

function fail(msg) {
  console.error('BŁĄD: ' + msg);
  process.exit(1);
}

// --- allowlista -------------------------------------------------------------

// pliki src/*.js w kolejności wczytywania (źródło prawdy: index.html)
function scriptsFromIndex(html) {
  const out = [];
  const re = /<script\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  if (!out.length) fail('Nie znalazłem żadnego <script src=...> w index.html');
  return out;
}

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = scriptsFromIndex(indexHtml);

// assets/*.png — cały katalog, bo wszystkie sprite'y są potrzebne w runtime
const assets = fs.readdirSync(path.join(ROOT, 'assets'))
  .filter(f => f.toLowerCase().endsWith('.png'))
  .map(f => 'assets/' + f);

const FILES = ['index.html', 'style.css', 'LICENSE'].concat(scripts, assets);

// Celowo POMIJANE (dlaczego — nie kasować bez przemyślenia):
//   .git/          cała historia + każda wersja Documents/
//   Documents/     dokumentacja projektowa: metodologia strojenia AI, decyzje
//   tools/         sim.js, stress.js, gen-sprites.js (własny enkoder PNG)
//   CLAUDE.md      opis architektury i wewnętrznych konwencji
//   CHANGELOG.md   metryki balansu i historia strojenia AI
//   visual-test.html, README.md
//   locales/*.json niepotrzebne w runtime — gra ładuje src/locales-data.js
//
// Audio świadomie nie ma tu wpisu: dźwięki są syntezowane w runtime z przepisów
// w src/audio.js, więc w assets/ nie ma plików audio do kopiowania. Gdyby kiedyś
// pojawiły się (np. `gen-sounds.js --out=assets/sfx`), trzeba rozszerzyć filtr
// rozszerzeń wyżej — dziś przepuszcza wyłącznie .png i cicho pominąłby WAV-y.

// --- kopiowanie -------------------------------------------------------------

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

rmrf(OUT);

let bytes = 0;
for (const rel of FILES) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) fail('Brak pliku z allowlisty: ' + rel);
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  // config.js dostaje podstawiony znacznik — podmiana TYLKO w kopii
  if (rel === 'src/config.js' && TAG) {
    const orig = fs.readFileSync(src, 'utf8');
    const patched = orig.replace(/^const BUILD_TAG = '';$/m, "const BUILD_TAG = '" + TAG + "';");
    if (patched === orig) fail('Nie udało się podstawić BUILD_TAG w src/config.js — zmienił się kształt tej linii?');
    fs.writeFileSync(dst, patched);
  } else {
    fs.copyFileSync(src, dst);
  }
  bytes += fs.statSync(dst).size;
}

// --- weryfikacja wyniku -----------------------------------------------------

for (const forbidden of ['.git', 'Documents', 'tools', 'CLAUDE.md', 'CHANGELOG.md', 'locales']) {
  if (fs.existsSync(path.join(OUT, forbidden))) {
    fail('Build zawiera coś, czego nie powinien: ' + forbidden);
  }
}

if (TAG) {
  const check = fs.readFileSync(path.join(OUT, 'src/config.js'), 'utf8');
  if (!check.includes("const BUILD_TAG = '" + TAG + "';")) fail('Znacznik nie trafił do buildu');
}
// źródło musi zostać nietknięte
if (fs.readFileSync(path.join(ROOT, 'src/config.js'), 'utf8').includes("BUILD_TAG = '" + TAG + "'") && TAG) {
  fail('src/config.js w repo został zmodyfikowany — to nie powinno się zdarzyć');
}

const kb = Math.round(bytes / 1024);
console.log('Build gotowy: ' + OUT);
console.log('  plików: ' + FILES.length + ' (' + scripts.length + ' js, ' + assets.length + ' png)');
console.log('  rozmiar: ' + kb + ' KB' + (kb > 600 ? '  <-- UWAGA: znacznie więcej niż oczekiwane ~280 KB' : ''));
console.log('  znacznik: ' + (TAG || '(brak — build deweloperski)'));
console.log('\nSpakuj katalog do zipa i wyślij. NIE wysyłaj katalogu projektu.');
