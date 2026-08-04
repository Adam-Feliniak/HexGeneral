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

/* Filtr stanowy (SVF) w topologii ZDF — w odróżnieniu od jednobiegunowego filtra
   wbudowanego w addNoise() ma REZONANS (Q) i strome zbocze. Rezonans jest tu całym
   sensem: to on robi z płaskiego szumu „ciało" o rozpoznawalnej wysokości, czyli
   różnicę między sykiem a hukiem.

   Przemiatanie jest GEOMETRYCZNE (f0 · (f1/f0)^u), a nie liniowe jak w addNoise():
   ucho słyszy wysokość logarytmicznie, więc zjazd 4000 → 120 Hz liniowo spędza
   większość czasu w górnej oktawie i brzmi jak nagłe ucięcie zamiast opadania.

   Topologia zero-delay feedback (Zavalishin) zamiast klasycznego Chamberlina, bo
   ten drugi rozjeżdża się przy wysokich częstotliwościach odcięcia — a tu filtr
   startuje wysoko i zjeżdża w dół, czyli dokładnie tam, gdzie by się wywalił. */
function svfSweep(buf, rate, kind, at, dur, f0, f1, q) {
  const start = Math.floor(at * rate), n = Math.floor(dur * rate);
  const k = 1 / Math.max(0.5, q);
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const fc = Math.min(rate * 0.45, Math.max(10, f0 * Math.pow(f1 / f0, i / n)));
    const g = Math.tan(Math.PI * fc / rate);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const x = buf[idx];
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    buf[idx] = kind === 'hp' ? (x - k * v1 - v2) : kind === 'bp' ? v1 : v2;
  }
}

/* Miękkie nasycenie (tanh). Dwie rzeczy naraz, obie potrzebne przy wybuchu:
   zbija crest factor — czyli `finishBuffer` może podnieść RMS, zanim uderzy
   w sufit szczytu (patrz komentarz niżej) — i dokłada harmoniczne, przez co
   dźwięk czyta się jako GŁOŚNY, a nie tylko wysoko wysterowany. Normalizacja
   przez tanh(drive) trzyma wejście 1.0 przy wyjściu 1.0. */
function saturate(buf, drive, at, dur, rate) {
  const start = at === undefined ? 0 : Math.floor(at * rate);
  const end = dur === undefined ? buf.length : Math.min(buf.length, start + Math.floor(dur * rate));
  const norm = Math.tanh(drive);
  for (let i = start; i < end; i++) buf[i] = Math.tanh(buf[i] * drive) / norm;
}

/* Uderzenie: ton z GEOMETRYCZNYM opadaniem wysokości. addTone() przemiata liniowo,
   co brzmi jak zjazd syreny; membrana czy słup powietrza po uderzeniu opada
   logarytmicznie (kolejne obniżenie o oktawę zajmuje tyle samo czasu) i dopiero
   to czyta się jako „bum". */
function addThump(buf, rate, at, dur, f0, f1, kind, amp, decay) {
  const start = Math.floor(at * rate), n = Math.floor(dur * rate);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const k = start + i;
    if (k >= buf.length) break;
    const u = i / n;
    phase += (f0 * Math.pow(f1 / f0, u)) / rate;
    // 1 ms narastania: bez tego start od zera fazy daje słyszalny trzask,
    // ale dłuższe zmiękczyłoby samo uderzenie
    buf[k] += waveAt(kind, phase) * amp * Math.min(1, i / (rate * 0.001)) * Math.exp(-decay * u);
  }
}

/* Pogłos Schroedera: 4 równoległe filtry grzebieniowe + 2 szeregowe wszechprzepustowe.
   Po co w grze bez przestrzeni: ogon pogłosowy niesie informację o ODLEGŁOŚCI
   i wielkości źródła. Bez niego wybuch brzmi jak zderzenie w studiu — krótko
   i „przy uchu" — a to jest właśnie ta różnica, którą słychać jako „nierealistyczny".
   Długości opóźnień są względnie pierwsze, żeby grzebienie nie nakładały maksimów
   i nie robiły metalicznego dzwonienia. */
function reverbTail(buf, rate, mix, rt60) {
  const mk = (ms, fb) => ({
    line: new Float32Array(Math.max(1, Math.round(ms / 1000 * rate))), i: 0,
    g: fb === undefined ? Math.pow(10, -3 * (ms / 1000) / rt60) : fb,
  });
  const combs = [29.7, 37.1, 41.1, 43.7].map(ms => mk(ms));
  const aps = [5.0, 1.7].map(ms => mk(ms, 0.7));
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    let y = 0;
    for (const c of combs) {
      const d = c.line[c.i];
      c.line[c.i] = x + d * c.g;
      c.i = (c.i + 1) % c.line.length;
      y += d;
    }
    y *= 0.25;
    for (const a of aps) {
      const d = a.line[a.i];
      a.line[a.i] = y + d * a.g;
      y = d - y;
    }
    buf[i] = x + y * mix;
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
  /* Blokada składowej stałej. Filtrowanie szumu do bardzo niskich częstotliwości
     zostawia powolne błądzenie wokół zera, a grzebienie pogłosu mają przy zerze
     wzmocnienie 1/(1-g), więc je jeszcze podbijają. Przy wybuchu dawało to offset
     0,018 zamiast 0,001. Słyszalne to nie jest — ale zjada zapas przed szczytem,
     czyli obniża głośność, którą można wycisnąć. Miejsce jest tutaj, bo to
     zabezpieczenie miksu, a nie element brzmienia żadnego pojedynczego przepisu. */
  const r = Math.exp(-2 * Math.PI * 20 / rate);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    y1 = x - x1 + r * y1;
    x1 = x;
    buf[i] = y1;
  }
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

