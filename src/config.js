'use strict';
/* ============================================================
   KONFIGURACJA — stałe rozgrywki, gracze, nazwy miast
   ============================================================ */

const GAME_VERSION = '0.1.0';

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
const BOT_COUNT_OPTIONS = [0, 1, 2, 3];
const SP_BOT_COUNT_OPTIONS = [1, 2, 3, 4, 5];

// seed mapy — max 6 cyfr (pole "Własny" w lobby)
const SEED_MAX_DIGITS = 6;
const SEED_MAX_VALUE = 999999;

// poziomy trudności AI — economy: mnożnik produkcji, aggression: waga ruchów
// bojowych w ocenie AI, aggressionThreshold: mnożnik progów przewagi siły
// wymaganych do ataku (niższy = atakuje przy gorszym stosunku sił),
// thinkDelay: opóźnienie (ms) między kolejnymi ruchami bota
// (Nightmare economy 1.725 = 1.5 bazowe * 1.15 dodatkowego handicapu ekonomicznego,
// żeby był wyraźnie najtrudniejszy)
const AI_DIFFICULTY_PRESETS = {
  easy:      { key: 'easy',      label: 'Easy',      economy: 0.5,   aggression: 0.7, aggressionThreshold: 1.3,  thinkDelay: 260 },
  normal:    { key: 'normal',    label: 'Normal',    economy: 1.0,   aggression: 1.0, aggressionThreshold: 1.0,  thinkDelay: 160 },
  hard:      { key: 'hard',      label: 'Hard',      economy: 1.25,  aggression: 1.35, aggressionThreshold: 0.85, thinkDelay: 110 },
  nightmare: { key: 'nightmare', label: 'Nightmare', economy: 1.725, aggression: 1.7, aggressionThreshold: 0.7,  thinkDelay: 70 },
};
const AI_DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

// typy jednostek lądowych — atk/def: mnożniki armyPowerAt (siły w ataku/obronie),
// moveBase/roadBonus: zasięg ruchu (moveCap) poza/na aktywnej drodze,
// supportWeight: waga wkładu tej armii we wsparcie sąsiadów w bitwie (supportFor)
const UNIT_TYPES = {
  infantry:  { key: 'infantry',  atk: 1.00, def: 1.00, moveBase: 1, roadBonus: 1, supportWeight: 1.00 },
  tank:      { key: 'tank',      atk: 1.25, def: 0.85, moveBase: 1, roadBonus: 2, supportWeight: 0.80 },
  artillery: { key: 'artillery', atk: 0.75, def: 1.20, moveBase: 1, roadBonus: 0, supportWeight: 1.80 },
};
const UNIT_TYPE_ORDER = ['infantry', 'tank', 'artillery']; // kolejność w panelu budowy
const DEFAULT_UNIT_TYPE = 'infantry';

// diff: klucz presetu ('easy'..'nightmare') albo liczba 0-100 (suwak custom,
// interpolowany między Easy i Nightmare)
function resolveDifficulty(diff) {
  if (diff == null) return AI_DIFFICULTY_PRESETS.normal;
  if (typeof diff === 'string') return AI_DIFFICULTY_PRESETS[diff] || AI_DIFFICULTY_PRESETS.normal;
  const t = Math.max(0, Math.min(100, diff)) / 100;
  const a = AI_DIFFICULTY_PRESETS.easy, b = AI_DIFFICULTY_PRESETS.nightmare;
  const lerp = k => a[k] + (b[k] - a[k]) * t;
  return {
    key: 'custom', label: `Custom ${Math.round(diff)}%`,
    economy: lerp('economy'), aggression: lerp('aggression'),
    aggressionThreshold: lerp('aggressionThreshold'), thinkDelay: Math.round(lerp('thinkDelay')),
  };
}

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
