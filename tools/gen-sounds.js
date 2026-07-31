'use strict';
/* ============================================================
   gen-sounds.js — renderuje dźwięki i muzykę gry do plików WAV
   (czysty Node, zero zależności)

   Po co, skoro gra nie potrzebuje plików: dźwięki są syntezowane w runtime
   (patrz nagłówek src/audio.js — na file:// to jedyna pewna droga, a pętla
   muzyki jako WAV to ~1,3 MB). Ten skrypt służy do STROJENIA: pozwala odsłuchać
   dźwięk w edytorze audio, zobaczyć przebieg, porównać wersje przed i po zmianie
   przepisu. Wyjście jest produktem pomocniczym, nie assetem gry — dlatego trafia
   do gitignorowanego dist/, a nie do assets/.

   Przepisy są wspólne z grą: skrypt wczytuje src/audio.js do sandboxa vm
   (tym samym wzorcem, którym robią to tools/sim.js i tools/stress.js), więc
   nie ma drugiej kopii syntezy, która mogłaby się rozjechać z brzmieniem w grze.

   SFX i muzyka idą tą samą drogą — i to jest zmiana z 0.7.1, warta zapamiętania.
   Wcześniej muzykę grał w przeglądarce graf węzłów Web Audio, więc ten plik musiał
   mieć DRUGĄ implementację syntezy, żeby dało się jej posłuchać poza grą. Dwie
   implementacje rozjeżdżają się po cichu, a wtedy wariant wybrany „na słuch" brzmi
   w grze inaczej. Dziś muzyka to `renderMusicLoop()` w src/audio.js — czysta
   funkcja `(rate) => Float32Array`, tak jak przepisy SFX — a gra odtwarza jej wynik
   jako zapętlony bufor. Narzędzie woła dokładnie tę samą funkcję.

   Użycie:
     node tools/gen-sounds.js                 # SFX -> dist/sfx/*.wav
     node tools/gen-sounds.js --only=explosion
     node tools/gen-sounds.js --rate=44100

     node tools/gen-sounds.js --music         # pętle muzyki -> dist/music/*.wav
     node tools/gen-sounds.js --music=game    # tylko jedna pętla
     node tools/gen-sounds.js --music --loops=3          # ile przejść pętli
     node tools/gen-sounds.js --music --gain=1           # surowy miks zamiast poziomu gry
     node tools/gen-sounds.js --music --tracks=<plik.js> # wariant spoza src/audio.js
     node tools/gen-sounds.js --selftest      # weryfikacja renderera muzyki
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
function hasFlag(name) {
  return args.some(x => x === '--' + name || x.startsWith('--' + name + '='));
}

const OUT_ARG = argVal('out');
const ONLY = argVal('only');
const RATE = parseInt(argVal('rate') || '0', 10) || null;
const LOOPS = Math.max(1, parseInt(argVal('loops') || '2', 10) || 2);
const TRACKS_FILE = argVal('tracks');

/* Muzyka renderuje się domyślnie w 48 kHz, a nie w SFX_RATE (22 kHz), bo w grze
   pętla liczy się w częstotliwości AudioContextu — a ta na typowym sprzęcie to
   właśnie 48 kHz. To nie jest kosmetyka: tablice falowe są obcinane do Nyquista
   dla DANEJ częstotliwości, więc render w innej daje inny sygnał. Przy 44,1 kHz
   plik brzmiałby bardzo podobnie, ale nie byłby bit w bit tym, co słychać w grze. */
const MUSIC_RATE_DEFAULT = 48000;

