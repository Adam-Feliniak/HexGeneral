# Generowanie mapy

Cała logika mieszka w `src/mapgen.js`, funkcja wejściowa: `generateMap(playerCount, seed)`. Mapa ma stały rozmiar `MAP_W × MAP_H` = 23×14 pól.

## 1. Losowość i determinizm

Jeśli podano `seed` (liczba 0–999999, `SEED_MAX_DIGITS`/`SEED_MAX_VALUE` w `config.js`), generator używa `makeRng(seed)` z `utils.js` — deterministycznego PRNG typu **mulberry32**. Ten sam seed zawsze produkuje dokładnie tę samą mapę (ląd, stolice, miasta, złoża — wszystko, co korzysta z `rand`). Bez seeda używany jest zwykły `Math.random`.

## 2. Ląd i kontynenty

1. **Szum losowy**: każde pole zostaje lądem z prawdopodobieństwem 58% (`rand() < 0.58`).
2. **Automat komórkowy** (3 iteracje): każde pole przyjmuje wartość większości swoich sąsiadów (jeśli więcej niż połowa sąsiadów to ląd → staje się lądem, jeśli mniej → wodą; remis zostaje bez zmian). To wygładza szum w spójne, organiczne kontynenty zamiast szachownicy pojedynczych pikseli.
3. **Wymuszony ląd wokół stolic**: każde pole w promieniu `hexDist ≤ 2` od pozycji startowej stolicy (`CAPITAL_SPOTS`) zostaje lądem na twardo — gwarantuje, że stolica nigdy nie wyląduje na wodzie ani na przesmyku zbyt wąskim, by cokolwiek na niej postawić.

## 3. Stolice i miasta

- **Stolice**: po jednej na gracza, na z góry ustalonych pozycjach `CAPITAL_SPOTS` (`config.js`) — rogi mapy, potem środki górnej/dolnej krawędzi, w kolejności dobranej tak, by kolejne podzbiory 2–6 graczy były sensownie rozstawione. Maksimum to `MAX_PLAYERS = 6` imperiów, bo tyle jest pozycji (boss w trybie drużynowym **zajmuje** jedną z nich, nie dokłada siódmej).

  **Kto dostaje którą pozycję, generator już nie rozstrzyga.** `mapgen` stawia stolice na pierwszych `playerCount` pozycjach i nadaje im `capitalOf: i`; przypisanie graczy do tych pozycji robi `newGame()`. W FFA jest to wprost `CAPITAL_SPOTS[id]` (kolejność maksymalizująca rozrzut), ale w grze drużynowej ta sama kolejność sadzałaby sojuszników w przeciwległych rogach — najdalej od siebie i najbliżej wroga. Dlatego przy realnym sojuszu `assignTeamPositions()` (`state.js`) rozdaje **ten sam zbiór pozycji** tak, by suma dystansów wewnątrz drużyn była najmniejsza (przegląd zupełny, najwyżej 720 permutacji). Zbiór się nie zmienia, więc **mapa dla danego seeda jest identyczna** niezależnie od układu drużyn.

  Konsekwencja dla nazw: `mapgen` nazywa stolicę `PLAYERS_DEF[i].name` po **indeksie pozycji**, a przy zamkniętych slotach i bossie numer imperium przestaje odpowiadać wierszowi lobby — dlatego `newGame()` po wygenerowaniu mapy podmienia nazwy stolic na nazwy faktycznych właścicieli.
- **Zwykłe miasta**: `CITY_COUNT = 16`, losowane spośród wolnych pól lądowych (przetasowanych przez `shuffle`), z regułą **minimalnego odstępu `hexDist < 3`** od każdego innego miasta (w tym stolic) — zapobiega klastrowaniu miast w jednym miejscu.
- Każde miasto (stolica i zwykłe) dostaje `buildType: DEFAULT_UNIT_TYPE` (`'infantry'`) — domyślny typ jednostki produkowanej, dopóki gracz/AI go nie zmieni (patrz [Gospodarka](05-Gospodarka.md)).

## 4. Porty

`recomputePorts()` oznacza jako port **każde miasto sąsiadujące bezpośrednio z wodą** (dowolny z 6 sąsiadów jest polem wodnym). To jedyny warunek bycia portem — nie ma osobnego etapu "budowania" portu przez gracza. Porty umożliwiają armiom wypłynięcie na morze (patrz `canStep` w [Mechanice rozgrywki](04-Mechanika-rozgrywki.md)).

## 5. Gwarancja spójności świata (`ensureCapitalConnectivity`)

To najbardziej złożona część generatora — zapobiega sytuacji, w której czyjaś stolica ląduje na wyspie odciętej od reszty świata, co czyniłoby grę niewygrywalną dla tego gracza (i dla botów próbujących go zaatakować).

Algorytm (do 8 przebiegów, każdy powtarza całą analizę od nowa, bo naprawa jednej stolicy może zmienić graf):

1. **`floodFillComponents`** dzieli siatkę osobno na spójne obszary lądu i osobno wody (BFS po sąsiedztwie heksów) — każdy heks dostaje numer swojej "wyspy"/"akwenu".
2. Wyznacza **"główny" ląd** — ten z największą liczbą stolic (przy remisie: większy obszarem).
3. **`buildPortGraph`** buduje graf osiągalności: z lądu na wodę można wypłynąć **tylko z portu**, ale z wody na ląd można wylądować **z dowolnego wybrzeża** (asymetria odzwierciedlająca realne zasady ruchu z `canStep`).
4. **`canReachLand`** (BFS po tym grafie) sprawdza, czy z lądu danej stolicy da się dotrzeć (w obie strony) do głównego lądu.
5. Jeśli któraś stolica jest odcięta:
   - Jeśli jej ląd **dzieli jakikolwiek wspólny akwen** z głównym lądem — naprawa to dostawienie portów po obu stronach tego akwenu (`forcePortNear`, na istniejącym mieście jeśli jest w zasięgu, inaczej tworzy nowe miasto-port na wybrzeżu).
   - Jeśli lądy **nie dzielą żadnego akwenu** (np. odcięte jeziorko) — jedyna pewna naprawa to **most lądowy**: `carveLandBridge` znajduje najkrótszą parę pól między dwoma lądami i zamienia linię heksów między nimi (`hexLine`, interpolacja we współrzędnych kostkowych) na ląd.
6. Po każdej naprawie porty są przeliczane od nowa (`recomputePorts`), bo mogły dojść nowe miasta-porty.

## 6. Złoża surowców

`RESOURCE_COUNT = 6` złóż, losowane wśród wolnych pól lądowych, z zasadami odstępu: min. `hexDist < 2` od miast i `hexDist < 3` między sobą. **Typ złoża wynika z `t.shade`** (losowa wariacja terenu z etapu generacji siatki, zakres -1..1):

- `shade < -0.45` → kopalnia (`mine`)
- `shade > 0.15` → pole uprawne (`farm`)
- pozostały zakres → szyb naftowy (`oil`)

Wszystkie trzy typy dają dziś identyczny bonus produkcji (+1) — rozróżnienie jest obecnie czysto kosmetyczne/wizualne (inny sprite), patrz [Gospodarka](05-Gospodarka.md).

## 7. Linia brzegowa (do renderowania)

Na koniec generacji każde pole lądowe zapamiętuje, z których z 6 kierunków sąsiaduje z wodą (`t.coast`, tablica indeksów kierunków) — używane w `render.js` do rysowania piany na krawędzi wybrzeża. Każde pole wodne sąsiadujące z lądem dostaje `t.shallow = true` — płycizna, rysowana jaśniejszym sprite'em niż głębokie morze.
