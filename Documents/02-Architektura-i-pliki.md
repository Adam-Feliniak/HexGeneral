# Architektura i pliki

## Brak modułów — jedna globalna przestrzeń nazw

Wszystkie pliki `src/*.js` są wczytywane jako zwykłe, kolejne tagi `<script>` w `index.html` (bez `type="module"`, bez `import`/`export`). Każda `function`/`const` zadeklarowana na najwyższym poziomie pliku staje się **globalnie widoczna** dla wszystkich kolejnych skryptów — to zastępuje tu system modułów.

Kolejność wczytywania w `index.html`:

```
config.js → locales-data.js → i18n.js → geometry.js → utils.js → mapgen.js
→ state.js → combat.js → roads.js → empire.js → turns.js → ai.js
→ save.js → sprites.js → render.js → ui.js → input.js → menu.js → main.js
```

Kolejność ma znaczenie tylko tam, gdzie kod **wykonuje się natychmiast przy wczytaniu** pliku (nie tylko definiuje funkcje):
- `i18n.js` na końcu wywołuje `i18nInit()` — ustawia język z `localStorage` (musi być po `locales-data.js`, żeby `I18N_DATA` już istniało).
- `render.js` na starcie pliku czyta `document.getElementById('board')` do stałej `canvas` (musi być po tym, jak DOM istnieje — w praktyce dowolne miejsce, bo `<script>` bez `defer` i tak wykonuje się po sparsowaniu wcześniejszego HTML).
- `main.js` (ostatni plik) faktycznie **startuje grę**: `setupCanvas()`, `loadSprites()`, `initInput()`, `initMenu()`, budowa startowego `state` (ekran menu), `applyScreen()`, `applyI18n()`, `requestAnimationFrame(frame)`. Musi być wczytany na końcu, bo wywołuje funkcje zdefiniowane we wszystkich poprzednich plikach.

Poza tymi przypadkami, funkcje z dowolnego pliku mogą swobodnie wołać funkcje z dowolnego innego pliku — nie ma tu żadnej hierarchii zależności wymuszanej przez system modułów, tylko konwencja tematycznego podziału.

## Tabela plików `src/`

