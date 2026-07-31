'use strict';
/* ============================================================
   audit-sounds.js — mierzy dźwięki gry i rysuje ich przebiegi (czysty Node, zero zależności)

   Po co: strojenie dźwięku odbywa się dziś na słuch, a słuch ma tylko autor.
   Ten skrypt zamienia część pytań „czy to dobrze brzmi" na liczby, które da się
   sprawdzić bez odsłuchu: czy miks ma hierarchię głośności, czy dźwięk perkusyjny
   ma transient, czy szum nie siedzi za wysoko, czy nie ma klipowania i offsetu DC.
   Nie zastąpi odsłuchu — ma sprawić, żeby rund odsłuchowych było mało.

   Przepisy są wspólne z grą: skrypt wczytuje src/audio.js do sandboxa vm (ten sam
   wzorzec co tools/gen-sounds.js, tools/sim.js i tools/stress.js), więc mierzy
   dokładnie to, co słychać w grze.

   Użycie:
     node tools/audit-sounds.js                    # tabela + dist/audit/*.png
     node tools/audit-sounds.js --only=explosion
     node tools/audit-sounds.js --json             # sama tabela jako JSON
     node tools/audit-sounds.js --save=przed       # zapisz odczyty jako punkt odniesienia
     node tools/audit-sounds.js --diff=przed       # porównaj bieżące z punktem odniesienia
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { encodePNG } = require('./png.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argVal = name => {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : null;
};
const has = name => args.includes('--' + name);

const ONLY = argVal('only');
const OUT = argVal('out') || path.join(ROOT, 'dist', 'audit');
const SAVE = argVal('save');
const DIFF = argVal('diff');

function loadAudio() {
  const sandbox = { console, Math, Float32Array, JSON, Date, isNaN, Number };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'audio.js'), 'utf8'), sandbox, { filename: 'audio.js' });
  const recipes = vm.runInContext('SFX_RECIPES', sandbox);
  if (!recipes) { console.error('BŁĄD: nie znalazłem SFX_RECIPES w src/audio.js'); process.exit(1); }
  return {
    recipes,
    rate: vm.runInContext('SFX_RATE', sandbox),
    // tabela miksu jest opcjonalna — istnieje dopiero, gdy dźwięk ma jawne wzmocnienia
    gains: vm.runInContext('typeof SFX_GAIN !== "undefined" ? SFX_GAIN : null', sandbox),
  };
}

/* ------------------------------ pomiary ------------------------------ */

// Centroida widmowa = „środek ciężkości" widma w Hz. Niska -> dudnienie,
// wysoka -> syk. Liczona zwykłym DFT na oknie Hanna: przy kilkuset prążkach
// to milisekundy, a unikamy pisania FFT dla samego audytu.
/* Centroida widmowa CAŁEGO dźwięku: średnia z ramek, ważona energią ramki.

   Wcześniej liczyła się z pierwszych 4096 próbek, czyli 186 ms przy 22 kHz — a więc
   z samego ataku, mimo że kolumna nazywa się po prostu „centroida". Przy dźwiękach
   krótkich to bez różnicy, ale przy wybuchu (1,25 s) cały ciemny ogon, sub i pogłos
   nie były w ogóle mierzone. Strojenie ich pod tę liczbę nie mogło nic dać, a odczyt
   sugerował, że dźwięk jest jasny, choć jasny był tylko jego początek. */
function frameCentroid(buf, from, n, rate, bins) {
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = buf[from + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  let num = 0, den = 0;
  for (let k = 1; k <= bins; k++) {
    const f = (k * rate) / (2 * bins);
    const w = (2 * Math.PI * f) / rate;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += win[i] * Math.cos(w * i); im -= win[i] * Math.sin(w * i); }
    const mag = Math.sqrt(re * re + im * im);
    num += f * mag; den += mag;
  }
  return { centroid: den > 0 ? num / den : 0, weight: den };
}

function spectralCentroid(buf, rate, bins = 256) {
  const N = 2048, hop = N / 2;
  if (buf.length < N) return buf.length < 16 ? 0 : frameCentroid(buf, 0, buf.length, rate, bins).centroid;
  let num = 0, den = 0;
  for (let from = 0; from + N <= buf.length; from += hop) {
    const { centroid, weight } = frameCentroid(buf, from, N, rate, bins);
    num += centroid * weight; den += weight;
  }
  return den > 0 ? num / den : 0;
}

function measure(name, samples, rate, gain) {
  let peak = 0, sumSq = 0, sum = 0, clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sumSq += v * v; sum += v;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  // czas do 90% szczytu = czy dźwięk uderza, czy się „wypełza"
  let attack = samples.length;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= peak * 0.9) { attack = i; break; }
  }
  const g = gain == null ? 1 : gain;
  const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  return {
    name,
    sec: samples.length / rate,
    peak, rms,
    gain: g,
    // to, co realnie słychać: pomiar przemnożony przez wzmocnienie miksu
    mixPeakDb: db(peak * g),
    mixRmsDb: db(rms * g),
    crestDb: db(peak) - db(rms),
    attackMs: (attack / rate) * 1000,
    centroidHz: spectralCentroid(samples, rate),
    dc: sum / samples.length,
    clipped,
  };
}

/* ------------------------------ rysunek ------------------------------ */

const PLOT_W = 900, PLOT_H = 220;