// warstwy filtrowane osobno trzeba złożyć — filtr musi dostać czysty materiał,
// więc nie da się ich budować od razu w buforze docelowym
function mixInto(dst, src, gain) {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i++) dst[i] += src[i] * gain;
}

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

  // Marsz/silnik: wąskopasmowy szum (gąsienice, kroki) plus pracujący silnik.
  // Silnik to DWA lekko rozstrojone tony — dudnienie między nimi daje wrażenie
  // pracy maszyny; pojedynczy ton brzmi jak brzęczyk.
  move(rate) {
    const b = newBuffer(rate, 0.28);
    const tracks = newBuffer(rate, 0.28);
    addNoise(tracks, rate, 0, 0.24, 1.0, 2.6, 20000, 20000, audioRng(7)); // szum surowy — pasmo wycina filtr
    svfSweep(tracks, rate, 'bp', 0, 0.24, 1300, 380, 1.4);
    mixInto(b, tracks, 1.2);
    addTone(b, rate, 0, 0.26, 118, 96, 'tri', 0.35, 3);
    addTone(b, rate, 0, 0.26, 121, 98, 'tri', 0.30, 3);
    saturate(b, 1.6);
    return finishBuffer(b, rate, 0.063);
  },

  // Wystrzał: trzask wylotowy + korpus + odbicie w dół lufy.
  // Trzask bez narastania (4 ms rampy zmiękczały właśnie to, co ma być uderzeniem).
  shot(rate) {
    const b = newBuffer(rate, 0.45);
    const rng = audioRng(11);
    addNoise(b, rate, 0, 0.02, 1.0, 40, 11000, 6000, rng);
    const body = newBuffer(rate, 0.45);
    addNoise(body, rate, 0, 0.22, 1.0, 6.5, 20000, 20000, rng);
    svfSweep(body, rate, 'lp', 0, 0.22, 6000, 320, 2.4);
    mixInto(b, body, 1.5);
    addThump(b, rate, 0, 0.16, 320, 70, 'tri', 0.5, 7);
    reverbTail(b, rate, 0.14, 0.45);
    saturate(b, 2.6);
    return finishBuffer(b, rate, 0.16);
  },

  /* Trafienie/eksplozja — cztery warstwy, każda odpowiada za inne wrażenie:
     trzask niesie „blisko", korpus jest samym hukiem, sub uderza w klatkę
     piersiową, a rumor to opadające szczątki. Poprzednia wersja miała tylko
     korpus, i to filtrowany jednobiegunowo, więc centroida widmowa siedziała
     na 5,1 kHz — czyli energia była w syku, a nie w huku. */
  explosion(rate) {
    const b = newBuffer(rate, 1.25);
    const rng = audioRng(23);
    const body = newBuffer(rate, 1.25);
    addNoise(body, rate, 0, 0.95, 1.0, 2.2, 20000, 20000, rng);
    svfSweep(body, rate, 'lp', 0, 0.95, 2200, 85, 2.1);               // korpus
    mixInto(b, body, 2.0);
    addThump(b, rate, 0, 0.6, 115, 30, 'sine', 1.05, 3.2);            // sub
    const rumble = newBuffer(rate, 1.25);
    addNoise(rumble, rate, 0.05, 1.15, 1.0, 2.8, 20000, 20000, audioRng(29));
    svfSweep(rumble, rate, 'lp', 0.05, 1.15, 550, 80, 0.9);           // rumor
    mixInto(b, rumble, 0.85);
    /* Pogłos NA TYM ETAPIE, przed dołożeniem trzasku: odbija się dudnienie,
       a trzask dociera do ucha bezpośrednio. Odwrotna kolejność (pogłos na
       gotowej całości) rozsmarowuje wysokie pasmo trzasku na cały ogon i wybuch
       robi się jasny — centroida 2924 Hz zamiast poniżej 1500. */
    reverbTail(b, rate, 0.22, 0.9);
    /* Saturacja dokłada harmoniczne, więc PODNOSI centroidę — i to tym mocniej,
       im jaśniejszy materiał dostanie. Dlatego nasycamy same niskie warstwy,
       zanim dojdzie trzask: crest zostaje zbity tam, gdzie siedzi energia,
       a trzask przechodzi czysto i nie rozjaśnia całości. */
    saturate(b, 1.9);
    addNoise(b, rate, 0, 0.04, 0.5, 30, 4500, 1500, rng);             // trzask, sucho i bez nasycenia
    return finishBuffer(b, rate, 0.20);
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
/* Minimalny odstęp między powtórzeniami tego samego dźwięku (ms).
   Dobierać RAZEM z długością dźwięku: iloraz długość/odstęp to liczba kopii, które
   mogą brzmieć naraz. Przy limicie 8 głosów `explosion` (1,25 s) z odstępem 110 ms
   dawał 11 kopii — sam wypełniał pulę i wypychał z niej zdarzenia. 200 ms daje 6. */
const SFX_MIN_GAP = { click: 40, move: 90, shot: 110, explosion: 200 };

/* ------------------------------ muzyka ------------------------------ */
/* Partytura jako tabela nut (~3 KB) zamiast pliku (pętla to ~1,3 MB jako WAV),
   renderowana do bufora przy pierwszym odtworzeniu — patrz renderMusicLoop(). */

/* Tonacja: E FRYGIJSKA (E-F-G-A-B-C-D). Wybór świadomy i zostaje z poprzedniej
   wersji, bo był dobry: półton E-F na samym początku skali to najciemniejszy
   interwał, jaki da się mieć bez wychodzenia poza materiał diatoniczny.
   Wersja 0.6.0 brzmiała „jak z NES-a" nie przez tonację, tylko przez syntezę
   (trzy fale, brak filtra) i przez rytm (bas i perkusja na zmianę co bit,
   czyli oom-pah). Tu zmienia się jedno i drugie, nie skala. */

function musicEvery(from, to, step) {
  const a = [];
  for (let b = from; b < to - 1e-9; b += step) a.push(Math.round(b * 1000) / 1000);
  return a;
}
function musicHits(beats, dur, midi, inst) { return beats.map(b => [b, dur, midi, inst]); }

// bas: ósemkowy wzór na 8 bitów, powtarzany na czterech stopniach (E-F-G-D)
const MUSIC_BASS_SHAPE = [0, 0, 0, 12, 0, 0, 7, 0, 0, 0, 0, 12, 0, 7, 0, 7];
function musicBassLine(roots, inst) {
  const out = [];
  roots.forEach((root, phrase) => {
    MUSIC_BASS_SHAPE.forEach((iv, k) => out.push([phrase * 8 + k * 0.5, 0.42, root + iv, inst]));
  });
  return out;
}

/* Wzór taktowy powtórzony na liście stopni. `pattern` to [odstęp, długość,
   interwał od stopnia] — dzięki temu bas i pad idą za harmonią same, zamiast
   być przepisywane takt po takcie. */
function musicBar(start, barLen, roots, pattern, inst) {
  const out = [];
  roots.forEach((root, i) => {
    for (const [off, dur, iv] of pattern) out.push([start + i * barLen + off, dur, root + iv, inst]);
  });
  return out;
}

/* Akord z jawną listą interwałów. Potrzebny tam, gdzie harmonia miesza tercje
   małe z wielkimi (dorycka: Em ma +15, A ma +16) — `musicBar()` z jednym wzorem
   dla wszystkich stopni zagrałby wtedy jeden z nich w złym trybie. */
function musicChord(start, dur, root, ivs, inst) {
  return ivs.map(iv => [start, dur, root + iv, inst]);
}

/* Harmonie utworów puli. Stopnie podane per TAKT (4 bity), a nie per fraza,
   bo tylko wtedy `musicBar()` rozstawia bas i pad bez przepisywania ich ręcznie. */
const MUSIC_HEAVY_ROOTS = [40, 40, 41, 41, 43, 43, 41, 40,    // E E F F G G F E
  40, 40, 43, 43, 41, 41, 38, 40];                            // E E G G F F D E
const MUSIC_TIGHT_ROOTS = [40, 40, 41, 41, 43, 43, 38, 38,
  40, 40, 41, 41, 43, 43, 38, 40];
const MUSIC_BRIGHT_ROOTS = [40, 40, 45, 45, 38, 38, 45, 40,
  45, 45, 38, 38, 40, 40, 45, 40];
// dorycka miesza tercje: Em ma +15, pozostałe +16 — stąd jawne listy interwałów
const MUSIC_AMBIENT_CHORDS = [
  [0, 40, [12, 15, 19]], [8, 45, [12, 16, 19]], [16, 43, [12, 16, 19]], [24, 38, [12, 16, 19]],
  [32, 40, [12, 15, 19]], [40, 45, [12, 16, 19]], [48, 43, [12, 16, 19]], [56, 38, [12, 16, 19]],
];

/* Temat `marchTight` — ten sam, którym gra `game`, przedłużony o odpowiedź
   w drugiej połowie pętli. Trzymany osobno, bo grają go DWA instrumenty
   (lead i blacha oktawę niżej), a rozjechanie się kopii byłoby cichym błędem. */
const MUSIC_TIGHT_LEAD = [
  [0, 1.5, 64], [1.5, 0.5, 67], [2, 1, 71], [3, 1, 69],
  [4, 2, 67], [6, 1.5, 65],
  [8, 1.5, 64], [9.5, 0.5, 67], [10, 1, 71], [11, 1, 72],
  [12, 3.5, 71],
  [16, 1.5, 71], [17.5, 0.5, 72], [18, 1, 74], [19, 1, 72],
  [20, 2, 71], [22, 1.5, 67],
  [24, 1.5, 69], [25.5, 0.5, 67], [26, 1, 65], [27, 1, 64],
  [28, 3.5, 64],
  [32, 1.5, 71], [33.5, 0.5, 74], [34, 1, 76], [35, 1, 74],
  [36, 2, 72], [38, 1.5, 71],
  [40, 1.5, 69], [41.5, 0.5, 72], [42, 1, 74], [43, 1, 76],
  [44, 3.5, 74],
  [48, 1.5, 76], [49.5, 0.5, 74], [50, 1, 72], [51, 1, 71],
  [52, 2, 72], [54, 1.5, 69],
  [56, 1.5, 67], [57.5, 0.5, 69], [58, 1, 71], [59, 1, 69],
  [60, 3.5, 64],
];

/* WSPÓLNY POZIOM CAŁEJ PULI, i to jest wymóg, nie kosmetyka: skoro utwór partii
   losuje się z `mapSeed`, dwie partie z różnym ziarnem nie mogą różnić się
   głośnością — inaczej gracz słyszy „ta mapa ma cichszą muzykę".

   Liczbę wyznacza utwór o najwyższym creście, bo tylko do jego sufitu sięgają
   wszystkie: sufit szczytu w `musicNormalize` ucina wzmocnienie wcześniej niż
   zadany RMS (0,95 / crest). Zmierzone maksima: `game` 0,218, `marchTight`
   0,208, `ambient` 0,167, `marchHeavy` 0,161, `bright` 0,137 — i to `bright`
   wiąże pulę. Podbicie `drive`, żeby zbić crest, odpadło świadomie: w utworze
   spokojnym saturację słychać wprost.

   Skutek uboczny, o którym trzeba wiedzieć: `game` grał dotąd na 0,20, więc
   cała muzyka partii jest o 3,4 dB cichsza niż w 0.7.2. Menu (0,11) zostaje
   bez zmian, przez co wejście do gry to teraz skok o 1,8 dB zamiast 5,2 dB. */
const MUSIC_POOL_LEVEL = 0.135;

// nuta: [ćwierćnuta startu, długość w ćwierćnutach, MIDI, instrument]
const MUSIC_TRACKS = {
  menu: {
    // level dobrany do tego, co pętla FAKTYCZNIE osiąga: menu jest rzadkie, ma
    // wysoki crest i przy 0,20 ograniczałby je sufit szczytu, a nie zadany RMS
    // (ta sama pułapka, co przy poziomach SFX — patrz 14-Dzwiek.md)
    bpm: 96, loopBeats: 32, drive: 1.15, reverb: 0.18, reverbTime: 1.1, level: 0.11,
    notes: [].concat(
      musicHits([0, 8, 16, 24], 0.3, 0, 'kick'),
      musicHits(musicEvery(0, 32, 4), 0.2, 0, 'hat'),
      [
        [0, 8, 40, 'bass'], [8, 8, 41, 'bass'], [16, 8, 43, 'bass'], [24, 8, 38, 'bass'],
        [0, 8, 52, 'pad'], [0, 8, 59, 'pad'], [8, 8, 53, 'pad'], [8, 8, 60, 'pad'],
        [16, 8, 55, 'pad'], [16, 8, 62, 'pad'], [24, 8, 50, 'pad'], [24, 8, 57, 'pad'],
        [2, 3, 64, 'lead'], [5, 2, 67, 'lead'], [10, 4, 65, 'lead'],
        [18, 3, 71, 'lead'], [21, 2, 69, 'lead'], [26, 5, 64, 'lead'],
      ]),
  },
  game: {
    // drive 2,0 nie jest kwestią smaku: dopiero przy nim crest spada na tyle,
    // że pętla dobija do zadanego RMS zamiast opierać się o sufit szczytu
    bpm: 132, loopBeats: 32, drive: 2.0, reverb: 0.1, reverbTime: 0.7, level: MUSIC_POOL_LEVEL,
    notes: [].concat(
      // rytm: stopa, werbel na 2 i 4, hi-hat ósemkami — trzy różne brzmienia
      // zamiast jednego szumu, i dopiero to daje rytm zamiast metronomu
      musicHits([0, 3.5, 4, 8, 11.5, 12, 16, 19.5, 20, 24, 27.5, 28], 0.3, 0, 'kick'),
      musicHits([2, 6, 10, 14, 18, 22, 26, 30], 0.3, 0, 'snare'),
      musicHits(musicEvery(0, 32, 0.5), 0.15, 0, 'hat'),
      musicBassLine([40, 41, 43, 38], 'bass'),
      [
        [0, 8, 52, 'pad'], [0, 8, 59, 'pad'], [8, 8, 53, 'pad'], [8, 8, 60, 'pad'],
        [16, 8, 55, 'pad'], [16, 8, 62, 'pad'], [24, 8, 50, 'pad'], [24, 8, 57, 'pad'],
        [0, 1.5, 64, 'lead'], [1.5, 0.5, 67, 'lead'], [2, 1, 71, 'lead'], [3, 1, 69, 'lead'],
        [4, 2, 67, 'lead'], [6, 1.5, 65, 'lead'],
        [8, 1.5, 64, 'lead'], [9.5, 0.5, 67, 'lead'], [10, 1, 71, 'lead'], [11, 1, 72, 'lead'],
        [12, 3.5, 71, 'lead'],
        [16, 1.5, 71, 'lead'], [17.5, 0.5, 72, 'lead'], [18, 1, 74, 'lead'], [19, 1, 72, 'lead'],
        [20, 2, 71, 'lead'], [22, 1.5, 67, 'lead'],
        [24, 1.5, 69, 'lead'], [25.5, 0.5, 67, 'lead'], [26, 1, 65, 'lead'], [27, 1, 64, 'lead'],
        [28, 3.5, 64, 'lead'],
      ]),
  },

  /* --- marchHeavy: marsz ciężki ---
     Melodia w blasze zamiast w leadzie, 96 bpm, rytm marszowy w czystej postaci:
     stopa na 1 i 3, werbel na 2 i 4, żadnych ósemek hi-hatu w pierwszej połowie
     — cisza między uderzeniami jest tu materiałem. 64 bity, bo sekcja B jest
     warunkiem, a nie ozdobą: 32 bity przy 96 bpm to 20 s i pętla zaczyna uwierać. */
  marchHeavy: {
    bpm: 96, loopBeats: 64, drive: 1.6, reverb: 0.22, reverbTime: 1.3, level: MUSIC_POOL_LEVEL,
    notes: [].concat(
      // bas: stopień na 1, przednutka, kwinta na 3, stopień na 4 — chód marszowy
      musicBar(0, 4, MUSIC_HEAVY_ROOTS, [[0, 0.9, 0], [1.5, 0.4, 0], [2, 0.9, 7], [3, 0.9, 0]], 'bass'),
      musicBar(0, 4, MUSIC_HEAVY_ROOTS, [[0, 4, 12], [0, 4, 19]], 'pad'),
      musicHits(musicEvery(0, 64, 2), 0.3, 0, 'kick'),
      musicHits([31.5, 63.5], 0.3, 0, 'kick'),
      musicHits(musicEvery(1, 64, 2), 0.3, 0, 'snareM'),
      // werblowe przejście na końcu każdej połowy — sygnał, że fraza się zamyka
      musicHits([30.5, 30.75, 31.25, 31.5, 31.75, 62.5, 62.75, 63.25, 63.5, 63.75], 0.2, 0, 'snareM'),
      // hi-hat dopiero w sekcji B: puls jest tu jedynym środkiem, którym B
      // odróżnia się od A bez podnoszenia głośności
      musicHits(musicEvery(32.5, 64, 1), 0.2, 0, 'hat'),
      [
        [0, 1.5, 64, 'brass'], [1.5, 0.5, 64, 'brass'], [2, 1, 67, 'brass'], [3, 1, 71, 'brass'],
        [4, 1.5, 72, 'brass'], [5.5, 0.5, 71, 'brass'], [6, 2, 69, 'brass'],
        [8, 1.5, 69, 'brass'], [9.5, 0.5, 69, 'brass'], [10, 1, 72, 'brass'], [11, 1, 71, 'brass'],
        [12, 2, 69, 'brass'], [14, 1.5, 67, 'brass'],
        [16, 1.5, 67, 'brass'], [17.5, 0.5, 69, 'brass'], [18, 2, 71, 'brass'],
        [20, 1.5, 74, 'brass'], [21.5, 0.5, 72, 'brass'], [22, 2, 71, 'brass'],
        [24, 1.5, 69, 'brass'], [25.5, 0.5, 72, 'brass'], [26, 2, 69, 'brass'],
        [28, 1.5, 67, 'brass'], [29.5, 0.5, 65, 'brass'], [30, 2, 64, 'brass'],
        // sekcja B zaczyna się PAUZĄ — bit 32 jest pusty
        [33, 1, 76, 'brass'], [34, 2, 74, 'brass'],
        [36, 1.5, 72, 'brass'], [37.5, 0.5, 71, 'brass'], [38, 2, 69, 'brass'],
        [40, 1, 71, 'brass'], [41, 1, 74, 'brass'], [42, 2, 74, 'brass'],
        [44, 2, 74, 'brass'], [46, 1.5, 71, 'brass'],
        [48, 1.5, 69, 'brass'], [49.5, 0.5, 72, 'brass'], [50, 2, 69, 'brass'],
        [52, 1.5, 72, 'brass'], [53.5, 0.5, 69, 'brass'], [54, 2, 72, 'brass'],
        [56, 2, 74, 'brass'], [58, 2, 69, 'brass'],
        [60, 1, 67, 'brass'], [61, 3, 64, 'brass'],
      ]),
  },

  /* --- marchTight: ten sam temat co `game`, ale marszowy ---
     Wariant istnieje po to, żeby przy znanej melodii słychać było samą zmianę
     aranżacji. Pierwsze podejście zmieniało wyłącznie perkusję i tempo o 4,5%
     i odsłuch orzekł „to ten sam utwór" — z czego płynie wniosek wart zapisania:
     TOŻSAMOŚCI UTWORU NIE NIESIE PERKUSJA, TYLKO OSTINATO BASU I TEMPO. Dlatego
     bas ósemkowy ustąpił chodowi marszowemu, ósemki hi-hatu zniknęły z pierwszej
     połowy, blacha dubluje temat oktawę niżej na całej długości, a tempo spadło
     o 11%. Melodia została nietknięta i to jest cel, nie oszczędność. */
  marchTight: {
    bpm: 118, loopBeats: 64, drive: 2.0, reverb: 0.14, reverbTime: 0.9, level: MUSIC_POOL_LEVEL,
    notes: [].concat(
      musicBar(0, 4, MUSIC_TIGHT_ROOTS, [[0, 0.9, 0], [1.5, 0.4, 0], [2, 0.9, 7], [3, 0.9, 0]], 'bass'),
      musicBar(0, 4, MUSIC_TIGHT_ROOTS, [[0, 4, 12], [0, 4, 19]], 'pad'),
      musicHits(musicEvery(0, 64, 2), 0.3, 0, 'kick'),
      musicHits(musicEvery(3.5, 64, 8), 0.3, 0, 'kick'),
      musicHits(musicEvery(1, 64, 2), 0.3, 0, 'snareM'),
      // podwójne uderzenia werbla przed kreską taktową — to one robią „marsz"
      musicHits(musicEvery(7.5, 64, 8).concat(musicEvery(7.75, 64, 8)), 0.2, 0, 'snareM'),
      musicHits(musicEvery(32.5, 64, 1), 0.15, 0, 'hat'),
      MUSIC_TIGHT_LEAD.map(([b, d, m]) => [b, d, m, 'lead']),
      MUSIC_TIGHT_LEAD.map(([b, d, m]) => [b, d, m - 12, 'brass']),
    ),
  },

  /* --- bright: pogodny ---
     E MIKSOLIDYJSKA (E-F#-G#-A-B-C#-D), nie frygijska. Tonacja utworów posępnych
     jest ustalona wyżej i zostaje, ale jasności nie da się z niej wydobyć:
     półton E-F na początku skali czyta się manicznie, nie wesoło. Ten sam dźwięk
     centralny E trzyma utwór obok pozostałych. Energia siedzi w melodii, nie
     w rytmie: bas na półnutach, nuty długie, perkusja wyznacza puls. */
  bright: {
    bpm: 100, loopBeats: 64, drive: 1.4, reverb: 0.20, reverbTime: 1.4, level: MUSIC_POOL_LEVEL,
    notes: [].concat(
      musicBar(0, 4, MUSIC_BRIGHT_ROOTS, [[0, 2, 0], [2, 2, 7]], 'bass'),
      // trójdźwięk durowy (+16) na każdym stopniu — miksolidyjska trzyma jasność
      musicBar(0, 4, MUSIC_BRIGHT_ROOTS, [[0, 4, 12], [0, 4, 16], [0, 4, 19]], 'pad'),
      musicHits(musicEvery(0, 64, 4), 0.3, 0, 'kick'),
      musicHits(musicEvery(2, 64, 4), 0.3, 0, 'snareM'),
      musicHits(musicEvery(1, 64, 1), 0.15, 0, 'hatQ'),
      [
        [0, 3, 71, 'brassHi'], [3, 1, 73, 'brassHi'],
        [4, 2, 76, 'brassHi'], [6, 2, 73, 'brassHi'],
        [8, 3, 69, 'brassHi'], [11, 1, 71, 'brassHi'],
        [12, 4, 73, 'brassHi'],
        [16, 2, 74, 'brassHi'], [18, 2, 71, 'brassHi'],
        [20, 3, 69, 'brassHi'], [23, 1, 71, 'brassHi'],
        [24, 2, 73, 'brassHi'], [26, 2, 76, 'brassHi'],
        [28, 4, 71, 'brassHi'],
        [32, 2, 76, 'brassHi'], [34, 2, 73, 'brassHi'],
        [36, 3, 71, 'brassHi'], [39, 1, 69, 'brassHi'],
        [40, 2, 71, 'brassHi'], [42, 2, 74, 'brassHi'],
        [44, 4, 76, 'brassHi'],
        [48, 2, 73, 'brassHi'], [50, 2, 71, 'brassHi'],
        [52, 3, 68, 'brassHi'], [55, 1, 69, 'brassHi'],
        [56, 2, 71, 'brassHi'], [58, 2, 73, 'brassHi'],
        [60, 4, 64, 'brassHi'],
      ]),
  },

  /* --- ambient: tło ---
     Zadanie tego utworu brzmi: NIE ZWRACAĆ NA SIEBIE UWAGI. To nie jest to samo
     co „ciszej", więc robią to trzy decyzje kompozycyjne:
     - E DORYCKA (E-F#-G-A-B-C#-D) — molowa, więc nie słodzi przy 300 turach,
       ale sekstą wielką (C#) ucieka od ciemności: tryb neutralny, nie smutny;
     - 76 bpm i akordy co 8 bitów, czyli pętla 50-sekundowa, najdłuższa w puli.
       Im rzadziej coś się powtarza, tym później zaczyna uwierać;
     - melodia z DZIURAMI: osiem fraz, trzynaście nut, reszta to cisza pod padem.
       Melodia grająca bez przerwy jest pierwszym planem niezależnie od tego,
       jak cicho gra. */
  ambient: {
    bpm: 76, loopBeats: 64, drive: 1.2, reverb: 0.28, reverbTime: 2.0, level: MUSIC_POOL_LEVEL,
    notes: [].concat(
      MUSIC_AMBIENT_CHORDS.reduce((out, [at, root, ivs]) => out.concat(
        musicChord(at, 8, root, ivs, 'pad'),
        [[at, 4, root, 'bass'], [at + 4, 3.5, root + 7, 'bass']]), []),
      // puls, nie rytm: stopa raz na dwa takty, hi-hat na ćwierćnutach parzystych
      musicHits(musicEvery(0, 64, 8), 0.3, 0, 'kickQ'),
      musicHits(musicEvery(2, 64, 4), 0.2, 0, 'hatQ'),
      [
        [2, 4, 71, 'leadSoft'], [6, 2, 69, 'leadSoft'],
        [10, 4, 73, 'leadSoft'], [15, 1, 71, 'leadSoft'],
        [18, 4, 74, 'leadSoft'], [23, 1, 71, 'leadSoft'],
        [26, 5, 69, 'leadSoft'],
        [34, 4, 76, 'leadSoft'], [38, 2, 74, 'leadSoft'],
        [42, 4, 73, 'leadSoft'],
        [50, 3, 71, 'leadSoft'], [54, 2, 74, 'leadSoft'],
        [58, 5, 64, 'leadSoft'],
      ]),
  },
};

/* Pula utworów partii. JAWNA LISTA, a nie `Object.keys(MUSIC_TRACKS)` bez 'menu'
   — inaczej każdy przyszły utwór (np. osobny na ekran zwycięstwa) wpadłby do
   losowania sam z siebie. */
const MUSIC_GAME_POOL = ['game', 'marchHeavy', 'marchTight', 'bright', 'ambient'];

/* Instrumenty. Do 0.6.x były trzy fale z jedną obwiednią — czyli zestaw NES-a,
   i to on odpowiadał za „8-bitowe" brzmienie, nie kompozycja. Teraz: synteza FM
   (blachy Neo Geo), subtraktywna z filtrem rezonansowym (bas, pad) i osobno
   syntezowany zestaw perkusyjny. */
const MUSIC_INSTRUMENTS = {
  bass: { type: 'sub', wave: 'sawtooth', voices: 2, detune: 14, cutoff: 260, cutoffEnv: 1150, q: 3.4, a: 0.004, d: 0.11, s: 0.32, r: 0.08, gain: 0.40 },
  lead: { type: 'fm', ratio: 2, index: 2.6, indexDecay: 0.18, a: 0.012, d: 0.18, s: 0.62, r: 0.16, gain: 0.19 },
  pad: { type: 'sub', wave: 'sawtooth', voices: 3, detune: 22, cutoff: 380, cutoffEnv: 420, q: 1.1, a: 0.35, d: 0.6, s: 0.75, r: 0.6, gain: 0.085 },
  kick: { type: 'kick', len: 0.34, gain: 0.95, seed: 41 },
  snare: { type: 'snare', len: 0.24, gain: 0.50, seed: 53 },
  hat: { type: 'hat', len: 0.06, decay: 30, gain: 0.16, seed: 67 },
  /* Blacha: FM o stosunku 1:1 z głęboką, wolno opadającą modulacją — ostre
     wejście i miękkie podtrzymanie, czyli to, po czym poznaje się sekcję dętą,
     a czego filtrem się nie uzyska. Atak 30 ms, bo natychmiastowy czyta się
     jak organy. */
  brass: { type: 'fm', ratio: 1, index: 3.4, indexDecay: 0.42, a: 0.03, d: 0.28, s: 0.68, r: 0.22, gain: 0.17 },
  // wyższy stosunek = więcej harmonicznych, krótsze opadanie modulacji =
  // mniej „dęcia", więcej blasku
  brassHi: { type: 'fm', ratio: 3, index: 1.9, indexDecay: 0.13, a: 0.006, d: 0.14, s: 0.55, r: 0.13, gain: 0.16 },
  /* Głos do utworów spokojnych: FM o niskim wskaźniku modulacji jest blisko
     sinusa, więc niesie melodię, nie tembr — plus długi atak i długie
     wybrzmienie, żeby nuta nie „zaczynała się" słyszalnie. Ostry atak jest tym,
     co robi z tła pierwszy plan. */
  leadSoft: { type: 'fm', ratio: 2, index: 1.0, indexDecay: 0.6, a: 0.08, d: 0.5, s: 0.6, r: 0.5, gain: 0.15 },
  // werbel marszowy: krótszy i twardszy, żeby wybijał krok zamiast go rozmywać
  snareM: { type: 'snare', len: 0.17, gain: 0.52, seed: 53 },
  // perkusja tła: obecna jako puls, nie jako rytm
  kickQ: { type: 'kick', len: 0.34, gain: 0.42, seed: 41 },
  hatQ: { type: 'hat', len: 0.06, decay: 30, gain: 0.07, seed: 67 },
};

/* ==================== synteza muzyki (czysta arytmetyka) ====================

   Muzyka jest renderowana do bufora TAK SAMO jak SFX, a nie grana oscylatorami
   w czasie rzeczywistym. Powód jest architektoniczny, nie brzmieniowy: dopóki
   pętlę grał graf węzłów Web Audio, `tools/gen-sounds.js` musiał mieć DRUGĄ
   implementację syntezy, żeby dało się jej posłuchać poza grą — a dwie
   implementacje rozjeżdżają się po cichu. Jako czysta funkcja `(rate) =>
   Float32Array` muzyka ma jedną implementację, tę samą w grze i w narzędziu,
   i przestaje jej ciążyć sufit tego, co da się policzyć na żywo. */

// Kształty fal jako szereg Fouriera obcięty do Nyquista — tak samo definiuje je
// specyfikacja Web Audio, i tak samo unika się aliasowania: naiwny skok prostokąta
// ma nieskończone pasmo i zawija się na każdej częstotliwości.
function musicHarmonic(wave, n) {
  switch (wave) {
    case 'sine': return n === 1 ? 1 : 0;
    case 'square': return (2 / (n * Math.PI)) * (1 - Math.cos(n * Math.PI));
    case 'sawtooth': return (n % 2 ? 1 : -1) * (2 / (n * Math.PI));
    case 'triangle': return 8 * Math.sin(n * Math.PI / 2) / (Math.PI * Math.PI * n * n);
    default: return n === 1 ? 1 : 0;
  }
}

const MUSIC_TABLE_SIZE = 4096;
const MUSIC_BAND_BASE = 20;   // Hz — dolna granica najniższego pasma
const musicTables = {};       // cache na poziomie modułu: pętle i sesje go współdzielą

/* Tablice są budowane na PASMO OKTAWOWE, nie na pojedynczą wysokość.

   Powód jest wydajnościowy i on decyduje, czy da się w ogóle grać bogatą
   aranżacją. Tablica dla jednej wysokości kosztuje tyle sinusów, ile ma
   harmonicznych (bas przy 48 kHz: ~330 × 4096), a przy tablicy na nutę koszt
   rośnie z liczbą RÓŻNYCH wysokości w utworze — zmierzone: 604 ms na 16 tablic,
   i im gęstszy utwór, tym gorzej. Przy podziale na pasma tablic jest kilkanaście
   niezależnie od tego, ile nut gra, więc koszt przestaje rosnąć.

   Każde pasmo obcinamy do swojej NAJWYŻSZEJ częstotliwości, więc żadna nuta
   z pasma nie zaaliasuje. Nuty z dolnego skraju tracą trochę najwyższych
   harmonicznych — czyli tych najsłabszych, o amplitudzie rzędu 1/n. */
function musicWavetable(wave, freq, rate) {
  const band = Math.max(0, Math.floor(Math.log2(Math.max(freq, MUSIC_BAND_BASE) / MUSIC_BAND_BASE)));
  const key = wave + '|' + band + '|' + rate;
  if (musicTables[key]) return musicTables[key];
  const top = MUSIC_BAND_BASE * Math.pow(2, band + 1);
  const maxN = Math.max(1, Math.floor((rate / 2) / top));
  const tab = new Float32Array(MUSIC_TABLE_SIZE);
  for (let n = 1; n <= maxN; n++) {
    const amp = musicHarmonic(wave, n);
    if (amp === 0) continue;
    /* Rekurencja obrotu zamiast Math.sin na próbkę: kolejne wartości sinusa
       o stałym kroku kątowym powstają z poprzednich dwoma mnożeniami. Dryf
       w podwójnej precyzji po 4096 krokach jest rzędu 1e-12, czyli daleko
       poniżej rozdzielczości Float32Array, w której tablica i tak ląduje. */
    const a = 2 * Math.PI * n / MUSIC_TABLE_SIZE;
    const ca = Math.cos(a), sa = Math.sin(a);
    let s = 0, c = 1;
    for (let i = 0; i < MUSIC_TABLE_SIZE; i++) {
      tab[i] += amp * s;
      const ns = s * ca + c * sa;
      c = c * ca - s * sa;
      s = ns;
    }
  }
  musicTables[key] = tab;
  return tab;
}

/* Obwiednia ADSR. Stary silnik miał tylko narastanie i wygaszanie, przez co każda
   nuta miała ten sam kształt — a kształt obwiedni jest tym, co odróżnia szarpnięcie
   basu od wejścia blachy. `s` to poziom podtrzymania (0-1), reszta w sekundach. */
function musicFillAdsr(env, n, rate, def, durN) {
  const atkN = Math.max(1, Math.floor((def.a || 0.005) * rate));
  const decN = Math.max(1, Math.floor((def.d || 0.1) * rate));
  const sus = def.s === undefined ? 0.7 : def.s;
  // zanik rekurencyjnie, żeby nie wołać Math.exp na każdą próbkę
  const relStep = Math.exp(-4 / Math.max(1, (def.r || 0.1) * rate));
  let rel = sus;
  for (let i = 0; i < n; i++) {
    if (i < atkN) env[i] = i / atkN;
    else if (i < atkN + decN) env[i] = 1 - (1 - sus) * (i - atkN) / decN;
    else if (i < durN) env[i] = sus;
    else { env[i] = rel; rel *= relStep; }
  }
}

// tablica sinusa dla FM — modulacja fazy nie da się wyrazić stałą tablicą fali,
// więc bez niej wychodzą dwa Math.sin na próbkę i to dominuje koszt renderu
const MUSIC_SIN = (function () {
  const t = new Float32Array(MUSIC_TABLE_SIZE + 1);
  for (let i = 0; i <= MUSIC_TABLE_SIZE; i++) t[i] = Math.sin(2 * Math.PI * i / MUSIC_TABLE_SIZE);
  return t;
})();
function musicSinAt(phase) {
  let p = phase % MUSIC_TABLE_SIZE;
  if (p < 0) p += MUSIC_TABLE_SIZE;
  const k = p | 0;
  return MUSIC_SIN[k] + (MUSIC_SIN[k + 1] - MUSIC_SIN[k]) * (p - k);
}

/* --- głosy ---
   Każdy typ syntezuje nutę do bufora roboczego; umieszczaniem w pętli (i zawijaniem
   ogona) zajmuje się osobno renderMusicLoop. Rozdzielenie jest celowe: dzięki niemu
   głos może mieć własny filtr i własną obwiednię, nie wiedząc nic o pętli. */

// Synteza FM (dwa operatory). To jest brzmienie Neo Geo: modulator o częstotliwości
// będącej wielokrotnością nośnej, z GŁĘBOKOŚCIĄ opadającą w czasie — stąd blachy,
// które mają ostre wejście i miękkie podtrzymanie, czego filtrem się nie uzyska.
function musicVoiceFm(buf, n, rate, def, freq, env) {
  const ratio = def.ratio === undefined ? 2 : def.ratio;
  const idx0 = def.index === undefined ? 3 : def.index;
  const idxStep = Math.exp(-1 / Math.max(1, (def.indexDecay || 0.3) * rate));
  const incC = freq / rate * MUSIC_TABLE_SIZE, incM = incC * ratio;
  const depth = MUSIC_TABLE_SIZE / (2 * Math.PI);   // radiany -> jednostki tablicy
  let pc = 0, pm = 0, index = idx0;
  for (let i = 0; i < n; i++) {
    buf[i] = musicSinAt(pc + index * depth * musicSinAt(pm)) * env[i];
    index *= idxStep;
    pc += incC; if (pc >= MUSIC_TABLE_SIZE) pc -= MUSIC_TABLE_SIZE;
    pm += incM; if (pm >= MUSIC_TABLE_SIZE) pm -= MUSIC_TABLE_SIZE;
  }
}

// Synteza subtraktywna: kilka rozstrojonych pił przez filtr rezonansowy z obwiednią.
// Rozstrojenie jest tu istotne — pojedyncza piła brzmi cienko i „cyfrowo",
// a dudnienie między kopiami daje grubość, po której poznaje się bas z lat 90.
function musicVoiceSub(buf, n, rate, def, freq, env) {
  const wave = def.wave || 'sawtooth';
  const nv = def.voices || 2;
  const detune = (def.detune || 8) / 1200;   // centy -> ułamek półtonu
  const MASK = MUSIC_TABLE_SIZE - 1;
  const tabs = [], incs = [], phs = [];
  for (let v = 0; v < nv; v++) {
    const f = freq * Math.pow(2, (v - (nv - 1) / 2) * detune);
    tabs.push(musicWavetable(wave, f, rate));
    incs.push((f / rate) * MUSIC_TABLE_SIZE);
    phs.push(v * 137.5);   // różne fazy startowe, żeby kopie nie sumowały się w szczyt
  }
  const norm = 1 / nv;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let v = 0; v < nv; v++) {
      let ph = phs[v];
      const p = ph | 0, f = ph - p;
      s += tabs[v][p] + (tabs[v][(p + 1) & MASK] - tabs[v][p]) * f;
      ph += incs[v];
      phs[v] = ph >= MUSIC_TABLE_SIZE ? ph - MUSIC_TABLE_SIZE : ph;
    }
    buf[i] = s * norm * env[i];
  }
  /* Filtr z obwiednią: otwiera się na ataku i zamyka — to jest „ruch" w dźwięku,
     którego stary silnik nie miał w ogóle. Współczynniki przeliczamy co 32 próbki,
     bo `Math.tan` na próbkę było najdroższą operacją w całym renderze, a obwiednia
     zmienia się o rzędy wielkości wolniej niż co 0,7 ms. */
  const base = def.cutoff || 500, span = def.cutoffEnv || 800;
  const k = 1 / Math.max(0.5, def.q || 2);
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) {
      const fc = Math.min(rate * 0.45, Math.max(30, base + span * env[i]));
      const g = Math.tan(Math.PI * fc / rate);
      a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    const x = buf[i];
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    buf[i] = v2;
  }
}

