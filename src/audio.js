'use strict';
/* ============================================================
   DŹWIĘK — wszystko generowane proceduralnie: zero plików audio w repo,
   zero cudzych licencji (istotne przy wydaniu komercyjnym — LICENSE mówi,
   że dźwięk jest wyłączną własnością autora i tak zostaje).

   Dlaczego synteza w runtime, a nie wczytywanie WAV-ów:
   - na file:// zablokowane jest fetch()/decodeAudioData, a ctx.createBuffer()
     plus wypełnienie próbek to czysta arytmetyka, więc działa zawsze
     (to ta sama asymetria co przy sprite'ach: PNG się rysuje, ale odczyt
     pikseli z canvasa jest blokowany — patrz tools/serve.js),
   - 8 dźwięków to ~90 tys. próbek, czyli milisekundy przy pierwszym kliknięciu,
   - build zostaje mały: pliki WAV dołożyłyby ~180 KB do 204 KB całości.

   Przepisy (SFX_RECIPES) są czystymi funkcjami Float32Array i nie dotykają
   przeglądarki, więc `node tools/gen-sounds.js` renderuje z nich pliki WAV
   do odsłuchu i strojenia w edytorze audio. Runtime ich nie potrzebuje.
   ============================================================ */

const SFX_RATE = 22050;
const AUDIO_STORAGE_KEY = 'hexgeneral.audio';

/* ---------------------- primitywy DSP (czyste) ---------------------- */

// deterministyczny szum: ten sam dźwięk w runtime i w wygenerowanym WAV
function audioRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

function midiFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }

function waveAt(kind, phase) {
  const p = phase - Math.floor(phase);
  switch (kind) {
    case 'square': return p < 0.5 ? 1 : -1;
    case 'saw': return p * 2 - 1;
    case 'tri': return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
    default: return Math.sin(p * Math.PI * 2);
  }
}

// ton z przemiataniem wysokości i wykładniczym zanikiem
// attackSec: domyślne 4 ms zdejmuje trzask na początku nuty melodycznej, ale dla
// dźwięków perkusyjnych (wystrzał, eksplozja) właśnie ten trzask JEST uderzeniem —
// tam podaje się wartość bliską zeru
function addTone(buf, rate, at, dur, f0, f1, kind, amp, decay, attackSec) {
  const start = Math.floor(at * rate), n = Math.floor(dur * rate);
  const atk = attackSec === undefined ? 0.004 : attackSec;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const k = start + i;
    if (k >= buf.length) break;
    const u = i / n;
    const f = f0 + (f1 - f0) * u;
    phase += f / rate;
    const attack = atk > 0 ? Math.min(1, i / (rate * atk)) : 1;
    buf[k] += waveAt(kind, phase) * amp * attack * Math.exp(-decay * u);
  }
}

// szum z jednobiegunowym filtrem dolnoprzepustowym przemiatanym w czasie
function addNoise(buf, rate, at, dur, amp, decay, lp0, lp1, rng) {
  const start = Math.floor(at * rate), n = Math.floor(dur * rate);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const k = start + i;
    if (k >= buf.length) break;
    const u = i / n;
    const cutoff = lp0 + (lp1 - lp0) * u;
    const a = Math.min(1, (2 * Math.PI * cutoff) / rate);
    prev += a * (rng() - prev);
    buf[k] += prev * amp * Math.exp(-decay * u);
  }
}

/* Ustawienie poziomu na RMS (nie na szczycie) + wygaszenie ogona (bez tego bufor
   kończy się trzaskiem na nagłym odcięciu).

   Dlaczego RMS, a nie szczyt: normalizacja do szczytu daje poprawną hierarchię
   *szczytów*, ale ucho słyszy energię. Przy poprzedniej wersji `click` wychodził
   głośniej niż `shot` i równo z `explosion` — czyli kliknięcie w przycisk było
   głośniejsze od wystrzału. Poziomy poniżej to jawna tabela miksu, mierzalna
   przez `node tools/audit-sounds.js`.

   Sufit szczytu jest twardy: dźwięk o dużym crest factorze (eksplozja ~17 dB)
   nie zmieści się w zakresie przy dopasowaniu RMS, więc wtedy wygrywa
   bezpieczeństwo i to szczyt ogranicza głośność. Podniesienie takiego dźwięku
   wymaga zmniejszenia crest factora (saturacja), a nie większego wzmocnienia. */
