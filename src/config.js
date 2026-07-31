'use strict';
/* ============================================================
   KONFIGURACJA — stałe rozgrywki, gracze, nazwy miast
   ============================================================ */

const GAME_VERSION = '0.7.1';
// Nota o prawach autorskich w stopce menu (obok wersji); pełne warunki w pliku LICENSE
const GAME_COPYRIGHT = '© 2026 Adam Feliniak';

// Znacznik buildu testerskiego — podstawiany przez `node tools/pack-build.js --tag=...`
// wyłącznie w KOPII w dist/, nigdy w tym pliku. Pusty = build deweloperski (nic nie pokazuje).
// Trafia też do koperty zapisu, więc z nadesłanego zapisu widać, z czyjego builda pochodzi.
// Świadomie próg, nie zamek: w czystym JS każdy to usunie — chroni przed przypadkowym
// podaniem dalej, nie przed determinacją (dlatego sens jest w poinformowaniu testerów).
const BUILD_TAG = '';

const MAP_W = 23;
const MAP_H = 14;
const HEX = 28;                       // promień heksa (px)
const HEX_W = Math.sqrt(3) * HEX;     // szerokość heksa (pointy-top)
// Ile jednostek gracz może rozkazać w jednej turze. Aktywacja liczy się RAZ na
// jednostkę: kolejne ruchy tej samej armii w tej turze są darmowe, dopóki ma
// punkty ruchu.
const ACTIVATIONS_PER_TURN = 5;

// Koszt wejścia na pole w punktach ruchu. Własna droga jest tania — dzięki temu
// droga premiuje PODRÓŻOWANIE po niej, a nie samo stanie na niej (tak działał
// dawny roadBonus, dodając zasięg w każdym kierunku, także w czyste pole).
const MOVE_COST_ROAD = 1;
const MOVE_COST_DEFAULT = 2;

// Pula na morzu jest wspólna dla wszystkich typów lądowych: po zaokrętowaniu typ
// przestaje mieć znaczenie (render.js dobiera klasę okrętu po sile armii, nie po
// typie). 6 punktów przy koszcie 2 za pole = 3 pola żeglugi.
const SEA_MOVE_POINTS = 6;

const MAX_ARMY = 99;
const CITY_COUNT = 16;
const RESOURCE_COUNT = 6;             // złoża surowców na mapie

// limit czasu na turę w grze wieloosobowej (hot-seat); Infinity = bez limitu
const TURN_TIME_LIMIT_DEFAULT = 120;
const TURN_TIME_LIMIT_OPTIONS = [60, 120, Infinity];
// lobby wieloosobowe nie liczy już graczy i botów osobno — skład ustawia tabela slotów
// (obsada + drużyna na slot, patrz renderMpSetup w menu.js)
const SP_BOT_COUNT_OPTIONS = [1, 2, 3, 4, 5];

// seed mapy — max 6 cyfr (pole "Własny" w lobby)
const SEED_MAX_DIGITS = 6;
const SEED_MAX_VALUE = 999999;

// koszt budowy drogi = ROAD_BASE_COST + ROAD_COST_PER_TILE * długość trasy (w punktach
// produkcji miasta) — wartości startowe, do dostrojenia w testach balansu
const ROAD_BASE_COST = 0;
const ROAD_COST_PER_TILE = 3;
// szansa na turę, że AI (miasto z dala od frontu, bez aktywnego projektu) zamiast
// jednostki zacznie budować drogę do nieujętego drogą własnego złoża
const AI_ROAD_BUILD_CHANCE = 0.2;

