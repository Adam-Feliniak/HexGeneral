'use strict';
/* ============================================================
   KONFIGURACJA — stałe rozgrywki, gracze, nazwy miast
   ============================================================ */

const MAP_W = 23;
const MAP_H = 14;
const HEX = 28;                       // promień heksa (px)
const HEX_W = Math.sqrt(3) * HEX;     // szerokość heksa (pointy-top)
const MOVES_PER_TURN = 5;
const MAX_ARMY = 99;
const CITY_COUNT = 16;
const RESOURCE_COUNT = 6;             // złoża surowców na mapie

// limit czasu na turę w grze wieloosobowej (hot-seat); Infinity = bez limitu
const TURN_TIME_LIMIT_DEFAULT = 120;
const TURN_TIME_LIMIT_OPTIONS = [60, 120, Infinity];
const MP_PLAYER_COUNTS = [2, 3, 4, 5, 6];

const PLAYERS_DEF = [
  { name: 'Karmazynia', color: '#d64550', dark: '#8c2530', isHuman: true },
  { name: 'Lazuria',    color: '#3f7fd6', dark: '#24518f', isHuman: false },
  { name: 'Werdania',   color: '#3fae62', dark: '#22703c', isHuman: false },
  { name: 'Aurelia',    color: '#d6a53f', dark: '#8f6a1f', isHuman: false },
  { name: 'Ametria',    color: '#8a4fd6', dark: '#5a2f8f', isHuman: false },
  { name: 'Turkusja',   color: '#3fc9c2', dark: '#1f7f7a', isHuman: false },
];

const CITY_NAMES = [
  'Ostrów', 'Bielsk', 'Toruniec', 'Grodziec', 'Sokole', 'Rawka', 'Jarowo',
  'Miłogród', 'Węgrów', 'Charne', 'Dobrzyń', 'Lipnica', 'Orłowo', 'Strumień',
  'Zawada', 'Turza', 'Chełmno', 'Radogoszcz', 'Karczew', 'Młyniec', 'Piaski',
  'Kruszwin', 'Sielec', 'Bystrza', 'Łęgowo', 'Drwęck', 'Postoliny', 'Wierzno',
];

// pozycje stolic (narożniki mapy, potem środki krawędzi górnej/dolnej) —
// kolejność dobrana tak, by kolejne podzbiory (2..6 graczy) były dobrze rozstawione
const CAPITAL_SPOTS = [
  [2, 2], [MAP_W - 3, MAP_H - 3], [MAP_W - 3, 2], [2, MAP_H - 3],
  [Math.floor(MAP_W / 2), 2], [Math.floor(MAP_W / 2), MAP_H - 3],
];