function finishBuffer(buf, rate, level) {
  let sumSq = 0, max = 0;
  for (let i = 0; i < buf.length; i++) {
    sumSq += buf[i] * buf[i];
    max = Math.max(max, Math.abs(buf[i]));
  }
  const rms = Math.sqrt(sumSq / buf.length);
  let g = rms > 0 ? (level || 0.12) / rms : 1;
  if (max * g > 0.98) g = 0.98 / max;
  const fade = Math.min(buf.length, Math.floor(rate * 0.02));
  for (let i = 0; i < buf.length; i++) {
    let v = buf[i] * g;
    const tail = buf.length - i;
    if (tail < fade) v *= tail / fade;
    buf[i] = Math.max(-1, Math.min(1, v));
  }
  return buf;
}

function newBuffer(rate, seconds) { return new Float32Array(Math.floor(rate * seconds)); }

/* -------------------------- przepisy dźwięków -------------------------- */
/* Jedna funkcja na dźwięk — wzorem tankGrid()/artilleryGrid() w generatorze
   sprite'ów: da się dostroić jeden dźwięk bez ruszania pozostałych. */

const SFX_RECIPES = {
  // krótki blip interfejsu — najczęstszy dźwięk w grze, więc siedzi najniżej w miksie
  click(rate) {
    const b = newBuffer(rate, 0.06);
    addTone(b, rate, 0, 0.05, 1050, 760, 'square', 0.5, 6);
    return finishBuffer(b, rate, 0.05);
  },

  // marsz/silnik: stłumiony szum plus niski rumor
  move(rate) {
    const b = newBuffer(rate, 0.22);
    const rng = audioRng(7);
    addNoise(b, rate, 0, 0.2, 0.7, 2.4, 1400, 420, rng);
    addTone(b, rate, 0, 0.2, 120, 82, 'tri', 0.4, 3);
    return finishBuffer(b, rate, 0.063);
  },

  // wystrzał: trzask szumu plus zjeżdżający ton (ton bez narastania — 4 ms rampy
  // zmiękczały właśnie to, co ma być uderzeniem)
  shot(rate) {
    const b = newBuffer(rate, 0.26);
    const rng = audioRng(11);
    addNoise(b, rate, 0, 0.22, 1.0, 7, 5200, 900, rng);
    addTone(b, rate, 0, 0.16, 420, 130, 'square', 0.5, 7, 0.0003);
    return finishBuffer(b, rate, 0.30);
  },

  // trafienie/eksplozja: szeroki szum z opadającym filtrem
  explosion(rate) {
    const b = newBuffer(rate, 0.7);
    const rng = audioRng(23);
    addNoise(b, rate, 0, 0.68, 1.0, 4.2, 3800, 180, rng);
    addTone(b, rate, 0, 0.4, 150, 48, 'tri', 0.55, 4, 0.0003);
    addTone(b, rate, 0, 0.08, 90, 60, 'square', 0.3, 5, 0);
    return finishBuffer(b, rate, 0.30);
  },

  // zdobycie miasta: trzy wznoszące nuty
  city(rate) {
    const b = newBuffer(rate, 0.42);
    const seq = [69, 73, 76];
    seq.forEach((n, i) => addTone(b, rate, i * 0.09, 0.2, midiFreq(n), midiFreq(n), 'tri', 0.5, 4));
    return finishBuffer(b, rate, 0.12);
  },

  // aneksja imperium: dłuższy, cięższy motyw
  annex(rate) {
    const b = newBuffer(rate, 1.3);
    const seq = [45, 52, 57, 64];
    seq.forEach((n, i) => {
      addTone(b, rate, i * 0.16, 0.55, midiFreq(n), midiFreq(n), 'square', 0.32, 2.4);
      addTone(b, rate, i * 0.16, 0.55, midiFreq(n - 12), midiFreq(n - 12), 'tri', 0.26, 2);
    });
    addNoise(b, rate, 0.62, 0.6, 0.3, 3.4, 2200, 220, audioRng(31));
    return finishBuffer(b, rate, 0.16);
  },

  // zwycięstwo: wznoszące arpeggio durowe
  victory(rate) {
    const b = newBuffer(rate, 1.6);
    const seq = [60, 64, 67, 72, 76, 79];
    seq.forEach((n, i) => addTone(b, rate, i * 0.12, 0.5, midiFreq(n), midiFreq(n), 'square', 0.3, 2.2));
    addTone(b, rate, 0.72, 0.85, midiFreq(84), midiFreq(84), 'tri', 0.36, 1.6);
    return finishBuffer(b, rate, 0.17);
  },

  // porażka: opadający motyw molowy
  defeat(rate) {
    const b = newBuffer(rate, 1.7);
    const seq = [64, 60, 57, 53];
    seq.forEach((n, i) => {
      addTone(b, rate, i * 0.22, 0.7, midiFreq(n), midiFreq(n) * 0.985, 'tri', 0.42, 1.8);
    });
    addTone(b, rate, 0.9, 0.8, midiFreq(41), midiFreq(40), 'square', 0.24, 1.4);
    return finishBuffer(b, rate, 0.15);
  },
};