/* Zestaw perkusyjny. Stary silnik miał JEDEN dźwięk perkusyjny (ten sam szum na
   każdym uderzeniu) — czyli metronom, nie rytm. Stopa, werbel i hi-hat różnią się
   nie głośnością, tylko budową, i dopiero to daje wrażenie grania. */
function musicVoiceDrum(buf, n, rate, def, kind) {
  const rng = audioRng(def.seed || 41);
  if (kind === 'kick') {
    // wysokość opada geometrycznie ze 150 do 45 Hz — uderzenie w membranę
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      ph += (150 * Math.pow(45 / 150, Math.min(1, u * 3))) / rate;
      buf[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-7 * u) + rng() * 0.25 * Math.exp(-90 * u);
    }
  } else if (kind === 'snare') {
    // szum (naciąg + sprężyna) plus dwa tony korpusu — bez nich zostaje sam syk
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const t = i / rate;
      buf[i] = rng() * Math.exp(-16 * u) * 0.8
        + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-26 * u) * 0.35
        + Math.sin(2 * Math.PI * 330 * t) * Math.exp(-30 * u) * 0.2;
    }
    svfSweep(buf, rate, 'bp', 0, n / rate, 2400, 1400, 0.8);
  } else {  // hat
    for (let i = 0; i < n; i++) buf[i] = rng() * Math.exp(-def.decay * (i / n));
    svfSweep(buf, rate, 'hp', 0, n / rate, 6500, 7500, 0.7);
  }
}

