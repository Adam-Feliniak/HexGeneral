'use strict';
/* ============================================================
   check-portability.js — pilnuje, żeby warstwa logiki gry została wolna od przeglądarki

   Po co: logika (walka, AI, gospodarka, generator map, kodek zapisu) nie odwołuje się
   dziś do `document`, `window` ani `localStorage` inaczej niż przez osłonę headless.
   Dzięki temu `tools/sim.js` i `tools/stress.js` mogą uruchamiać pełne partie w czystym
   Node, a gra zachowuje otwartą i tanią drogę do ewentualnej zmiany silnika
   (patrz Documents/15-Silnik-i-przenosnosc.md). Ta czystość nie utrzyma się sama —
   wystarczy jedno „tylko zaktualizuję panel z poziomu combat.js" i przepada.

   Reguła, której pilnuje ten skrypt (nie „zero odwołań", tylko dokładnie ta konwencja
   z Documents/09-Przewodnik-developera.md):

     Odwołanie do API przeglądarki jest dozwolone WYŁĄCZNIE wewnątrz funkcji, która
     wcześniej sprawdza `typeof <to samo API> === 'undefined'` i wychodzi.

   Dzięki temu nie ma listy grandfatherowanych wyjątków, która po cichu rośnie —
   jest reguła, którą albo się spełnia, albo nie.

   Użycie:
     node tools/check-portability.js            # kod 0 = czysto
     node tools/check-portability.js --verbose  # pokaż też odwołania dozwolone przez osłonę
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

// Warstwa logiki: to, co przy zmianie silnika ma się tłumaczyć, a nie przepisywać.
// render/ui/input/menu/sprites/audio/i18n/main świadomie NIE są tu wymienione —
// one z definicji żyją w przeglądarce.
const LOGIC_FILES = [
  'config.js', 'geometry.js', 'utils.js', 'mapgen.js', 'state.js',
  'combat.js', 'roads.js', 'empire.js', 'turns.js', 'ai.js', 'save.js',
];

// Globale przeglądarki, których w logice być nie powinno
const BROWSER_GLOBALS = [
  'document', 'window', 'localStorage', 'sessionStorage', 'navigator',
  'alert', 'requestAnimationFrame', 'cancelAnimationFrame',
  'AudioContext', 'webkitAudioContext', 'XMLHttpRequest', 'fetch', 'HTMLElement',
];

// usuwa komentarze, żeby wzmianka w opisie nie wywoływała fałszywego alarmu
function stripComments(lines) {
  let inBlock = false;
  return lines.map(line => {
    let out = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) {
        if (line[i] === '*' && line[i + 1] === '/') { inBlock = false; i++; }
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '*') { inBlock = true; i++; continue; }
      if (line[i] === '/' && line[i + 1] === '/') break;
      out += line[i];
    }
    return out;
  });
}

// Wszystkie funkcje najwyższego poziomu w src/*.js zaczynają się w kolumnie 0 —
// to wystarcza, żeby wyznaczyć granicę funkcji bez pisania parsera JS.
function functionStart(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    if (/^(function |const \w+ = function|const \w+ = \()/.test(lines[i])) return i;
  }
  return 0;
}

let problems = 0, guarded = 0, checked = 0;

for (const name of LOGIC_FILES) {
  const file = path.join(ROOT, 'src', name);
  if (!fs.existsSync(file)) {
    console.error('BŁĄD: brak pliku src/' + name + ' — zaktualizuj LOGIC_FILES w tym skrypcie');
    problems++;
    continue;
  }
  checked++;
  const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const code = stripComments(raw);

  for (let i = 0; i < code.length; i++) {
    for (const g of BROWSER_GLOBALS) {
      const re = new RegExp('\\b' + g + '\\b');
      if (!re.test(code[i])) continue;
      // sama osłona jest tym, o co chodzi — nie jest naruszeniem
      if (new RegExp('typeof\\s+' + g + '\\s*[!=]==').test(code[i])) continue;

      const from = functionStart(code, i);
      const guardRe = new RegExp('typeof\\s+' + g + '\\s*[!=]==\\s*[\'"]undefined[\'"]');
      let hasGuard = false;
      for (let j = from; j < i; j++) if (guardRe.test(code[j])) { hasGuard = true; break; }

      if (hasGuard) {
        guarded++;
        if (VERBOSE) console.log('  osłonięte: src/' + name + ':' + (i + 1) + '  ' + raw[i].trim());
      } else {
        problems++;
        console.error('NARUSZENIE: src/' + name + ':' + (i + 1) + '  odwołanie do `' + g + '` bez osłony');
        console.error('   ' + raw[i].trim());
      }
    }
  }
}

if (problems) {
  console.error('\nWarstwa logiki musi zostać wolna od przeglądarki: ' + problems + ' naruszeń.');
  console.error('Albo przenieś ten kod do render/ui/input/menu, albo owiń funkcję osłoną');
  console.error("`if (typeof X === 'undefined') return;` — uzasadnienie w Documents/15-Silnik-i-przenosnosc.md.");
  process.exit(1);
}

console.log('OK: warstwa logiki wolna od przeglądarki — ' + checked + ' plików, ' +
  guarded + ' odwołań dopuszczonych przez osłonę headless.' +
  (VERBOSE ? '' : ' (--verbose pokaże które)'));