/* Losowe rozstrojenie przy odtwarzaniu. Bufor jest liczony raz i odtwarzany
   bajt w bajt, a ucho wyłapuje dokładne powtórzenie natychmiast — przy dźwiękach
   powtarzanych dziesiątki razy na turę to główne źródło zmęczenia.
   Tylko dźwięki NIEmelodyczne: `city`, `annex`, `victory` i `defeat` to frazy
   nutowe, a ±6% to blisko półtonu, więc rozjechałyby się z muzyką. */
const SFX_VARY = { click: 0.05, move: 0.08, shot: 0.06, explosion: 0.06 };

// dźwięki, które przechodzą nawet przy przyspieszonym AI (ważne zdarzenia)
const SFX_ALWAYS = { city: 1, annex: 1, victory: 1, defeat: 1, click: 1 };
// minimalny odstęp między powtórzeniami tego samego dźwięku (ms)
const SFX_MIN_GAP = { click: 40, move: 90, shot: 80, explosion: 110 };

/* ------------------------------ muzyka ------------------------------ */
/* Chiptune grany w runtime z partytury: pętla 30 s jako plik WAV to 1,3 MB,
   a jako tabela nut ~3 KB. Dodatkowo zapętla się bez szwu i da się
   transponować / przyspieszyć bez renderowania od nowa. */

// nuta: [ćwierćnuta startu, długość w ćwierćnutach, MIDI, instrument]
const MUSIC_TRACKS = {
  menu: {
    bpm: 84,
    loopBeats: 32,
    notes: [
      [0, 4, 45, 'bass'], [4, 4, 45, 'bass'], [8, 4, 50, 'bass'], [12, 4, 50, 'bass'],
      [16, 4, 52, 'bass'], [20, 4, 52, 'bass'], [24, 4, 48, 'bass'], [28, 4, 45, 'bass'],
      [0, 3, 69, 'lead'], [3, 1, 71, 'lead'], [4, 4, 72, 'lead'],
      [8, 3, 71, 'lead'], [11, 1, 69, 'lead'], [12, 4, 67, 'lead'],
      [16, 3, 64, 'lead'], [19, 1, 67, 'lead'], [20, 4, 69, 'lead'],
      [24, 2, 71, 'lead'], [26, 2, 69, 'lead'], [28, 4, 64, 'lead'],
    ],
  },
  game: {
    bpm: 104,
    loopBeats: 32,
    notes: [
      // marszowy puls basu
      [0, 1, 40, 'bass'], [2, 1, 40, 'bass'], [4, 1, 40, 'bass'], [6, 1, 47, 'bass'],
      [8, 1, 41, 'bass'], [10, 1, 41, 'bass'], [12, 1, 41, 'bass'], [14, 1, 48, 'bass'],
      [16, 1, 43, 'bass'], [18, 1, 43, 'bass'], [20, 1, 43, 'bass'], [22, 1, 50, 'bass'],
      [24, 1, 38, 'bass'], [26, 1, 38, 'bass'], [28, 1, 45, 'bass'], [30, 1, 40, 'bass'],
      // rytm perkusyjny
      [1, 0.5, 0, 'perc'], [3, 0.5, 0, 'perc'], [5, 0.5, 0, 'perc'], [7, 0.5, 0, 'perc'],
      [9, 0.5, 0, 'perc'], [11, 0.5, 0, 'perc'], [13, 0.5, 0, 'perc'], [15, 0.5, 0, 'perc'],
      [17, 0.5, 0, 'perc'], [19, 0.5, 0, 'perc'], [21, 0.5, 0, 'perc'], [23, 0.5, 0, 'perc'],
      [25, 0.5, 0, 'perc'], [27, 0.5, 0, 'perc'], [29, 0.5, 0, 'perc'], [31, 0.5, 0, 'perc'],
      // temat
      [0, 2, 64, 'lead'], [2, 2, 67, 'lead'], [4, 2, 71, 'lead'], [6, 2, 67, 'lead'],
      [8, 2, 65, 'lead'], [10, 2, 69, 'lead'], [12, 4, 72, 'lead'],
      [16, 2, 67, 'lead'], [18, 2, 71, 'lead'], [20, 2, 74, 'lead'], [22, 2, 71, 'lead'],
      [24, 2, 69, 'lead'], [26, 2, 65, 'lead'], [28, 4, 64, 'lead'],
    ],
  },
};

