'use strict';
/* Test ścieżki ODTWARZANIA (nie syntezy) na atrapie Web Audio. Żadne z narzędzi
   jej nie dotyka — sprawdzają renderMusicLoop w vm, a to jest warstwa nad nim.
   Scenariusze biorą się wprost z tego, co gra faktycznie robi: zmiana ekranu,
   szybka zmiana tam i z powrotem, koniec gry i nowa partia. */
const fs = require('fs'), vm = require('vm');
const path = require('path');
const R = path.resolve(__dirname, '..');

let rendered = [];      // które pętle zostały policzone
let started = [];       // które bufory faktycznie ruszyły
const timers = [];

function makeCtx() {
  const nodes = [];
  const gain = () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} });
  const ctx = {
    sampleRate: 48000, currentTime: 0, state: 'running', destination: {},
    createGain: gain,
    createBuffer: (ch, len, rate) => { const d = new Float32Array(len); return { length: len, sampleRate: rate, getChannelData: () => d, __tag: null }; },
    createBufferSource: () => {
      const n = { buffer: null, loop: false, playbackRate: { value: 1 }, connect() {}, disconnect() {},
        start() { if (n.__started) throw new Error('start() dwa razy na jednym wezle'); n.__started = true; started.push(n.buffer && n.buffer.__tag); },
        stop() { n.__stopped = true; }, onended: null };
      nodes.push(n); return n;
    },
    resume() {},
  };
  return ctx;
}

const sandbox = {
  console, Math, Float32Array, JSON, Date, isNaN, Number,
  document: { addEventListener() {}, removeEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} },
  performance: { now: () => Date.now() },
  setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
  clearInterval() {}, setInterval() { return 0; },
  state: { screen: 'menu' },
};
sandbox.AudioContext = function () { return makeCtx(); };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(R, 'src', 'audio.js'), 'utf8'), sandbox, { filename: 'audio.js' });

// instrumentujemy renderMusicLoop, żeby widzieć, co i ile razy się liczy
vm.runInContext(`
  var __orig = renderMusicLoop;
  renderMusicLoop = function (name, rate, t, i) {
    __note(name);
    var b = __orig(name, rate, t, i);
    return b;
  };
`, sandbox);
sandbox.__note = n => rendered.push(n);
// bufory dostają etykietę, żeby dało się poznać, która pętla ruszyła
vm.runInContext(`
  var __origBuf = musicBufferFor;
  musicBufferFor = function (a, name) { var b = __origBuf(a, name); if (b) b.__tag = name; return b; };
`, sandbox);

const flush = () => { while (timers.length) timers.shift()(); };
const setTrack = n => vm.runInContext('setMusicTrack(' + JSON.stringify(n) + ')', sandbox);
const stop = () => vm.runInContext('stopMusic()', sandbox);
const nodeName = () => vm.runInContext('musicNode && musicNode.buffer ? musicNode.buffer.__tag : null', sandbox);

let fail = 0;
const check = (name, cond, detail) => {
  console.log('  ' + (cond ? 'ok  ' : 'BŁĄD') + '  ' + name.padEnd(46) + '  ' + detail);
  if (!cond) fail++;
};

// 1. zwykłe wejście do menu: render odłożony, po nim pętla gra
rendered = []; started = [];
setTrack('menu');
check('render odłożony poza obsługę gestu', started.length === 0 && rendered.length === 0,
  'zaraz po setMusicTrack nic jeszcze nie policzono');
flush();
check('po odłożonym zadaniu menu gra', nodeName() === 'menu', 'gra: ' + nodeName());

// 2. zmiana na grę
rendered = []; started = [];
setTrack('game'); flush();
check('zmiana pętli menu -> game', nodeName() === 'game', 'gra: ' + nodeName());

// 3. powrót do menu — bufor jest już policzony, więc bez ponownego renderu
rendered = []; started = [];
setTrack('menu'); flush();
check('powrót do menu nie liczy pętli drugi raz', rendered.length === 0 && nodeName() === 'menu',
  'renderów: ' + rendered.length + ', gra: ' + nodeName());

// 4. WYŚCIG: zmiana pętli w trakcie odłożonego renderu
vm.runInContext('musicBuffers = {}; musicPending = false;', sandbox);
stop(); flush();
rendered = []; started = [];
setTrack('menu');          // zleca render menu (odłożony)
setTrack('game');          // zmiana, zanim render ruszył
flush(); flush();          // domykamy łańcuch odłożonych zadań
check('wyścig: po szybkiej zmianie ekranu gra WŁAŚCIWA pętla', nodeName() === 'game', 'gra: ' + nodeName());
check('wyścig: nie policzono porzuconej pętli', !rendered.includes('menu'),
  'policzone: [' + rendered.join(', ') + ']');

// 5. koniec gry -> nowa partia (stopMusic zeruje węzeł, bufory zostają)
rendered = []; started = [];
stop();
check('stopMusic zatrzymuje odtwarzanie', nodeName() === null, 'węzeł: ' + nodeName());
setTrack('game'); flush();
check('nowa partia startuje z zapisanego bufora', nodeName() === 'game' && rendered.length === 0,
  'renderów: ' + rendered.length + ', gra: ' + nodeName());

// 6. wielokrotne setMusicTrack tej samej pętli nie tworzy drugiego węzła
rendered = []; started = [];
setTrack('game'); setTrack('game'); flush();
check('powtórzone żądanie nie dubluje węzła', started.length === 0, 'nowych startów: ' + started.length);

console.log('');
console.log(fail
  ? 'BLEDY: ' + fail + ' — sciezka odtwarzania muzyki jest zepsuta.'
  : 'OK: ' + 9 + ' sprawdzen — sciezka odtwarzania muzyki dziala.');
process.exit(fail ? 1 : 0);
