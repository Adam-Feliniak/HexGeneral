'use strict';
/* ============================================================
   gen-sounds.js — renderuje dźwięki gry do plików WAV (czysty Node, zero zależności)

   Po co, skoro gra nie potrzebuje plików: dźwięki są syntezowane w runtime
   (patrz nagłówek src/audio.js — na file:// to jedyna pewna droga, a pętla
   muzyki jako WAV to ~1,3 MB). Ten skrypt służy do STROJENIA: pozwala odsłuchać
   dźwięk w edytorze audio, zobaczyć przebieg, porównać wersje przed i po zmianie
   przepisu. Wyjście jest produktem pomocniczym, nie assetem gry — dlatego trafia
   do gitignorowanego dist/, a nie do assets/.

   Przepisy są wspólne z grą: skrypt wczytuje src/audio.js do sandboxa vm
   (tym samym wzorcem, którym robią to tools/sim.js i tools/stress.js), więc
   nie ma drugiej kopii syntezy, która mogłaby się rozjechać z brzmieniem w grze.

   Użycie:
     node tools/gen-sounds.js                 # -> dist/sfx/*.wav
     node tools/gen-sounds.js --out=D:/sfx
     node tools/gen-sounds.js --only=explosion
     node tools/gen-sounds.js --rate=44100
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function argVal(name) {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : null;
}

const OUT = argVal('out') || path.join(ROOT, 'dist', 'sfx');
const ONLY = argVal('only');
const RATE = parseInt(argVal('rate') || '0', 10) || null;

// src/audio.js jest zwykłym skryptem globalnym (bez modułów), więc wystarczy
// uruchomić go w sandboxie bez `document` — warstwa odtwarzania sama się wyłącza,
// a same przepisy to czysta arytmetyka na Float32Array
function loadRecipes() {
  const sandbox = { console, Math, Float32Array, JSON, Date, isNaN, Number };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'audio.js'), 'utf8'), sandbox, { filename: 'audio.js' });
  const recipes = vm.runInContext('SFX_RECIPES', sandbox);
  const rate = RATE || vm.runInContext('SFX_RATE', sandbox);
  if (!recipes) { console.error('BŁĄD: nie znalazłem SFX_RECIPES w src/audio.js'); process.exit(1); }
  return { recipes, rate };
}

// WAV = nagłówek RIFF (44 bajty) + surowe PCM. Mono, 16-bit signed little-endian.
function wavFromSamples(samples, rate) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);   // rozmiar pliku - 8
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);              // długość chunku fmt
  buf.writeUInt16LE(1, 20);               // format: PCM
  buf.writeUInt16LE(1, 22);               // kanały: mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);        // bajty na sekundę (mono, 16-bit)
  buf.writeUInt16LE(2, 32);               // wyrównanie bloku
  buf.writeUInt16LE(16, 34);              // bity na próbkę
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    // -32768..32767 asymetrycznie, żeby +1.0 nie przekręciło się w minus
    buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2);
  }
  return buf;
}

const { recipes, rate } = loadRecipes();
const names = Object.keys(recipes).filter(n => !ONLY || n === ONLY);
if (!names.length) {
  console.error('BŁĄD: brak dźwięku o nazwie "' + ONLY + '". Dostępne: ' + Object.keys(recipes).join(', '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const name of names) {
  const samples = recipes[name](rate);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const wav = wavFromSamples(samples, rate);
  fs.writeFileSync(path.join(OUT, name + '.wav'), wav);
  total += wav.length;
  console.log('  ' + name.padEnd(10) +
    (samples.length / rate).toFixed(2) + ' s   ' +
    String(Math.round(wav.length / 1024)).padStart(4) + ' KB   szczyt ' + peak.toFixed(3));
}
console.log('\nGotowe: ' + names.length + ' plików, ' + Math.round(total / 1024) + ' KB -> ' + OUT);
console.log('Gra ich NIE wczytuje — syntezuje te same przepisy w runtime (patrz src/audio.js).');