// src/audio.js jest zwykłym skryptem globalnym (bez modułów), więc wystarczy
// uruchomić go w sandboxie bez `document` — warstwa odtwarzania sama się wyłącza,
// a same przepisy to czysta arytmetyka na Float32Array
function loadAudioSandbox() {
  const ctx = { console, Math, Float32Array, JSON, Date, isNaN, Number };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'audio.js'), 'utf8'), ctx, { filename: 'audio.js' });
  // `const` z audio.js NIE trafia na obiekt sandboxa (ląduje w leksykalnym zakresie
  // skryptu, nie na globalu), więc stałe trzeba wyciągnąć ewaluacją w tym samym
  // kontekście — deklaracje `function` akurat by zadziałały, ale jednolity dostęp
  // jest mniej podatny na pomyłkę przy dokładaniu kolejnych nazw
  const grab = name => vm.runInContext(name, ctx);
  return {
    SFX_RECIPES: grab('SFX_RECIPES'),
    SFX_RATE: grab('SFX_RATE'),
    MUSIC_TRACKS: grab('MUSIC_TRACKS'),
    MUSIC_INSTRUMENTS: grab('MUSIC_INSTRUMENTS'),
    audioSettings: grab('audioSettings'),
    renderMusicLoop: grab('renderMusicLoop'),
    musicWavetable: grab('musicWavetable'),
    MUSIC_TABLE_SIZE: grab('MUSIC_TABLE_SIZE'),
    midiFreq: grab('midiFreq'),
    audioRng: grab('audioRng'),
    waveAt: grab('waveAt'),
  };
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

/* ==================== część 1: SFX ==================== */

function renderSfx() {
  const sandbox = loadAudioSandbox();
  const recipes = sandbox.SFX_RECIPES;
  const rate = RATE || sandbox.SFX_RATE;
  if (!recipes) { console.error('BŁĄD: nie znalazłem SFX_RECIPES w src/audio.js'); process.exit(1); }

  const names = Object.keys(recipes).filter(n => !ONLY || n === ONLY);
  if (!names.length) {
    console.error('BŁĄD: brak dźwięku o nazwie "' + ONLY + '". Dostępne: ' + Object.keys(recipes).join(', '));
    process.exit(1);
  }

  const out = OUT_ARG || path.join(ROOT, 'dist', 'sfx');
  fs.mkdirSync(out, { recursive: true });
  let total = 0;
  for (const name of names) {
    const samples = recipes[name](rate);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const wav = wavFromSamples(samples, rate);
    fs.writeFileSync(path.join(out, name + '.wav'), wav);
    total += wav.length;
    console.log('  ' + name.padEnd(10) +
      (samples.length / rate).toFixed(2) + ' s   ' +
      String(Math.round(wav.length / 1024)).padStart(4) + ' KB   szczyt ' + peak.toFixed(3));
  }
  console.log('\nGotowe: ' + names.length + ' plików, ' + Math.round(total / 1024) + ' KB -> ' + out);
  console.log('Gra ich NIE wczytuje — syntezuje te same przepisy w runtime (patrz src/audio.js).');
}

/* ==================== część 2: muzyka ====================

   Ta część jest teraz cienka i to jest jej najważniejsza cecha. Do 0.7.0 muzykę
   grał w przeglądarce graf węzłów Web Audio, więc żeby dało się jej posłuchać
   poza grą, ten plik musiał zawierać DRUGĄ implementację syntezy — a dwie
   implementacje rozjeżdżają się po cichu i wtedy wariant wybrany „na słuch"
   brzmi w grze inaczej. Dziś `renderMusicLoop()` w `src/audio.js` jest czystą
   funkcją, której używa i gra, i to narzędzie. Nie ma czego synchronizować.
*/