const MUSIC_INSTRUMENTS = {
  bass: { wave: 'triangle', gain: 0.5, release: 0.12 },
  lead: { wave: 'square', gain: 0.16, release: 0.08 },
  perc: { wave: 'noise', gain: 0.22, release: 0.05 },
};

/* --------------------------- warstwa runtime --------------------------- */

let AUD = null;              // { ctx, master, musicGain, sfxGain, buffers, voices }
let audioSettings = { master: 0.7, music: 0.45, sfx: 0.85, muted: false };
// „co ma grać" (żądanie gry) trzymane osobno od „co gra" (musicTimer) — inaczej
// wyciszenie gubiłoby informację, do czego wrócić po odciszeniu
let musicWanted = null;
let musicTimer = null;
let musicNextBeatTime = 0;
let musicBeat = 0;
let sfxLastAt = {};

function audioAvailable() {
  return typeof document !== 'undefined' &&
    (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined');
}

function loadAudioSettings() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      for (const k of ['master', 'music', 'sfx']) {
        if (typeof s[k] === 'number') audioSettings[k] = Math.max(0, Math.min(1, s[k]));
      }
      audioSettings.muted = !!s.muted;
    }
  } catch (e) { /* uszkodzony wpis albo tryb prywatny — zostają domyślne */ }
}

function saveAudioSettings() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(audioSettings)); } catch (e) { /* jw. */ }
}

// Kontekst powstaje dopiero przy pierwszym geście użytkownika — polityka
// autoplay trzyma go inaczej w stanie "suspended" i nic nie słychać.
function ensureAudio() {
  if (!audioAvailable()) return null;
  if (AUD) {
    if (AUD.ctx.state === 'suspended') AUD.ctx.resume();
    return AUD;
  }
  const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
  let ctx;
  try { ctx = new Ctor(); } catch (e) { return null; }
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const musicGain = ctx.createGain();
  const sfxGain = ctx.createGain();
  musicGain.connect(master);
  sfxGain.connect(master);

  const buffers = {};
  for (const name of Object.keys(SFX_RECIPES)) {
    const samples = SFX_RECIPES[name](SFX_RATE);
    const buf = ctx.createBuffer(1, samples.length, SFX_RATE);
    buf.getChannelData(0).set(samples);
    buffers[name] = buf;
  }

  AUD = { ctx, master, musicGain, sfxGain, buffers, voices: 0 };
  applyAudioGains();
  return AUD;
}

function applyAudioGains() {
  if (!AUD) return;
  const m = audioSettings.muted ? 0 : audioSettings.master;
  AUD.master.gain.value = m;
  AUD.musicGain.gain.value = audioSettings.music;
  AUD.sfxGain.gain.value = audioSettings.sfx;
}

function initAudio() {
  loadAudioSettings();
  if (typeof document === 'undefined') return;
  // pierwszy gest odblokowuje audio; menu zawsze poprzedza rozgrywkę,
  // więc gest jest zagwarantowany
  const unlock = () => {
    ensureAudio();
    syncMusic(); // pętla mogła zostać zamówiona jeszcze przed gestem
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  // klik dla WSZYSTKICH przycisków jednym listenerem delegowanym — taniej i mniej
  // inwazyjnie niż dopisywanie dźwięku do każdego handlera w menu.js/input.js
  document.addEventListener('click', (ev) => {
    const el = ev.target;
    const btn = el && el.closest ? el.closest('button') : null;
    if (btn && !btn.disabled) playSfx('click');
  });
}

// pętla dobrana do ekranu; wołane z applyScreen(), więc reaguje też na powrót do menu
function updateMusicForScreen() {
  if (!state) return;
  setMusicTrack(state.screen === 'game' ? 'game' : 'menu');
}

// Throttling jest wymogiem, nie polerką: tempo AI 4x/16x dzieli thinkDelay,
// a tryb obserwatora to sama gra botów — bez ograniczenia dźwięki zamieniają
// się w karabin maszynowy.
function sfxAllowed(name) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const gap = SFX_MIN_GAP[name] || 60;
  if (sfxLastAt[name] && now - sfxLastAt[name] < gap) return false;
  if (AUD && AUD.voices >= 8) return false;
  // przy przyspieszonym AI przechodzą tylko ważne zdarzenia
  if (typeof state !== 'undefined' && state && (state.aiSpeed || 1) > 1 && !SFX_ALWAYS[name]) {
    const cp = typeof currentPlayer === 'function' && state.players ? currentPlayer() : null;
    if (cp && !cp.isHuman) return false;
  }
  sfxLastAt[name] = now;
  return true;
}