// poziomy trudności AI — economy: mnożnik produkcji, aggression: waga ruchów
// bojowych w ocenie AI, aggressionThreshold: mnożnik progów przewagi siły
// wymaganych do ataku (niższy = atakuje przy gorszym stosunku sił),
// thinkDelay: opóźnienie (ms) między kolejnymi ruchami bota
// (Nightmare economy 1.725 = 1.5 bazowe * 1.15 dodatkowego handicapu ekonomicznego,
// żeby był wyraźnie najtrudniejszy)
const AI_DIFFICULTY_PRESETS = {
  easy:      { key: 'easy',      economy: 0.5,   aggression: 0.7, aggressionThreshold: 1.3,  thinkDelay: 260 },
  normal:    { key: 'normal',    economy: 1.0,   aggression: 1.0, aggressionThreshold: 1.0,  thinkDelay: 160 },
  hard:      { key: 'hard',      economy: 1.25,  aggression: 1.35, aggressionThreshold: 0.85, thinkDelay: 110 },
  nightmare: { key: 'nightmare', economy: 1.725, aggression: 1.7, aggressionThreshold: 0.7,  thinkDelay: 70 },
};
const AI_DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];
const DEFAULT_AI_DIFFICULTY = 'normal';

// eskalacja przełamująca pat: progi opłacalności ataku AI maleją liniowo z długością
// partii — po AI_ESC_TURNS rundach próg jest niższy o AI_ESC_MAX (ułamek). Bez tego
// przy wyrównanych siłach front zastyga na setki rund (obie strony się okopują i nikt
// nie szturmuje stolicy) — zmierzone 40% remisów w 300 grach normal vs normal
const AI_ESC_TURNS = 100;
const AI_ESC_MAX = 0.5;
// pełna moc eskalacji już przy tej przewadze siły (mnożnik; 1.6 = 160% siły wroga) —
// „wygrana pozycja" ma się domykać, zanim partia dobije do limitu rund
const AI_ESC_DOMINANCE_FULL = 1.4;
// premia oceny za zajęcie pola sąsiadującego ze stolicą-celem oblężenia (pierścień
// wsparcia pod przyszły szturm), skalowana postępem eskalacji i supportWeight typu
const AI_SIEGE_BONUS = 18;
// wzrost wartości stolicy-celu wraz z eskalacją — kieruje wspólną pulę ruchów na
// dowóz sił pod oblężenie zamiast na lokalne potyczki (sekcja zwłok patów pokazała,
// że zwycięzca z przewagą 2:1 przepala ruchy na skórmisze i nigdy nie dowozi armii)
const AI_ESC_FOCUS_VAL = 25;
// premia szturmowa: przy eskalacji atak na wrogą armię w pobliżu stolicy-celu
// (dystans ścieżkowy <= AI_ESC_ASSAULT_RANGE) dostaje bonus rosnący z bliskością —
// bez niej marsz „bądź blisko celu" scorował wyżej niż bicie armii-tarczy blokującej
// korytarz i oblężenie tańczyło wokół obrońców, nigdy ich nie atakując
const AI_ESC_ASSAULT = 25;
const AI_ESC_ASSAULT_RANGE = 4;
// podział ról wg siły: armie słabsze niż ten próg nie idą na wojnę (bez kanalizacji
// na stolicę-cel i bez strefy zbornej — w oblężeniu byłyby mięsem), tylko zbierają
// wolne miasta i złoża; bez tego progu eskalacja wysyłała na front nawet drobne
// armijki i AI zostawiało po 3-4 niczyje miasta na mapie przez całą grę
const AI_SIEGE_MIN_STR = 25;

// typy jednostek lądowych — atk/def: mnożniki armyPowerAt (siły w ataku/obronie),
// supportWeight: waga wkładu tej armii we wsparcie sąsiadów w bitwie (supportFor),
// mp: punkty ruchu na turę na lądzie (koszt pola: 1 na własnej drodze, 2 poza nią),
// więc piechota 1 pole / 2 po drodze, czołg 2 / 4, artyleria 1 / 2. Na morzu wszystkie
// typy dostają SEA_MOVE_POINTS zamiast własnego mp.
const UNIT_TYPES = {
  infantry:  { key: 'infantry',  atk: 1.00, def: 1.00, mp: 2, supportWeight: 1.00 },
  tank:      { key: 'tank',      atk: 1.25, def: 0.85, mp: 4, supportWeight: 0.80 },
  artillery: { key: 'artillery', atk: 0.75, def: 1.20, mp: 2, supportWeight: 1.80 },
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
    key: 'custom', pct: Math.round(diff),
    economy: lerp('economy'), aggression: lerp('aggression'),
    aggressionThreshold: lerp('aggressionThreshold'), thinkDelay: Math.round(lerp('thinkDelay')),
  };
}