function renderMusic() {
  const sandbox = loadAudioSandbox();
  const src = loadTrackSource(sandbox);
  const rate = RATE || MUSIC_RATE_DEFAULT;
  const want = argVal('music');
  const names = Object.keys(src.tracks).filter(n => !want || n === want);
  if (!names.length) {
    console.error('BŁĄD: brak pętli o nazwie "' + want + '". Dostępne: ' + Object.keys(src.tracks).join(', '));
    process.exit(1);
  }

  const gainArg = argVal('gain');
  const settings = sandbox.audioSettings;
  const gain = gainArg !== null ? Number(gainArg) : settings.master * settings.music;
  if (!(gain > 0 && gain <= 4)) {
    console.error('BŁĄD: --gain musi być liczbą z zakresu (0; 4], dostałem "' + gainArg + '"');
    process.exit(1);
  }

  const out = OUT_ARG || path.join(ROOT, 'dist', 'music');
  fs.mkdirSync(out, { recursive: true });
  console.log('Tabele nut z: ' + src.from + '   (' + rate + ' Hz, ' + LOOPS + '× pętla, wzmocnienie ' +
    gain.toFixed(3) + (gainArg === null ? ' = miks gry' : ' — podane ręcznie') + ')');

  let total = 0;
  for (const name of names) {
    lintTrack(name, src.tracks[name], src.instruments);
    const t0 = Date.now();
    const loop = sandbox.renderMusicLoop(name, rate, src.tracks, src.instruments);
    const ms = Date.now() - t0;
    // pętla jest bezszwowa, więc kilka przejść to zwykłe sklejenie kopii —
    // dokładnie to, co robi w grze BufferSource z loop = true
    const samples = new Float32Array(loop.length * LOOPS);
    for (let k = 0; k < LOOPS; k++) samples.set(loop, k * loop.length);
    let peak = 0, sum = 0;
    for (let i = 0; i < samples.length; i++) {
      samples[i] *= gain;
      const a = Math.abs(samples[i]);
      if (a > peak) peak = a;
      sum += samples[i] * samples[i];
    }
    const wav = wavFromSamples(samples, rate);
    fs.writeFileSync(path.join(out, name + '.wav'), wav);
    total += wav.length;
    console.log('  ' + name.padEnd(10) +
      (samples.length / rate).toFixed(2) + ' s   ' +
      String(Math.round(wav.length / 1024)).padStart(5) + ' KB   ' +
      String(src.tracks[name].notes.length).padStart(4) + ' nut   szczyt ' + peak.toFixed(3) +
      '   RMS ' + Math.sqrt(sum / samples.length).toFixed(3) + '   render ' + ms + ' ms');
  }
  console.log('\nGotowe: ' + names.length + ' plików, ' + Math.round(total / 1024) + ' KB -> ' + out);
  console.log(gainArg === null
    ? 'Poziom odpowiada domyślnym ustawieniom gry (muzyka ' + settings.music +
      ' × głośność ' + settings.master + '). Surowy miks: --gain=1'
    : 'UWAGA: poziom podany ręcznie, to NIE jest głośność, z jaką gra to wypuszcza.');
}

/* Lint partytury. Najważniejszy przypadek: nuta z `b >= loopBeats` nie zabrzmi
   NIGDY — pętla jej nie obejmuje. Bez ostrzeżenia wygląda to na cichy błąd
   w kompozycji, bo w tabeli nuta jest, a w dźwięku jej nie ma. */
function lintTrack(name, track, instruments) {
  const warns = [];
  const drums = { kick: 1, snare: 1, hat: 1 };
  for (const [b, dur, midi, inst] of track.notes) {
    if (b >= track.loopBeats)
      warns.push(`nuta na bicie ${b} wykracza poza loopBeats=${track.loopBeats} — gra jej NIE zagra`);
    const def = instruments[inst];
    if (!def) { warns.push(`nieznany instrument "${inst}" — nuta zostanie pominięta`); continue; }
    if (!drums[def.type] && !(midi > 0))
      warns.push(`instrument "${inst}" jest tonalny, a nuta ma midi=${midi}`);
    if (!drums[def.type] && dur <= 0)
      warns.push(`instrument "${inst}" dostał nutę o długości ${dur}`);
  }
  if (warns.length) {
    console.log('  UWAGI do "' + name + '":');
    for (const w of [...new Set(warns)]) console.log('    ! ' + w);
  }
  return warns.length;
}

/* Warianty ścieżki dźwiękowej trzyma się w osobnym pliku, żeby porównanie nie
   wymagało edytowania src/audio.js przed każdym odsłuchem. Plik jest zwykłym
   modułem CommonJS eksportującym MUSIC_TRACKS (i opcjonalnie MUSIC_INSTRUMENTS)
   — tymi samymi nazwami co w grze, więc zwycięski wariant przenosi się
   kopiuj-wklej, bez tłumaczenia formatu. */
