'use strict';
/* ============================================================
   palette-import.js — czyta paletę z pliku i wypisuje listę hexów

   Po co: podmiana palety w Aseprite (`set_palette` przez MCP) przyjmuje płaską
   listę hexów, a palety z internetu przychodzą w kilku różnych formatach.
   Ten skrypt sprowadza je wszystkie do jednej postaci, żeby oglądanie sprite'ów
   w cudzej palecie nie zaczynało się od przepisywania kolorów ręcznie.

   To narzędzie warsztatowe, nie krok budowania. Paletą gry zostaje BASE_PAL
   w tools/gen-sprites.js — patrz Documents/07-Grafika-i-sprite-y.md. Nic tutaj
   nie dotyka assets/ ani src/.

   Użycie:
     node tools/palette-import.js paleta.hex     # -> ["#1a1c2c", ...] na stdout
     node tools/palette-import.js paleta.gpl
     node tools/palette-import.js paleta.png     # unikalne kolory z obrazka palety
     node tools/palette-import.js x.hex --gpl    # przepisanie na .gpl

   Formaty: .hex (Lospec, jeden hex na linię), .gpl (GIMP/Aseprite),
   .txt (paint.net, AARRGGBB), .pal (JASC-PAL), .png (obrazek palety),
   .json (tablica hexów albo obiekt znak -> hex).
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { decodePNG } = require('./png.js');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) {
  console.error('Użycie: node tools/palette-import.js <plik.hex|.gpl|.txt|.pal|.png|.json> [--gpl]');
  process.exit(1);
}

const norm = hex => {
  const h = hex.replace(/^#/, '').trim().toLowerCase();
  if (h.length === 8) return '#' + h.slice(2);        // AARRGGBB -> RRGGBB
  if (h.length === 3) return '#' + [...h].map(c => c + c).join('');
  if (h.length !== 6 || /[^0-9a-f]/.test(h)) return null;
  return '#' + h;
};

const rgbHex = (r, g, b) => '#' + [r, g, b]
  .map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');

/* .gpl i .pal mają nagłówki, których nie wolno wziąć za kolory; obie zapisują
   kolor jako trzy liczby dziesiętne, więc obsługuje je jedna ścieżka. */
function fromTriples(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith(';')) continue;
    const m = s.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (m) out.push(rgbHex(+m[1], +m[2], +m[3]));
  }
  return out;
}

function fromHexLines(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith(';') || s.startsWith('#') && s.length > 9) continue;
    const h = norm(s.split(/\s+/)[0]);
    if (h) out.push(h);
  }
  return out;
}

/* Obrazek palety: kolory w kolejności pierwszego wystąpienia (wiersz po wierszu),
   bo palety z Lospeca to zwykle poziomy pasek próbek i ta kolejność jest
   kolejnością autora. Przezroczystość pomijana. */
function fromPNG(buf) {
  const { w, h, px } = decodePNG(buf);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] < 128) continue;
    const hex = rgbHex(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    if (!seen.has(hex)) { seen.add(hex); out.push(hex); }
  }
  return out;
}

const ext = path.extname(file).toLowerCase();
const raw = fs.readFileSync(file);
let colors;
if (ext === '.png') {
  colors = fromPNG(raw);
} else if (ext === '.json') {
  const data = JSON.parse(raw.toString('utf8'));
  colors = (Array.isArray(data) ? data : Object.values(data)).map(norm).filter(Boolean);
} else {
  const text = raw.toString('utf8');
  colors = /^\s*(GIMP Palette|JASC-PAL)/.test(text) ? fromTriples(text) : fromHexLines(text);
  if (!colors.length) colors = fromTriples(text);
}

const uniq = [...new Set(colors)];
if (!uniq.length) {
  console.error('Nie znalazłem żadnych kolorów w ' + file);
  process.exit(1);
}

if (args.includes('--gpl')) {
  console.log('GIMP Palette');
  console.log('Name: ' + path.basename(file, ext));
  console.log('Columns: 8');
  console.log('#');
  for (const hex of uniq) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    console.log([r, g, b].map(v => String(v).padStart(3, ' ')).join(' ') + '\t' + hex);
  }
} else {
  console.log(JSON.stringify(uniq));
}

/* Nasza paleta ma 37 kolorów w 20 rolach (kontur, gąsienice, beton, cegła...).
   Paleta wyraźnie mniejsza skleja role ze sobą — to nie błąd, tylko informacja,
   czego się spodziewać po kwantyzacji. */
console.error('Wczytano ' + uniq.length + ' kolorów z ' + path.basename(file) +
  (colors.length !== uniq.length ? ' (' + (colors.length - uniq.length) + ' powtórzonych pominięto)' : '') +
  (uniq.length < 24 ? '\nUWAGA: mniej niż 24 kolory — kwantyzacja posklei role z BASE_PAL (np. beton z kamieniem).' : ''));