// Rozkład partytury na głosy. Nuta z `b >= loopBeats` nie zabrzmi — pętla jej
// nie obejmuje; renderer ją pomija tak samo, jak pomijał ją stary scheduler.
function musicVoices(track) {
  const beatSec = 60 / track.bpm;
  const out = [];
  for (const [b, dur, midi, inst] of track.notes) {
    if (b >= track.loopBeats) continue;
    out.push({ at: b * beatSec, dur: dur * beatSec, midi, inst });
  }
  return out;
}

/* Uwaga o długości: bufor musi mieć całkowitą liczbę próbek, a 32 bity przy 104 bpm
   to 814 153,8 próbki przy 44,1 kHz. Zaokrąglenie znaczy, że pętla gra o 0,0002%
   wolniej niż nominalne bpm — niesłyszalne, ale trzeba o tym pamiętać przy
   porównywaniu z jakimkolwiek modelem liczącym pozycje z czasu, bo tam ułamek
   próbki narasta z każdym obiegiem. */
/* Efekt ze stanem (pogłos) na buforze PĘTLI wymaga ostrożności: puszczony wprost
   zaczyna od ciszy i urywa się na końcu, więc na szwie słychać skok. Rozwiązanie:
   przepuścić sygnał dwa razy pod rząd i wziąć drugi przebieg — wtedy linie
   opóźniające są już wypełnione ogonem z poprzedniego obiegu, czyli mamy dokładnie
   ten stan, w którym pętla gra w kółko. */