function loadTrackSource(sandbox) {
  if (!TRACKS_FILE) {
    return { tracks: sandbox.MUSIC_TRACKS, instruments: sandbox.MUSIC_INSTRUMENTS, from: 'src/audio.js' };
  }
  const p = path.resolve(ROOT, TRACKS_FILE);
  if (!fs.existsSync(p)) { console.error('BŁĄD: nie ma pliku ' + p); process.exit(1); }
  const mod = require(p);
  const tracks = mod.MUSIC_TRACKS || mod.tracks;
  if (!tracks) { console.error('BŁĄD: ' + TRACKS_FILE + ' nie eksportuje MUSIC_TRACKS'); process.exit(1); }
  return {
    tracks,
    instruments: mod.MUSIC_INSTRUMENTS || mod.instruments || sandbox.MUSIC_INSTRUMENTS,
    from: path.relative(ROOT, p).replace(/\\/g, '/'),
  };
}

/* ==================== część 3: selftest ====================

   Zakres tych testów zmienił się razem z architekturą. Do 0.7.0 pilnowały, żeby
   kopia syntezy w tym pliku nie rozjechała się z Web Audio — ta kopia już nie
   istnieje, więc te sprawdzenia zniknęły razem z nią. Zostają dwie rzeczy, które
   dalej mogą się cicho zepsuć: własności DSP i BEZSZWOWOŚĆ pętli.
*/

function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