function playSfx(name) {
  if (!audioAvailable() || audioSettings.muted) return;
  if (!SFX_RECIPES[name]) return;
  if (!sfxAllowed(name)) return;
  const a = ensureAudio();
  if (!a || !a.buffers[name]) return;
  const src = a.ctx.createBufferSource();
  src.buffer = a.buffers[name];
  const vary = SFX_VARY[name];
  if (vary) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
  src.connect(a.sfxGain);
  a.voices++;
  src.onended = () => { a.voices = Math.max(0, a.voices - 1); };
  try { src.start(); } catch (e) { a.voices = Math.max(0, a.voices - 1); }
}

/* --------------------------- odtwarzanie muzyki --------------------------- */

function musicVoice(a, inst, midi, at, durSec) {
  const def = MUSIC_INSTRUMENTS[inst] || MUSIC_INSTRUMENTS.lead;
  const g = a.ctx.createGain();
  g.connect(a.musicGain);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(def.gain, at + 0.01);
  g.gain.setTargetAtTime(0, at + durSec, def.release);

  let node;
  if (def.wave === 'noise') {
    // krótki szum jako perkusja — bufor tworzony raz i współdzielony
    if (!a.percBuf) {
      const n = Math.floor(SFX_RATE * 0.08);
      const b = a.ctx.createBuffer(1, n, SFX_RATE);
      const d = b.getChannelData(0);
      const rng = audioRng(97);
      for (let i = 0; i < n; i++) d[i] = rng() * Math.exp(-14 * (i / n));
      a.percBuf = b;
    }
    node = a.ctx.createBufferSource();
    node.buffer = a.percBuf;
  } else {
    node = a.ctx.createOscillator();
    node.type = def.wave;
    node.frequency.setValueAtTime(midiFreq(midi), at);
  }
  node.connect(g);
  try { node.start(at); } catch (e) { return; }
  const stopAt = at + durSec + def.release * 4;
  if (node.stop) node.stop(stopAt);
}

// Scheduler z wyprzedzeniem: dokłada nuty na osi czasu AudioContext małymi
// porcjami, więc pętla nie tworzy setek węzłów naraz i gra bez szwu.
function musicTick() {
  if (!AUD || !musicWanted) return;
  const track = MUSIC_TRACKS[musicWanted];
  if (!track) return;
  const beatSec = 60 / track.bpm;
  const horizon = AUD.ctx.currentTime + 1.0;
  while (musicNextBeatTime < horizon) {
    const beatInLoop = musicBeat % track.loopBeats;
    for (const [b, dur, midi, inst] of track.notes) {
      // ułamkowy start nuty w obrębie ćwierćnuty też ma działać
      if (Math.floor(b) !== beatInLoop) continue;
      const at = musicNextBeatTime + (b - Math.floor(b)) * beatSec;
      musicVoice(AUD, inst, midi, at, dur * beatSec);
    }
    musicBeat++;
    musicNextBeatTime += beatSec;
  }
}

function musicPlaybackStart() {
  const a = ensureAudio();
  if (!a || musicTimer) return;
  musicBeat = 0;
  musicNextBeatTime = a.ctx.currentTime + 0.08;
  musicTick();
  musicTimer = setInterval(musicTick, 250);
}

function musicPlaybackStop() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

// dopasowuje faktyczne odtwarzanie do tego, co gra zamówiła i co pozwalają
// ustawienia; wołane po każdej zmianie jednego i drugiego
function syncMusic() {
  if (!audioAvailable() || !musicWanted || audioSettings.muted || audioSettings.music <= 0) {
    musicPlaybackStop();
    return;
  }
  musicPlaybackStart();
}

// przełącza pętlę tylko wtedy, gdy naprawdę się zmienia (inaczej muzyka
// restartowałaby się przy każdym odświeżeniu ekranu)
function setMusicTrack(name) {
  const next = name || null;
  if (musicWanted === next) { syncMusic(); return; }
  musicWanted = next;
  musicPlaybackStop(); // nowa pętla startuje od początku
  syncMusic();
}

function stopMusic() { setMusicTrack(null); }

/* ------------------------- API dla panelu opcji ------------------------- */

function getAudioSettings() { return audioSettings; }

function setAudioSetting(kind, value) {
  if (kind === 'muted') {
    audioSettings.muted = !!value;
  } else if (kind === 'master' || kind === 'music' || kind === 'sfx') {
    audioSettings[kind] = Math.max(0, Math.min(1, Number(value)));
  } else return;
  applyAudioGains();
  syncMusic(); // wyciszenie zatrzymuje pętlę, odciszenie ją wraca
  saveAudioSettings();
}
