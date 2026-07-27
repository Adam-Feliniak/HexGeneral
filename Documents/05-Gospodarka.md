# Gospodarka

## Produkcja siły (`produce()`, `roads.js`)

Wywoływana raz na gracza, na końcu jego tury (`endTurn` w `turns.js`), **zanim** aktywny gracz się zmieni. Dla każdego pola-miasta należącego do gracza:

```
base = (stolica ? 3 : 1) + bonus_z_aktywnych_złóż_zaopatrujących_to_miasto
gain = max(1, round(base * mult))
```

`mult` to mnożnik ekonomii z presetu trudności AI (`AI_DIFFICULTY_PRESETS[...].economy`) — **ludzie zawsze mają `mult = 1`**, mnożnik dotyczy wyłącznie botów (np. Nightmare ma `economy: 1.725`, Easy `0.5`).

### Gdzie trafia wyprodukowana siła

Najpierw sprawdzane jest, czy miasto ma aktywny **projekt drogi** (`t.city.roadProject`, patrz niżej) — jeśli tak, `gain` z tej tury dolicza się do jego postępu zamiast do jednostek, i tyle (miasto nie buduje wtedy żadnej armii). W przeciwnym razie zależy od tego, co stoi na polu miasta i jaki typ jednostki miasto ma aktualnie wybrany do budowy (`city.buildType`, domyślnie `'infantry'`):

- **Pole puste** → powstaje nowa armia typu `buildType`, z `vet: 0` i `mp: 0` (nie może ruszyć się w tej samej turze, w której powstała — pełną pulę dostanie od `resetMoved` na starcie następnej tury).
- **Stoi własna armia tego samego typu co `buildType`** → jej `str` rośnie o `gain` (ograniczone do `MAX_ARMY = 99`).
- **Stoi własna armia INNEGO typu niż `buildType`** → **produkcja tej tury po prostu przepada**. Nie jest odkładana ani konwertowana — to celowo najprostsza reguła spójna z resztą gry (jedno pole trzyma dokładnie jedną armię, bez systemu kolejkowania). Gracz/AI ma pełną kontrolę: wystarczy zmienić `buildType` z powrotem, żeby produkcja znów działała.

## Wybór budowanego typu

### Człowiek — panel produkcji

Kliknięcie we własne miasto (`state.selectedCity` ustawiane w `onTileClick`, `input.js`) pokazuje pod planszą **panel produkcji**, renderowany przez `updateBuildPanel()` w `ui.js`. Panel zawsze rezerwuje swoje miejsce w layoucie (ukrywany przez `visibility`, nie `display:none`), żeby plansza nie zmieniała rozmiaru przy pokazywaniu/chowaniu.

Zawartość panelu zależy od stanu miasta:
- **Bez aktywnego projektu** — 3 przyciski typu jednostki (Piechota/Czołg/Artyleria; klik zapisuje wybór w `t.city.buildType`) plus przycisk **"Zbuduj drogę"**.
- **Po kliknięciu "Zbuduj drogę"** — panel pokazuje podpowiedź "Wybierz cel na mapie" i przycisk anulowania; `state.roadPickFrom` wskazuje miasto czekające na cel. Kolejne kliknięcie w `onTileClick` (`input.js`) na własne pole (złoże albo miasto) próbuje wywołać `startRoadProject` — jeśli trasa się nie uda wytyczyć (patrz niżej), pokazuje się baner z informacją, a wybór po prostu się anuluje.
- **Z aktywnym projektem drogi** (`t.city.roadProject`) — panel pokazuje postęp `progress/cost` i przycisk "Anuluj" (przerywa projekt; zainwestowane punkty przepadają, nic nie jest zwracane).

### AI — `aiAssignCityProject`

Boty **nie mają UI** — same decydują, co ich miasta produkują, na początku każdej pętli `produce()` (hak w `roads.js`, wołany tylko dla `!p.isHuman`). `aiAssignCityProject(t, playerId)` jest pierwszym punktem decyzji:

```js
function aiAssignCityProject(t, playerId) {
  if (miasto ma już aktywny projekt drogi) return; // nie przerywamy w trakcie
  if (front jest dostatecznie daleko) {
    cel = najbliższe własne złoże bez drogi;
    if (cel istnieje, los < AI_ROAD_BUILD_CHANCE, i startRoadProject się uda) return;
  }
  aiAssignBuildType(t, playerId); // domyślna ścieżka — jak dawniej
}
```

Jeśli AI nie zdecyduje się (albo nie może — patrz ograniczenie terytorium niżej) zbudować drogi, spada do starej, niezmienionej heurystyki `aiAssignBuildType`:

```js
function aiAssignBuildType(t, playerId) {
  if (na polu stoi własna armia) { buildType = typ tej armii; return; } // AI nigdy nie marnuje własnej produkcji
  if (pole zajęte przez kogoś innego) return; // nic nie rób
  d = odległość do najbliższego wrogiego pola;
  buildType = d <= 2 ? 'artillery' : d <= 5 ? 'tank' : 'infantry';
}
```

Prosta heurystyka frontowa: bardzo blisko wroga (≤2 pola) AI stawia na artylerię (obrona + wsparcie), średnio blisko (≤5) na czołgi (ofensywa), a głębokie zaplecze produkuje piechotę (baza). `AI_ROAD_BUILD_CHANCE` (domyślnie 0.2, `config.js`) to szansa na turę, że odpowiednio spokojne miasto (front > 2 pola) zacznie budować drogę zamiast jednostki.

