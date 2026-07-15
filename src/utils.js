'use strict';
/* ============================================================
   NARZĘDZIA — losowość i kolory
   ============================================================ */

function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(n) { return Math.floor(Math.random() * n); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = irnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