function plotWaveform(samples, rate) {
  const px = new Uint8Array(PLOT_W * PLOT_H * 4);
  const set = (x, y, r, g, b) => {
    if (x < 0 || x >= PLOT_W || y < 0 || y >= PLOT_H) return;
    const i = (y * PLOT_W + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  for (let y = 0; y < PLOT_H; y++) for (let x = 0; x < PLOT_W; x++) set(x, y, 22, 26, 22);
  const mid = PLOT_H >> 1;
  for (let x = 0; x < PLOT_W; x++) set(x, mid, 60, 70, 60);          // oś zera
  for (const frac of [0.25, 0.75]) {                                  // -6 dBFS orientacyjnie
    const y = Math.round(frac * PLOT_H);
    for (let x = 0; x < PLOT_W; x += 4) set(x, y, 45, 55, 45);
  }
  // słupki min/max na kolumnę — czytelniejsze niż linia przy tysiącach próbek
  const per = samples.length / PLOT_W;
  for (let x = 0; x < PLOT_W; x++) {
    let lo = 0, hi = 0;
    const a = Math.floor(x * per), b = Math.min(samples.length, Math.floor((x + 1) * per));
    for (let i = a; i < b; i++) { if (samples[i] < lo) lo = samples[i]; if (samples[i] > hi) hi = samples[i]; }
    const y0 = Math.round(mid - hi * (mid - 4));
    const y1 = Math.round(mid - lo * (mid - 4));
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) set(x, y, 123, 224, 90);
  }
  return { w: PLOT_W, h: PLOT_H, px };
}

/* ------------------------------ przebieg ------------------------------ */

const { recipes, rate, gains } = loadAudio();
const names = Object.keys(recipes).filter(n => !ONLY || n === ONLY);
if (!names.length) {
  console.error('BŁĄD: brak dźwięku "' + ONLY + '". Dostępne: ' + Object.keys(recipes).join(', '));
  process.exit(1);
}

const rows = names.map(n => measure(n, recipes[n](rate), rate, gains ? gains[n] : null));

if (has('json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-inf');
  console.log('\nAudyt dźwięków (rate ' + rate + ' Hz)' +
    (gains ? '  [z tabelą miksu SFX_GAIN]' : '  [bez tabeli miksu — wzmocnienie 1.0 dla wszystkich]'));
  console.log('nazwa      dług.[s]  szczyt   RMS     miks:szczyt  miks:RMS  crest  atak[ms]  centr.[Hz]  DC      klip');
  for (const r of rows) {
    console.log(
      r.name.padEnd(10) +
      f(r.sec).padStart(7) +
      f(r.peak, 3).padStart(9) +
      f(r.rms, 3).padStart(8) +
      (f(r.mixPeakDb, 1) + ' dB').padStart(13) +
      (f(r.mixRmsDb, 1) + ' dB').padStart(10) +
      (f(r.crestDb, 1)).padStart(7) +
      f(r.attackMs, 1).padStart(10) +
      f(r.centroidHz, 0).padStart(12) +
      f(r.dc, 4).padStart(9) +
      String(r.clipped).padStart(6));
  }
  // rozpiętość miksu to jedyna liczba, którą naprawdę warto pilnować przy 8 dźwiękach
  const loud = rows.filter(r => Number.isFinite(r.mixRmsDb));
  if (loud.length > 1) {
    const max = Math.max(...loud.map(r => r.mixRmsDb));
    const min = Math.min(...loud.map(r => r.mixRmsDb));
    console.log('\nRozpiętość miksu (RMS): ' + (max - min).toFixed(1) + ' dB — ' +
      'najgłośniejszy ' + loud.find(r => r.mixRmsDb === max).name +
      ', najcichszy ' + loud.find(r => r.mixRmsDb === min).name + '.');
  }
}

if (DIFF) {
  const file = path.join(OUT, 'baseline-' + DIFF + '.json');
  if (!fs.existsSync(file)) { console.error('\nBŁĄD: brak punktu odniesienia ' + file); process.exit(1); }
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byName = Object.fromEntries(base.map(r => [r.name, r]));
  console.log('\nZmiana wobec „' + DIFF + '":');
  for (const r of rows) {
    const b = byName[r.name];
    if (!b) { console.log('  ' + r.name.padEnd(10) + 'nowy'); continue; }
    const d = (a, c) => (Number.isFinite(a) && Number.isFinite(c) ? (a - c >= 0 ? '+' : '') + (a - c).toFixed(1) : '?');
    console.log('  ' + r.name.padEnd(10) +
      'miks RMS ' + d(r.mixRmsDb, b.mixRmsDb).padStart(6) + ' dB   ' +
      'atak ' + d(r.attackMs, b.attackMs).padStart(6) + ' ms   ' +
      'centroida ' + d(r.centroidHz, b.centroidHz).padStart(7) + ' Hz');
  }
}

fs.mkdirSync(OUT, { recursive: true });
if (SAVE) {
  fs.writeFileSync(path.join(OUT, 'baseline-' + SAVE + '.json'), JSON.stringify(rows, null, 2));
  console.log('\nZapisano punkt odniesienia: dist/audit/baseline-' + SAVE + '.json');
}
if (!has('json')) {
  for (const n of names) {
    const img = plotWaveform(recipes[n](rate), rate);
    fs.writeFileSync(path.join(OUT, n + '.png'), encodePNG(img.w, img.h, img.px));
  }
  console.log('Przebiegi: ' + names.length + ' plików PNG -> ' + OUT);
}