// trudność konkretnego gracza: preset gry + mnożniki bossa, gdy slot jest bossem.
// Jedno miejsce prawdy — wołają to i cityGain (produkcja), i aiStep (decyzje bota),
// więc premia bossa nie może rozjechać się między ekonomią a zachowaniem
function playerDifficulty(p) {
  const base = resolveDifficulty(p.difficulty);
  if (p.kind !== 'boss') return base;
  return {
    ...base,
    economy: base.economy * BOSS_MULT.economy,
    aggression: base.aggression * BOSS_MULT.aggression,
    aggressionThreshold: base.aggressionThreshold * BOSS_MULT.aggressionThreshold,
  };
}

// etykieta presetu do wyświetlenia — woła i18n.t() zdefiniowane w i18n.js
// (wczytywanym zaraz po config.js), ale wywoływane dopiero przy renderze UI,
// więc kolejność <script>-ów tu nie ma znaczenia
function difficultyLabel(preset) {
  if (preset.key === 'custom') return i18n.t('difficulty.customPercent', { pct: preset.pct });
  return i18n.t('difficulty.' + preset.key);
}

// Ostatni wpis (BOSS_SKIN) to imperium bossa: nigdy nie trafia do gry przez slice(),
// wchodzi wyłącznie na slot obsadzony jako 'boss' w lobby. Kolor jest ciemny, ale nie
// czysto czarny — barwa właściciela idzie na planszę jako kalka 30% (render.js) i przy
// #000 pole zlewałoby się z obrysem heksa.
const PLAYERS_DEF = [
  { name: 'Karmazynia', color: '#d64550', dark: '#8c2530', isHuman: true },
  { name: 'Lazuria',    color: '#3f7fd6', dark: '#24518f', isHuman: false },
  { name: 'Werdania',   color: '#3fae62', dark: '#22703c', isHuman: false },
  { name: 'Aurelia',    color: '#d6a53f', dark: '#8f6a1f', isHuman: false },
  { name: 'Ametria',    color: '#8a4fd6', dark: '#5a2f8f', isHuman: false },
  { name: 'Turkusja',   color: '#3fc9c2', dark: '#1f7f7a', isHuman: false },
  { name: 'Czarna Legia', color: '#3c3c46', dark: '#15151a', isHuman: false },
];
// indeks zestawu sprite'ów bossa (assets/*_6.png) — patrz player.skin w state.js
const BOSS_SKIN = PLAYERS_DEF.length - 1;

// Boss to nie osobny poziom trudności, tylko mnożniki NA WIERZCHU wybranego presetu —
// dzięki temu suwak trudności dalej reguluje partię z bossem. Sama produkcja nie
// wystarcza: bogaty bot potrafi turtlować z jednym wielkim stosem, więc premia
// ekonomiczna idzie w parze z agresją i niższym progiem opłacalności ataku.
const BOSS_MULT = { economy: 1.6, aggression: 1.4, aggressionThreshold: 0.85 };

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
// Uwaga: ta kolejność maksymalizuje ROZRZUT, co jest właściwe w FFA, ale przy drużynach
// byłoby sabotażem (sojusznicy w przeciwległych rogach). Kto gdzie startuje w grze
// drużynowej wylicza assignTeamPositions() w state.js — z tego samego zbioru pozycji.

// liczba imperiów możliwych na mapie — wprost tyle, ile jest pozycji stolic (boss ZAJMUJE
// jeden z tych slotów, a nie dokłada kolejnego). Liczona, a nie wpisana, bo rozejście się
// tych dwóch wartości oznaczałoby imperium bez stolicy — CAPITAL_SPOTS[id] === undefined
const MAX_PLAYERS = CAPITAL_SPOTS.length;