| Plik | Odpowiedzialność | Kluczowe funkcje/stałe |
|---|---|---|
| `config.js` | Stałe rozgrywki: rozmiar mapy, gracze, nazwy miast, pozycje stolic, typy jednostek, poziomy trudności AI | `MAP_W/H`, `HEX`, `MOVES_PER_TURN`, `MAX_ARMY`, `UNIT_TYPES`, `AI_DIFFICULTY_PRESETS`, `PLAYERS_DEF`, `CAPITAL_SPOTS`, `resolveDifficulty()` |
| `locales-data.js` | **Wygenerowany** (nie edytować ręcznie) zrzut `locales/*.json` jako stała JS | `I18N_DATA` |
| `i18n.js` | Tłumaczenia UI, przełączanie języka, zapamiętywanie w `localStorage` | `i18n.t()`, `i18n.setLanguage()`, `applyI18n()` |
| `geometry.js` | Geometria siatki heksagonalnej (odd-r, pointy-top) | `neighborCoords()`, `hexDist()`, `hexCenter()`, `hexCorner()` |
| `utils.js` | Losowość (w tym deterministyczny PRNG z ziarna) i mieszanie kolorów | `rnd()`, `irnd()`, `shuffle()`, `makeRng()`, `mixColor()` |
| `mapgen.js` | Proceduralne generowanie mapy: ląd, stolice, miasta, porty, złoża, gwarancja spójności | `generateMap()`, `ensureCapitalConnectivity()` |
| `state.js` | Stan gry, tworzenie nowej gry, dostęp do pól planszy, log wydarzeń | `newGame()`, `tileAt()`, `neighborsOf()`, `addLog()` |
| `combat.js` | Morale, siła bojowa, legalność ruchu, zasięg ruchu, rozstrzyganie bitew | `moraleAt()`, `armyPowerAt()`, `canStep()`, `moveCap()`, `reachableMoves()`, `resolveBattle()`, `executeMove()` |
| `roads.js` | Sieć dróg budowana przez gracza/AI (heksy `road`), zaopatrzenie i produkcja siły w miastach | `roadCost()`, `startRoadProject()`, `completeRoadProject()`, `connectedCities()`, `supplyCityFor()`, `tileOnRoad()`, `produce()` |
| `empire.js` | Zajmowanie pól, aneksja całego imperium, warunek końca gry | `captureTile()`, `conquerEmpire()`, `checkGameOver()` |
| `turns.js` | Kolejność tur (człowiek/AI), limit czasu | `startTurn()`, `endTurn()`, `requestEndTurn()`, `checkTurnTimer()` |
| `ai.js` | Wybór ruchów i celów botów, dobór typu produkcji/budowy dróg | `aiTargets()`, `aiPickMove()`, `aiStep()`, `aiAssignBuildType()`, `aiAssignCityProject()` |
| `save.js` | Zapis gry: jawny kodek stanu (JSON), autozapis w `localStorage` (klucz `hexgeneral.save`), „Kontynuuj", eksport/import tekstowy | `serializeGame()`, `deserializeGame()`, `autosave()`, `loadAutosave()`, `exportSaveText()`, `importSaveText()` |
| `sprites.js` | Wczytywanie plików PNG z `assets/` do obiektu `SPR` | `loadSprites()`, `sprOk()` |
| `render.js` | Całe rysowanie na `<canvas>` | `draw()`, `frame()`, `drawTile()`, `drawArmy()`, `drawCity()`, `drawRoads()` |
| `ui.js` | Panel boczny, banery, ekran końca gry, panel produkcji | `updateUI()`, `updateBuildPanel()`, `showBanner()`, `showOverlay()` |
| `input.js` | Obsługa kliknięć/najechania myszą, tooltipy, skróty klawiszowe | `onTileClick()`, `tileTooltip()`, `initInput()` |
| `menu.js` | Ekrany menu głównego, lobby (single/multi), opcje, nawigacja między ekranami | `applyScreen()`, `goToScreen()`, `renderSpSetup()`, `renderMpSetup()`, `initMenu()` |
| `main.js` | Uruchomienie gry po wczytaniu wszystkich modułów | (kod na najwyższym poziomie pliku) |

## Format zapisu gry (`save.js`)

Zapis to JSON `{ format, version, savedAt, game }`, gdzie `game` zawiera pełny stan
rozgrywki (w tym pełną siatkę kafelków — celowo NIE „seed + nakładka zmian", żeby
przyszłe korekty `mapgen.js` nie psuły cicho starych zapisów). Kodek jest jawny:

- referencje do kafelków (`roadProject.target`/`.segment[]`, `supplyCity`) są
  zapisywane jako współrzędne `[c, r]` i odtwarzane po wczytaniu przez nową siatkę,
- `Infinity` (`timeLimit`, `movesUsed`) jest kodowane stringiem `'inf'`
  (JSON zamieniłby je na `null`),
- transienty (selekcje, `turnStartTime`, `gameId`, `anims`/`floaters`/`effects`)
  nie są zapisywane — odtwarzane na świeżo przy wczytaniu.

**Dyscyplina formatu:** każda zmiana kształtu stanu gry (nowe pole wpływające na
rozgrywkę) wymaga dopisania pola do kodeka w `save.js` i podbicia `SAVE_FORMAT` —
zapis o innym formacie dostaje komunikat o niezgodności (bez migracji przed 1.0).

## Osłony headless-Node

Pliki, które dotykają DOM-u, zaczynają odpowiednie funkcje od strażnika w stylu:

```js
if (typeof document === 'undefined') return;
```

Dzięki temu **cała logika gry (bez rysowania i bez DOM-u) daje się uruchomić w zwykłym Node.js**, bez przeglądarki — przydatne do automatycznych testów/symulacji bez konfigurowania headless-browsera (patrz [Przewodnik developera](09-Przewodnik-developera.md)). Repo nigdy nie miało formalnych testów jednostkowych ani eksportu CommonJS (`module.exports`) — pliki polegają wyłącznie na globalnym scope przeglądarki/Node.

## Kształt danych

### `state` (globalny obiekt gry, tworzony przez `newGame()`)