function musicLoopReverb(buf, rate, mix, rt60) {
  const n = buf.length;
  const twice = new Float32Array(n * 2);
  twice.set(buf, 0);
  twice.set(buf, n);
  reverbTail(twice, rate, mix, rt60);
  buf.set(twice.subarray(n, n * 2));
}

function renderMusicLoop(name, rate, tracks, instruments) {
  const src = (tracks || MUSIC_TRACKS)[name];
  if (!src) return null;
  const inst = instruments || MUSIC_INSTRUMENTS;
  const beatSec = 60 / src.bpm;
  const out = new Float32Array(Math.round(src.loopBeats * beatSec * rate));
  const scratch = new Float32Array(Math.ceil(rate * 8));
  const env = new Float32Array(scratch.length);
  for (const v of musicVoices(src)) {
    const def = inst[v.inst];
    if (!def) continue;
    const isDrum = def.type === 'kick' || def.type === 'snare' || def.type === 'hat';
    const durN = Math.max(1, Math.floor(v.dur * rate));
    const n = Math.min(scratch.length, isDrum
      ? Math.floor((def.len || 0.2) * rate)
      : durN + Math.ceil((def.r || 0.1) * rate) * 2);
    scratch.fill(0, 0, n);
    if (isDrum) {
      musicVoiceDrum(scratch, n, rate, def, def.type);
    } else {
      // obwiednia liczona RAZ i współdzielona przez oscylator i filtr — była
      // liczona dwa razy, po dwa Math.exp na próbkę
      musicFillAdsr(env, n, rate, def, durN);
      if (def.type === 'fm') musicVoiceFm(scratch, n, rate, def, midiFreq(v.midi), env);
      else musicVoiceSub(scratch, n, rate, def, midiFreq(v.midi), env);
    }

    const g = def.gain === undefined ? 0.2 : def.gain;
    let idx = Math.round(v.at * rate) % out.length;
    if (idx < 0) idx += out.length;
    for (let i = 0; i < n; i++) {
      out[idx] += scratch[i] * g;
      if (++idx === out.length) idx = 0;
    }
  }
  // szyna: nasycenie skleja warstwy, pogłos daje wspólną przestrzeń
  if (src.drive) saturate(out, src.drive);
  if (src.reverb) musicLoopReverb(out, rate, src.reverb, src.reverbTime || 0.8);
  musicNormalize(out, src.level === undefined ? 0.20 : src.level);
  return out;
}

