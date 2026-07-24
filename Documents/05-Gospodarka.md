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

- **Pole puste** → powstaje nowa armia typu `buildType`, z `vet: 0` i `movesUsed: Infinity` (nie może ruszyć się w tej samej turze, w której powstała).
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

### Budowa drogi (`roadCost`, `startRoadProject`, `completeRoadProject` w `roads.js`)

Cel budowy to dowolne **własne** pole będące złożem albo miastem (`roadCost` odrzuca cudze/nieistniejące cele). Trasa liczona jest BFS-em (`landPath`) **wyłącznie przez pola należące do budującego gracza** — droga nie może biec przez ziemię niczyją ani wroga, więc żeby połączyć odległy cel, trzeba go najpierw otoczyć własnym terytorium. Brak takiej trasy = `roadCost` zwraca `null`, budowa się nie zaczyna.

Koszt: `ROAD_BASE_COST + ROAD_COST_PER_TILE * path.length` (stałe w `config.js`, wartości startowe do dostrojenia w testach balansu). `startRoadProject` zapisuje `t.city.roadProject = { target, cost, progress: 0 }` — od tej pory produkcja miasta (patrz wyżej) dolicza się do `progress` zamiast do jednostek. Gdy `progress >= cost`, `produce()` woła `completeRoadProject`:
- trasa jest liczona **na nowo** (na wypadek utraty terytorium w trakcie budowy) — jeśli już się nie da jej wytyczyć, budowa przepada bez efektu (log informuje gracza), zainwestowane punkty giną;
- w przeciwnym razie pole docelowe dostaje `road = { owner, city: <miasto budujące>, path }` (ten sam kształt niezależnie, czy celem jest złoże, czy inne miasto — patrz niżej);
- `buildType` miasta wraca do domyślnego (`DEFAULT_UNIT_TYPE`), więc miasto nie "jałowieje" — trzeba świadomie wybrać kolejny cel produkcji.

### Dwa rodzaje dróg, ten sam mechanizm

- **Złoże → miasto** — jak dawniej, daje bonus produkcji (patrz niżej). Droga zapisana jest na polu złoża.
- **Miasto → miasto** — nowość, czysto pod bonus ruchu (patrz niżej). Droga zapisana jest na polu miasta-celu. Ponieważ to dokładnie ten sam kształt danych (`{ owner, city, path }`), cała reszta mechaniki (aktywność, rysowanie, bonus ruchu) działa dla obu identycznie bez rozróżniania przypadków.

Jedno pole może być celem tylko **jednej** aktywnej drogi naraz — zbudowanie nowej drogi do już podłączonego złoża/miasta nadpisuje poprzednią (to jest właśnie "przekierowanie" drogi na inne miasto źródłowe).

### Aktywność drogi (`isRoadActive`)

Droga jest aktywna, jeśli istnieje i **żadne** pole na jej trasie nie należy aktualnie do wroga:

```js
rd.path.every(p => p.owner === rd.owner || p.owner < 0)
```

Pola **niczyje** (`owner < 0`) **nie przerywają** drogi — liczy się wyłącznie realne zajęcie trasy przez innego gracza. Przerwana droga rysuje się na planszy przygaszona i kreskowana na czerwono (`drawRoadPath` w `render.js`), zamiast normalnej asfaltowej nawierzchni. Odzyskanie trasy (bez ponownej budowy) wystarczy, żeby droga sama "ożyła".

### Zajęcie terenu a istniejące drogi (`empire.js`)

- **Pojedyncze zajęcie pola** (złoża albo miasta, nie cała stolica) — `t.road = null`, ewentualny `roadProject` też jest kasowany. Nowy właściciel zaczyna od zera, musi zbudować własną infrastrukturę.
- **Upadek stolicy / aneksja całego imperium** (`conquerEmpire`) — zwycięzca **dziedziczy** istniejącą infrastrukturę pokonanego: każda droga na przejmowanym terenie dostaje `road.owner = winnerId` (nawet jeśli w danym momencie była przecięta — może "ożyć" pod nowym właścicielem, gdy trasa się oczyści). To jedyny sposób przejęcia cudzej, już zbudowanej drogi bez płacenia za nią.

### Efekty aktywnej drogi

- **Bonus produkcji**: `resourceLinks(playerId)` zbiera wszystkie własne złoża z aktywną drogą, każde dokłada `+1` do bazy produkcji miasta, do którego prowadzi (sumuje się, jeśli kilka złóż zaopatruje to samo miasto). Dotyczy wyłącznie dróg złoże→miasto.
- **Bonus ruchu**: `tileOnRoad(t, playerId)` sprawdza, czy dane pole leży na czyjejś aktywnej drodze tego gracza (złoże→miasto **albo** miasto→miasto) — jeśli tak, `moveCap` dolicza `roadBonus` typu jednostki (patrz [Mechanika rozgrywki](04-Mechanika-rozgrywki.md); piechota +1, czołg +2, artyleria +0).

Wszystkie trzy typy złóż (`oil`/`farm`/`mine`, dobierane wg `t.shade` przy generacji mapy) dają dziś **identyczny** bonus — rozróżnienie jest czysto kosmetyczne (inny sprite, inna nazwa w tooltipie), bez mechanicznej różnicy.

## Limit stosu

`MAX_ARMY = 99` to twardy limit siły pojedynczej armii na polu — stosowany jednolicie przy: produkcji (`Math.min(MAX_ARMY, ...)`), łączeniu armii przy ruchu, oraz jako blokada wejścia na pełny własny stos w `canStep`.
