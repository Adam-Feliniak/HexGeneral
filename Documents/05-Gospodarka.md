# Gospodarka

## Produkcja siły (`produce()`, `roads.js`)

Wywoływana raz na gracza, na końcu jego tury (`endTurn` w `turns.js`), **zanim** aktywny gracz się zmieni. Dla każdego pola-miasta należącego do gracza:

```
base = (stolica ? 3 : 1) + bonus_z_aktywnych_złóż_zaopatrujących_to_miasto
gain = max(1, round(base * mult))
```

`mult` to mnożnik ekonomii z presetu trudności AI (`AI_DIFFICULTY_PRESETS[...].economy`) — **ludzie zawsze mają `mult = 1`**, mnożnik dotyczy wyłącznie botów (np. Nightmare ma `economy: 1.725`, Easy `0.5`).

### Gdzie trafia wyprodukowana siła

Zależy od tego, co stoi na polu miasta i jaki typ jednostki miasto ma aktualnie wybrany do budowy (`city.buildType`, domyślnie `'infantry'`):

- **Pole puste** → powstaje nowa armia typu `buildType`, z `vet: 0` i `movesUsed: Infinity` (nie może ruszyć się w tej samej turze, w której powstała).
- **Stoi własna armia tego samego typu co `buildType`** → jej `str` rośnie o `gain` (ograniczone do `MAX_ARMY = 99`).
- **Stoi własna armia INNEGO typu niż `buildType`** → **produkcja tej tury po prostu przepada**. Nie jest odkładana ani konwertowana — to celowo najprostsza reguła spójna z resztą gry (jedno pole trzyma dokładnie jedną armię, bez systemu kolejkowania). Gracz/AI ma pełną kontrolę: wystarczy zmienić `buildType` z powrotem, żeby produkcja znów działała.

## Wybór budowanego typu

### Człowiek — panel produkcji

Kliknięcie we własne miasto (`state.selectedCity` ustawiane w `onTileClick`, `input.js`) pokazuje pod planszą **panel produkcji** — 3 przyciski (Piechota/Czołg/Artyleria), renderowane przez `updateBuildPanel()` w `ui.js`. Kliknięcie przycisku od razu zapisuje wybór w `t.city.buildType`. Panel zawsze rezerwuje swoje miejsce w layoucie (ukrywany przez `visibility`, nie `display:none`), żeby plansza nie zmieniała rozmiaru przy pokazywaniu/chowaniu panelu.

### AI — `aiAssignBuildType`

Boty **nie mają UI** — same decydują, co ich miasta produkują, na początku każdej pętli `produce()` (hak w `roads.js`, wołany tylko dla `!p.isHuman`):

```js
function aiAssignBuildType(t, playerId) {
  if (na polu stoi własna armia) { buildType = typ tej armii; return; } // AI nigdy nie marnuje własnej produkcji
  if (pole zajęte przez kogoś innego) return; // nic nie rób
  d = odległość do najbliższego wrogiego pola;
  buildType = d <= 2 ? 'artillery' : d <= 5 ? 'tank' : 'infantry';
}
```

Prosta heurystyka frontowa: bardzo blisko wroga (≤2 pola) AI stawia na artylerię (obrona + wsparcie), średnio blisko (≤5) na czołgi (ofensywa), a głębokie zaplecze produkuje piechotę (baza). Jeśli na polu już stoi armia, AI zawsze dopasowuje `buildType` do niej — dzięki temu bot nigdy nie marnuje własnej produkcji przez niezgodność typu (w przeciwieństwie do człowieka, który może to sobie zrobić przez nieuwagę).

## Złoża surowców i drogi

### Wytyczanie drogi (`establishRoad`)

Wołane **raz, w momencie zmiany właściciela złoża** (przy zajęciu pola albo przy aneksji całego imperium). Szuka najkrótszego **lądowego** miasta należącego do nowego właściciela (BFS po lądzie, `landPath`) i zapisuje trasę na stałe: `t.road = { owner, city, path }`.

**Trasa się później nie przelicza** — nawet jeśli powstanie bliżej położone miasto tego samego gracza. Jedyna zmiana, jaka może się jej przydarzyć, to zerwanie (patrz niżej). Jeśli w chwili zajęcia złoża gracz nie ma żadnego miasta osiągalnego lądem — złoże zostaje **bez drogi na zawsze**, dopóki nie zmieni właściciela ponownie.

### Aktywność drogi (`isRoadActive`)

Droga jest aktywna, jeśli istnieje i **żadne** pole na jej trasie nie należy aktualnie do wroga:

```js
rd.path.every(p => p.owner === rd.owner || p.owner < 0)
```

Pola **niczyje** (`owner < 0`) **nie przerywają** drogi — liczy się wyłącznie realne zajęcie trasy przez innego gracza. Przerwana droga rysuje się na planszy przygaszona i kreskowana na czerwono (`drawRoadPath` w `render.js`), zamiast normalnej asfaltowej nawierzchni.

### Efekty aktywnej drogi

- **Bonus produkcji**: `resourceLinks(playerId)` zbiera wszystkie własne złoża z aktywną drogą, każde dokłada `+1` do bazy produkcji miasta, do którego prowadzi (sumuje się, jeśli kilka złóż zaopatruje to samo miasto).
- **Bonus ruchu**: `tileOnRoad(t, playerId)` sprawdza, czy dane pole leży na czyjejś aktywnej drodze tego gracza — jeśli tak, `moveCap` dolicza `roadBonus` typu jednostki (patrz [Mechanika rozgrywki](04-Mechanika-rozgrywki.md); piechota +1, czołg +2, artyleria +0).

Wszystkie trzy typy złóż (`oil`/`farm`/`mine`, dobierane wg `t.shade` przy generacji mapy) dają dziś **identyczny** bonus — rozróżnienie jest czysto kosmetyczne (inny sprite, inna nazwa w tooltipie), bez mechanicznej różnicy.

## Limit stosu

`MAX_ARMY = 99` to twardy limit siły pojedynczej armii na polu — stosowany jednolicie przy: produkcji (`Math.min(MAX_ARMY, ...)`), łączeniu armii przy ruchu, oraz jako blokada wejścia na pełny własny stos w `canStep`.