/* Poziom pętli: dopasowanie RMS z twardym sufitem szczytu — ta sama filozofia,
   co `finishBuffer()` dla SFX, ale BEZ wygaszania ogona, bo tu ogon jest szwem
   pętli i wyciszenie go zrobiłoby dziurę przy każdym obiegu. */
function musicNormalize(buf, level) {
  let sumSq = 0, max = 0;
  for (let i = 0; i < buf.length; i++) {
    sumSq += buf[i] * buf[i];
    const a = Math.abs(buf[i]);
    if (a > max) max = a;
  }
  const rms = Math.sqrt(sumSq / buf.length);
  let g = rms > 0 ? level / rms : 1;
  if (max * g > 0.95) g = 0.95 / max;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
}

/* --------------------------- warstwa runtime --------------------------- */

let AUD = null;              // { ctx, master, musicGain, sfxGain, buffers, voices }
let audioSettings = { master: 0.7, music: 0.45, sfx: 0.85, muted: false };
// „co ma grać" (żądanie gry) trzymane osobno od „co gra" (musicNode) — inaczej
// wyciszenie gubiłoby informację, do czego wrócić po odciszeniu
let musicWanted = null;
let musicNode = null;       // aktualnie grający AudioBufferSourceNode (pętla)
let musicBuffers = {};      // wyrenderowane pętle, liczone raz na sesję
let musicPending = false;   // render odłożony na później już zlecony
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