```js
state = {
  screen: 'menu' | 'sp-setup' | 'mp-setup' | 'tutorial' | 'options' | 'game',
  gameId,              // rozróżnia sesje gry — chroni przed spóźnionymi setTimeout AI/końca tury
  mode: 'single' | 'multi',
  mpSetup, spSetup, options,   // stan formularzy lobby (przetrwa między grami)
  tiles,                // MAP_H × MAP_W siatka pól (patrz niżej)
  mapSeed,
  turn,                 // numer aktualnej rundy (rośnie po pełnym obrocie wszystkich graczy)
  phase: 'active' | 'over',
  human,                 // id imperium "twojego" gracza (tylko single)
  humanPlayerCount,
  aiDifficulty,          // wspólny preset/liczba dla botów tej gry
  currentPlayerIndex,
  turnStartTime,
  timeLimit,              // sekundy albo Infinity
  movesLeft,              // wspólna pula ruchów aktywnego gracza w tej turze
  selected,               // zaznaczone pole z armią (albo null)
  selectedCity,           // zaznaczone własne pole z miastem — steruje panelem produkcji
  players: [{ id, name, color, dark, isHuman, alive, capital, difficulty, ... }],
  aiPlayers,              // podzbiór players[] będący botami
  log,                    // ostatnie komunikaty (max 40, pokazywane ostatnie 10)
}
```

Poza `state` istnieją jeszcze osobne, niezależnie resetowane tablice modułowe: `anims` (animacje ruchu — tween pozycji), `floaters` (unoszące się napisy strat), `effects` (eksplozje), `hoverTile`, `lastFrame` — wszystkie w `state.js`.

### Pole planszy (`tile`, element `state.tiles[r][c]`)

```js
{
  c, r,                 // współrzędne kolumna/wiersz
  land: bool,
  city: null | { name, capitalOf, port, buildType, variant?, roadProject? },
  resource: null | 'oil' | 'farm' | 'mine',   // + opcjonalne supplyCity: pole miasta zaopatrywanego (+1)
  road: null | { owner },                // heks sieci dróg gracza (roads.js) — sieć to zbiór
                                         // sąsiadujących heksów drogi tego samego właściciela;
                                         // pole miasta źródłowego i trasa NIE są tu trzymane
  owner: -1 | playerId,
  army: null | { player, str, vet, movesUsed, type },
  shade: number (-1..1), // losowa wariacja koloru terenu, też steruje typem złoża i dekoracją
  coast: number[],       // (tylko ląd) kierunki krawędzi stykających się z wodą — do rysowania piany
  shallow: bool,          // (tylko woda) czy sąsiaduje z lądem — płycizna
}
```

`city.capitalOf` to `-1` dla zwykłego miasta albo id gracza, którego stolicą to miasto **było przy generacji mapy** — pole nie zmienia się nawet po zdobyciu stolicy przez wroga poza jednym wyjątkiem: `captureTile()` w `empire.js` ustawia `capitalOf = -1` w momencie faktycznego zdobycia stolicy (staje się wtedy zwykłym miastem).

`city.roadProject` (opcjonalne, `null`/brak gdy nieaktywne) to `{ target, segment, cost, progress, built }` — aktywny projekt budowy drogi z tego miasta; `segment` to lista nowych heksów do położenia, `built` ile z nich już położono. Dopóki istnieje, produkcja miasta (`produce()` w `roads.js`) idzie w `progress` (i przyrostowo odsłania heksy sieci) zamiast w jednostki (patrz [Gospodarka](05-Gospodarka.md)).

`army.type` to jedna z trzech wartości opisanych w [Mechanice rozgrywki](04-Mechanika-rozgrywki.md): `'infantry'` | `'tank'` | `'artillery'`.

## Geometria siatki

Heksy używają układu **odd-r offset, pointy-top** (`geometry.js`): wiersze parzyste i nieparzyste mają różny zestaw 6 kierunków sąsiedztwa (`DIRS_EVEN`/`DIRS_ODD`), bo są przesunięte względem siebie o pół szerokości heksa. Odległość między polami (`hexDist`) liczona jest przez konwersję na współrzędne kostkowe (cube coordinates) — standardowa technika dla siatek heksagonalnych.
