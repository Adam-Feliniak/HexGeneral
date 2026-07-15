'use strict';
/* ============================================================
   NARZĘDZIA — losowość i kolory
   ============================================================ */

function rnd(a, b, rand = Math.random) { return a + rand() * (b - a); }
function irnd(n, rand = Math.random) { return Math.floor(rand() * n); }
function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = irnd(i + 1, rand);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// generator liczb pseudolosowych na bazie ziarna (mulberry32) — używany przez
// generateMap(), żeby ta sama liczba (seed) zawsze dawała tę samą mapę
function makeRng(seed) {
  let s = seed >>> 0;
  return function rand() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseColor(str) {
  // obsługuje '#rrggbb' oraz 'rgb(r,g,b)' — mixColor bywa wołany na własnym wyniku
  if (str[0] === '#') {
    return [parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16)];
  }
  return str.match(/\d+/g).slice(0, 3).map(Number);
}

function mixColor(c1, c2, k) {
  const a = parseColor(c1), b = parseColor(c2);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}