/* Utwór partii losowany Z ZIARNA MAPY, a nie z `Math.random()`. Powód jest
   praktyczny: dzięki temu wybór jest funkcją stanu, który już istnieje i już
   przechodzi przez zapis (`mapSeed` jest w kodeku w `save.js`), więc wczytana
   partia wraca z tą samą muzyką i NIE trzeba niczego dokładać do `SAVE_FORMAT`.
   Losowanie w locie wymagałoby zapamiętania wyniku, czyli nowego pola stanu
   i bumpa formatu — za coś, co da się wyprowadzić.

   `audioRng`, a nie `makeRng` z utils.js: `tools/gen-sounds.js` ładuje do
   sandboxa sam `audio.js`, więc sięgnięcie po utils zerwałoby własność, dla
   której narzędzie i gra liczą z jednego pliku. */
function musicTrackForGame() {
  if (!state || state.mapSeed == null) return 'game';
  const rng = audioRng(state.mapSeed + 1);
  /* Dwie rzeczy, na których łatwo się tu przejechać: `audioRng` zwraca [-1, 1),
     bo powstał do szumu (indeks wyszedłby ujemny, a `%` w JS tego nie naprawia),
     a pierwsze wyjście generatora liniowego jest niemal liniowe w ziarnie —
     przy ziarnach po kolei (1, 2, 3…) dawałoby utwory po kolei. */
  rng(); rng();
  const u = (rng() + 1) / 2;
  return MUSIC_GAME_POOL[Math.min(MUSIC_GAME_POOL.length - 1, Math.floor(u * MUSIC_GAME_POOL.length))];
}

