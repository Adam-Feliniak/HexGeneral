'use strict';
/* ============================================================
   archive-assets.js — odkłada obecne sprite'y do archiwum przed ich zastąpieniem

   Po co: `tools/gen-sprites.js` nadpisuje assets/*.png bez pytania, a poprzednia
   wersja grafiki żyje potem już tylko w historii gita. Odtworzenie jej wymaga
   znajomości commita, w którym zniknęła — a przy porównywaniu wariantów chce się
   ją mieć po prostu obok, jako plik.

   Archiwum leży POZA katalogiem assets/ świadomie. `tools/pack-build.js` czyta
   assets/ i bierze wszystko, co kończy się na .png; podkatalog dziś by się nie
   załapał, ale to przypadek, nie gwarancja. Katalog na poziomie repo nigdy nie
   trafi do buildu, bo pack-build działa na allowliście.

   Nazewnictwo: tank_0.png -> archiwum/tank_0_2026-08-02.png. Data zamiast numeru
   wersji, bo grafika bywa wymieniana częściej niż wersja gry, a dwa warianty tego
   samego sprite'a w jednej wersji dostałyby ten sam numer.

   Użycie:
     node tools/archive-assets.js tank          # tank_0.png .. tank_6.png
     node tools/archive-assets.js tank soldier  # kilka rodzin naraz
     node tools/archive-assets.js --all         # cały obecny stan assets/
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets');
const DST = path.join(ROOT, 'archiwum');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Użycie: node tools/archive-assets.js <prefiks...> | --all');
  process.exit(1);
}

const all = fs.readdirSync(SRC).filter(f => f.endsWith('.png')).sort();
const picked = args.includes('--all')
  ? all
  : all.filter(f => args.some(a => f === a + '.png' || f.startsWith(a + '_')));

if (!picked.length) {
  console.error('Nic nie pasuje do: ' + args.join(', '));
  process.exit(1);
}

const d = new Date();
const stamp = [d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, '0'),
  String(d.getDate()).padStart(2, '0')].join('-');

fs.mkdirSync(DST, { recursive: true });

let done = 0, skipped = 0;
for (const f of picked) {
  const out = f.replace(/\.png$/, '_' + stamp + '.png');
  const dst = path.join(DST, out);
  // Nie nadpisujemy: druga próba tego samego dnia oznaczałaby, że pierwsza kopia
  // jest już tą "starą" wersją, którą chcemy zachować.
  if (fs.existsSync(dst)) { skipped++; continue; }
  fs.copyFileSync(path.join(SRC, f), dst);
  console.log('archiwum/' + out);
  done++;
}

console.log('\nZarchiwizowano: ' + done + (skipped ? ', pominięto (już są): ' + skipped : ''));