## Złoża surowców i drogi

Drogi **nie powstają już automatycznie**. Gracz i AI budują je świadomie, wydając na nie punkty produkcji miasta zamiast na jednostki — patrz sekcja o panelu produkcji wyżej.

### Sieć dróg — model (`roads.js`)

Droga to **nie** jeden obiekt z pełną trasą, tylko zbiór sąsiadujących **heksów**: pole
w sieci ma `tile.road = { owner }`. Dzięki temu drogi z różnych miast do wspólnych pól
łączą się w naturalną sieć ze wspólnymi odcinkami (rozgałęzienia), bez nadpisywania.

### Budowa drogi (`roadCost`, `startRoadProject`, `produce`, `completeRoadProject`)

Cel to dowolne **własne** pole będące złożem albo miastem. `roadCost` liczy najtańsze
połączenie celu z miastem przez **własne terytorium** (BFS 0/1, `roadDijkstra`): wejście na
istniejący heks drogi kosztuje **0** (sieć się współdzieli), na zwykłe własne pole **1**
(nowy heks). Zwraca `{ path, segment, cost }`, gdzie `segment` to tylko **nowe** heksy do
położenia, a `cost = ROAD_BASE_COST + ROAD_COST_PER_TILE * segment.length`
(startowo `0 + 3 * długość` — patrz `config.js`, do dostrojenia w testach). Jeśli cel jest
już w tej samej sieci co miasto (`segment` puste) albo nie da się połączyć — `null`.

`startRoadProject` zapisuje `t.city.roadProject = { target, segment, cost, progress: 0, built: 0 }`.
Co turę `produce()` dolicza produkcję miasta do `progress` i **przyrostowo** odsłania heksy:
`built = floor(progress / cost * segment.length)`, a każdy nowo odsłonięty `segment[i]`
dostaje `road = { owner }`. Sieć rośnie od strony miasta ku celowi. Jeśli wróg zajmie pole
segmentu w trakcie budowy, dalej się nie da — `failRoadProject` przerywa (już położone heksy
zostają w sieci, punkty przepadają). Po dojściu do celu `completeRoadProject` sprząta projekt
i resetuje `buildType` na domyślny.

Anulowanie (`cancelRoadProject`) **zostawia** już położone heksy jako część sieci (realna
infrastruktura) i tylko kasuje projekt.

### Zaopatrzenie: złoże → jedno wybrane miasto

Każde własne złoże będące heksem sieci i połączone z co najmniej jednym miastem daje
**+1 produkcji do jednego miasta**. Domyślnie jest to **najbliższe** połączone miasto
(`supplyCityFor`), ale gracz może kliknąć własne, podłączone złoże i w panelu pod mapą
wybrać inne z listy połączonych (`connectedCities`) — wybór zapisuje `resourceTile.supplyCity`
i można go zmieniać. Wiele dróg do jednego złoża **nie** zwielokrotnia bonusu (jedno złoże =
jeden +1). AI nie rusza wyboru (zostaje domyślne najbliższe).

### Zniżka ruchu i przecięcie

`tileOnRoad(t, playerId)` = pole jest własnym heksem drogi (`t.road.owner === playerId &&
t.owner === playerId`). Wejście na takie pole kosztuje `MOVE_COST_ROAD = 1` punkt ruchu zamiast `MOVE_COST_DEFAULT = 2`
(`moveCostStep` — patrz [Mechanika rozgrywki](04-Mechanika-rozgrywki.md)). Zniżka dotyczy
**wejścia na drogę**, więc premiuje jazdę wzdłuż sieci, a nie samo stanie na niej: czołg
przejedzie drogą 4 pola, ale zjeżdżając z niej w czyste pole tylko 2. Obejmuje całą sieć,
także odcinki jeszcze w budowie.

Przecięcie sieci = **wróg zajmuje heks drogi**: `captureTile` kasuje `t.road` na tym polu,
więc sieć się rozspójnia (`connectedCities`/`supplyCityFor` liczą połączenia na bieżąco).
Nie ma „samoleczenia" — po odbiciu pola brakujący heks trzeba dobudować (tanio, 3 pkt/heks).

### Zajęcie terenu a sieć (`empire.js`)

- **Pojedyncze zajęcie pola** — przejęty heks drogi znika (`t.road = null`), przejęte złoże
  traci `supplyCity`, przejęte miasto porzuca swój projekt budowy (już położone heksy
  zostają w sieci do czasu ich ewentualnego przejęcia).
- **Aneksja całego imperium** (`conquerEmpire`) — wszystkie heksy drogi pokonanego stają się
  siecią zwycięzcy (`road.owner = winnerId`); projekty budowy na przejętych miastach są
  porzucane (zwycięzca może zbudować od nowa).

Wszystkie trzy typy złóż (`oil`/`farm`/`mine`, dobierane wg `t.shade` przy generacji mapy)
dają **identyczny** bonus — rozróżnienie jest czysto kosmetyczne (inny sprite, inna nazwa
w tooltipie), bez mechanicznej różnicy.

## Limit stosu

`MAX_ARMY = 99` to twardy limit siły pojedynczej armii na polu — stosowany jednolicie przy: produkcji (`Math.min(MAX_ARMY, ...)`), łączeniu armii przy ruchu, oraz jako blokada wejścia na pełny własny stos w `canStep`.