// pętla dobrana do ekranu; wołane z applyScreen(), więc reaguje też na powrót do menu
function updateMusicForScreen() {
  if (!state) return;
  setMusicTrack(state.screen === 'game' ? musicTrackForGame() : 'menu');
}

// Throttling jest wymogiem, nie polerką: tempo AI 4x/16x dzieli thinkDelay,
// a tryb obserwatora to sama gra botów — bez ograniczenia dźwięki zamieniają
// się w karabin maszynowy.
function sfxAllowed(name) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const gap = SFX_MIN_GAP[name] || 60;
  if (sfxLastAt[name] && now - sfxLastAt[name] < gap) return false;
  // Limit głosów nie dotyczy zdarzeń z SFX_ALWAYS: to są rzadkie, jednorazowe
  // komunikaty (zdobycie miasta, aneksja, koniec gry), a nazwa mówi, że mają
  // dojść zawsze. Wcześniej ciężka bitwa mogła wypełnić pulę wybuchami i zjeść
  // dźwięk zdobycia stolicy — czyli akurat ten, który niesie informację.
  if (AUD && AUD.voices >= 8 && !SFX_ALWAYS[name]) return false;
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

/* Pętla jest jednym buforem odtwarzanym z `loop = true`, a nie strumieniem nut
   dokładanych na oś czasu. Bufor renderuje `renderMusicLoop()` — ta sama czysta
   funkcja, której używa `tools/gen-sounds.js`, więc to, co słychać w grze, i to,
   co wychodzi jako WAV, jest z definicji tym samym sygnałem.

   Renderujemy w częstotliwości kontekstu, żeby przeglądarka nie przepróbkowywała
   bufora przy każdym odtworzeniu. */
function musicBufferFor(a, name) {
  if (musicBuffers[name]) return musicBuffers[name];
  const samples = renderMusicLoop(name, a.ctx.sampleRate);
  if (!samples) return null;
  const buf = a.ctx.createBuffer(1, samples.length, a.ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  musicBuffers[name] = buf;
  return buf;
}

function musicPlaybackStart() {
  const a = ensureAudio();
  if (!a || musicNode || !musicWanted) return;
  /* Pierwszy render pętli to kilkaset ms na jednym wątku, a wołane jest to przy
     pierwszym geście użytkownika — razem z syntezą SFX zamroziłoby reakcję na
     kliknięcie. Odkładamy go więc za bieżące zadanie: klik zdąży się obsłużyć
     i narysować, muzyka wchodzi ułamek sekundy później. */
  if (!musicBuffers[musicWanted]) {
    if (musicPending) return;
    musicPending = true;
    const wanted = musicWanted;
    setTimeout(() => {
      musicPending = false;
      // pętla mogła się zmienić, zanim render ruszył (szybka zmiana ekranu):
      // wtedy nie ma po co liczyć tamtej, a syncMusic i tak zleci render bieżącej
      if (musicWanted === wanted) musicBufferFor(a, wanted);
      syncMusic();
    }, 0);
    return;
  }
  const buf = musicBufferFor(a, musicWanted);
  if (!buf) return;
  const node = a.ctx.createBufferSource();
  node.buffer = buf;
  node.loop = true;
  node.connect(a.musicGain);
  try { node.start(); } catch (e) { return; }
  musicNode = node;
}

function musicPlaybackStop() {
  if (!musicNode) return;
  try { musicNode.stop(); } catch (e) { /* już zatrzymany */ }
  musicNode.disconnect();
  musicNode = null;
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