function selftest() {
  const sandbox = loadAudioSandbox();
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, cond, detail });

  /* 1. Kształty fal wobec ideału. Fala pasmowo ograniczona ma pokrywać się
        z naiwną (`waveAt` z audio.js) poza otoczeniem nieciągłości. Fazy NIE
        zakładamy — szukamy najlepszego dopasowania po wszystkich przesunięciach,
        bo wpisanie jej z góry znaczyłoby dopasowanie testu do implementacji. */
  const naiveName = { square: 'square', sawtooth: 'saw', triangle: 'tri', sine: 'sine' };
  const naiveJump = { square: [0, 0.5], sawtooth: [0], triangle: [], sine: [] };
  const SIZE = sandbox.MUSIC_TABLE_SIZE;
  const devAt = (tab, wave, shift) => {
    let maxDev = 0, sum = 0, n = 0;
    for (let i = 0; i < SIZE; i++) {
      const ref = ((i + shift) % SIZE) / SIZE;
      if (naiveJump[wave].some(j => Math.min(Math.abs(ref - j), 1 - Math.abs(ref - j)) < 0.03)) continue;
      const d = Math.abs(tab[i] - sandbox.waveAt(naiveName[wave], ref));
      if (d > maxDev) maxDev = d;
      sum += d * d; n++;
    }
    return { maxDev, rms: Math.sqrt(sum / n) };
  };
  for (const wave of ['square', 'sawtooth', 'triangle', 'sine']) {
    const tab = sandbox.musicWavetable(wave, 220, 44100);
    let best = null, bestShift = 0;
    for (let s = 0; s < SIZE; s += 16) {
      const d = devAt(tab, wave, s);
      if (!best || d.rms < best.rms) { best = d; bestShift = s; }
    }
    for (let s = bestShift - 16; s <= bestShift + 16; s++) {
      const d = devAt(tab, wave, (s + SIZE) % SIZE);
      if (d.rms < best.rms) { best = d; bestShift = (s + SIZE) % SIZE; }
    }
    const tol = (wave === 'square' || wave === 'sawtooth') ? 0.20 : 0.02;
    ok('kształt fali "' + wave + '"', best.maxDev < tol && best.rms < tol / 2,
      'maxDev ' + best.maxDev.toFixed(3) + ', RMS ' + best.rms.toFixed(4) +
      ' przy fazie ' + (bestShift / SIZE).toFixed(3));
  }

  // 2. Pasma oktawowe: wyższa nuta musi dostać tablicę o mniejszej liczbie
  //    harmonicznych, inaczej obcięcie do Nyquista nie działa i render aliasuje
  {
    /* Miarą jest NAJWIĘKSZY skok między sąsiednimi próbkami, a nie ich suma:
       suma dla piły jest zdominowana przez samą rampę i wychodzi podobna
       niezależnie od liczby harmonicznych. Najostrzejsze zbocze mówi wprost,
       jak wysoko sięga widmo. */
    const edge = t => { let m = 0; for (let i = 1; i < t.length; i++) m = Math.max(m, Math.abs(t[i] - t[i - 1])); return m; };
    const low = edge(sandbox.musicWavetable('sawtooth', 60, 44100));
    const high = edge(sandbox.musicWavetable('sawtooth', 4000, 44100));
    ok('pasma: wysoka nuta ma mniej harmonicznych', high < low * 0.5,
      'najostrzejsze zbocze 60 Hz ' + low.toFixed(3) + ' vs 4 kHz ' + high.toFixed(3));
  }

  /* 3. BEZSZWOWOŚĆ — najważniejszy test w tym pliku. Bufor pętli musi być
        stanem USTALONYM ciągłego grania: ogon nuty zaczętej pod koniec ma wrócić
        na początek. Gdyby zawijanie nie działało, pętla klikałaby przy każdym
        obiegu, a to jedyna wada, której nie widać w żadnej innej mierze.
        Sprawdzamy przez porównanie skoku na szwie z rozkładem skoków wewnątrz
        pętli — szew nie może być wyraźnie ostrzejszy niż to, co i tak w niej gra. */
  for (const name of Object.keys(sandbox.MUSIC_TRACKS)) {
    const b = sandbox.renderMusicLoop(name, 44100);
    let sum = 0, max = 0;
    for (let i = 1; i < b.length; i++) {
      const d = Math.abs(b[i] - b[i - 1]);
      sum += d; if (d > max) max = d;
    }
    const avg = sum / (b.length - 1);
    const seam = Math.abs(b[0] - b[b.length - 1]);
    // próg: szew ma się mieścić w tym, co pętla i tak robi na transjentach perkusji
    ok('pętla "' + name + '" bezszwowa', seam <= max * 0.5,
      'szew ' + seam.toFixed(4) + ' (' + (seam / avg).toFixed(0) + '× średnia, ' +
      (seam / max * 100).toFixed(0) + '% maks. skoku w pętli)');
  }

  // 4. Poziom: normalizacja musi trzymać sufit szczytu, inaczej pętla klipuje
  for (const name of Object.keys(sandbox.MUSIC_TRACKS)) {
    const b = sandbox.renderMusicLoop(name, 44100);
    let peak = 0;
    for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(b[i]));
    ok('pętla "' + name + '" nie klipuje', peak <= 0.951, 'szczyt ' + peak.toFixed(3));
  }

  // 5. Determinizm: ten sam render dwa razy to ten sam sygnał
  {
    const a = sandbox.renderMusicLoop('game', 22050);
    const b = sandbox.renderMusicLoop('game', 22050);
    let same = a.length === b.length;
    for (let i = 0; i < a.length && same; i++) same = a[i] === b[i];
    ok('render jest deterministyczny', same, a.length + ' próbek');
  }

  let failed = 0;
  for (const r of results) {
    console.log('  ' + (r.cond ? 'ok  ' : 'BŁĄD') + '  ' + r.name.padEnd(34) + '  ' + r.detail);
    if (!r.cond) failed++;
  }
  console.log('');
  if (failed) {
    console.log('BŁĘDY: ' + failed + '/' + results.length + '.');
    process.exit(1);
  }
  console.log('OK: ' + results.length + ' sprawdzeń.');
  console.log('Gra i to narzędzie liczą muzykę TĄ SAMĄ funkcją (renderMusicLoop w src/audio.js),');
  console.log('więc plik z dist/music/ jest z definicji tym, co słychać w grze.');
}

/* ==================== wejście ==================== */

if (hasFlag('selftest')) selftest();
else if (hasFlag('music')) renderMusic();
else renderSfx();
