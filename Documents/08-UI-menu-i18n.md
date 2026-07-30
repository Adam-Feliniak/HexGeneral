# UI, menu i tłumaczenia

## Ekrany

Cała nawigacja steruje się jednym polem `state.screen`, a `applyScreen()` (`menu.js`) po prostu chowa/pokazuje odpowiedni kontener `<div>` w `index.html` ustawiając atrybut `hidden`:

| `state.screen` | Kontener HTML | Opis |
|---|---|---|
| `'menu'` | `#menu-main` | Ekran startowy: Kontynuuj (gdy istnieje autozapis; dynamiczna etykieta z numerem tury przez `refreshMainMenu`) / Pojedynczy gracz / Gra wieloosobowa / Samouczek / Zapis gry / Opcje / Wyjście + wybór języka |
| `'sp-setup'` | `#menu-sp-setup` | Lobby single-player: **tryb Gram/Oglądam** (`setup.spectate`), liczba botów, trudność, seed mapy. „Oglądam" startuje `newGame({ humanCount: 0, ... })` — sami botowie; `kickOffAiGame()` (menu.js) odpala pierwszą turę AI, bo nie ma tury człowieka, która by ją napędziła |
| `'mp-setup'` | `#menu-mp-setup` | Lobby multiplayer: połączenie (hot-seat / internet — nieaktywny), szybkie układy, **tabela slotów** (obsada + trudność + drużyna na slot), seed, limit czasu na turę |
| `'tutorial'` | `#menu-tutorial` | Statyczny ekran "Jak grać?" — pełna lista zasad (ta sama treść co zwijana pomoc w grze, patrz niżej) |
| `'save'` | `#menu-save` | Ekran „Zapis gry": pole tekstowe do skopiowania zapisu (Pokaż zapis → Ctrl+C) lub wklejenia i wczytania (Ctrl+V → Wczytaj); logika w `save.js`, obsługa w `menu.js` |
| `'options'` | `#menu-options` | Domyślny seed i domyślna trudność botów dla przyszłych gier; wyciszenie i trzy suwaki głośności (ogólna / muzyka / efekty) — patrz [Dźwięk](14-Dzwiek.md). Uwaga na niespójność utrwalania: głośność idzie do `localStorage` (`hexgeneral.audio`), a seed i trudność żyją tylko w `state.options` na czas sesji |
| `'game'` | `#app` | Właściwa plansza gry (canvas + sidebar) |

Autozapis: gra zapisuje się do `localStorage` na początku każdej tury człowieka
(`startTurn` w `turns.js`) i przy wyjściu do menu przyciskiem „Menu główne";
rozstrzygnięcie partii kasuje autozapis (`checkGameOver` w `empire.js`). Uwaga na
`#menu-continue`: etykieta jest dynamiczna (numer tury), więc przycisk celowo NIE
ma atrybutu `data-i18n` — po zmianie języka odświeża go `applyI18n` przez
`refreshMainMenu`.

Ekran końca gry (`#overlay`) nie jest osobnym `state.screen` — to nakładka sterowana niezależnie przez `showOverlay()`/`hideOverlay()` (`ui.js`), pokazywana nad aktualnym ekranem gry, gdy `checkGameOver()` stwierdzi koniec rozgrywki.

## Wspólne komponenty lobby (`menu.js`)

Formularze single/multi/opcje współdzielą kilka generycznych "rendererów" wybieralnych grup przycisków, wywoływanych po każdej zmianie (pełny rebuild `innerHTML`, klasa `.selected` na aktywnym przycisku):

- **`renderDifficultyGroup`** — Easy/Normal/Hard/Nightmare + "Custom" (odsłaniający suwak 0–100%, interpolowany między Easy a Nightmare).
- **`renderSeedGroup`** — Losowy (od razu losuje i pokazuje konkretną liczbę) / Własny (odsłania pole liczbowe, ograniczone do `SEED_MAX_DIGITS = 6` cyfr, `clampSeedInput` przycina wpisywany tekst na bieżąco).
- **`renderLangPicker`** — PL/EN/DE, zapisuje wybór w `localStorage` i natychmiast odświeża cały widoczny tekst (`applyI18n`).

Ograniczenia liczby graczy: multiplayer to `MAX_PLAYERS = 6` slotów, z których każdy może być zamknięty (min. 2 otwarte, min. 2 różne drużyny — inaczej partia nie miałaby warunku końca i Start jest zablokowany); single-player 1–5 botów (`SP_BOT_COUNT_OPTIONS`).

### Tabela slotów w lobby multiplayer

Skład partii ustawia się jak w potyczce z serii Command & Conquer: sześć wierszy, w każdym
trzy listy rozwijane — **obsada** (Człowiek / Bot / Boss / Zamknięty), **trudność**
(Łatwy / Normalny / Trudny / Koszmar) i **drużyna** (A–F).
Renderują ją `renderMpSlots` / `renderMpTransport` / `renderMpPresets` (`menu.js`), a stan
siedzi w `state.mpSetup.slots` (przeżywa między grami jak reszta ustawień lobby).

**Trudność jest per slot, nie per partia.** Osobnego pola „Trudność botów" w tym lobby
już nie ma: każdy bot (i boss) może mieć własny poziom, więc jeden wspólny wybornik byłby
kłamstwem. Kolumna jest wyłączona dla slotów Człowiek i Zamknięty (pokazuje „—"). Skutek
uboczny: **w lobby multi nie ma trudności „Custom" z suwakiem** — procent zostaje w lobby
single i w Opcjach (jako domyślny poziom, który spływa na sloty AI przez `applyOptionsToSetups`).
Silnik obsługiwał trudność per gracz od zawsze (`player.difficulty`, `resolveDifficulty`),
więc zmiana dotyczy lobby, nie mechaniki. Stopka paska bocznego pokazuje teraz trudność
tylko wtedy, gdy wszystkie boty mają tę samą — inaczej zostaje sam seed, bo poziom stoi
i tak przy każdym graczu na liście.

Trzy rzeczy warto tu wiedzieć:

- **„Tryb bossa" to nie osobny ekran ani tryb gry**, tylko slot o obsadzie `Boss` —
  jeden z trzech przycisków *szybkiego układu* (Każdy na każdego / Ludzie kontra boty /
  Tryb bossa) po prostu przestawia tabelę. Boss jest najwyżej jeden: wybór drugiego
  degraduje poprzedniego do zwykłego bota. Uzasadnienie tej decyzji —
  [02-Architektura-i-pliki.md](02-Architektura-i-pliki.md#sloty-drużyny-i-boss).
- **Barwa i nazwa wiersza idzie z jego pozycji** (`PLAYERS_DEF[i]`), a u bossa z jego
  własnego wpisu. To `skin`, nie `id` — zamknięcie slotu przesuwa numerację imperiów
  w grze, ale nie kolory w lobby.
- **Przełącznik połączenia** ma pozycję „Przez internet (wkrótce)" celowo **wyłączoną**:
  transportu sieciowego nie ma, a pole `state.transport` trzyma dla niego miejsce
  w stanie i w zapisie (patrz [15-Silnik-i-przenosnosc.md](15-Silnik-i-przenosnosc.md)).

## Sidebar gry (`#sidebar`, aktualizowany przez `updateUI()`)

- **`#turn-info`** — numer tury, licznik pozostałych ruchów (`5/5`), timer (tylko multi z limitem czasu, kolor `.low` gdy ≤10s).
- **`#ai-speed-field`** — przełącznik tempa ruchów AI (1×/4×/16×, `state.aiSpeed` dzieli `thinkDelay` w `aiStep`); widoczny tylko gdy w grze są boty. `aiSpeed` to preferencja sesji — przeżywa „Nową mapę" i wczytanie zapisu, ale nie jest częścią samego zapisu.
- **`#players`** — lista wszystkich imperiów: kropka w kolorze gracza, ikona 👤/🤖/💀 (boss), nazwa (+ znacznik "(Ty)" w single, + litera drużyny, gdy w grze są realne sojusze — w FFA byłaby szumem, więc się nie pojawia, + odznaka trudności dla botów), statystyki `🏛 miasta ⛏ złoża ⚔ łączna siła 💰 produkcja/turę` (produkcja przez `playerProduction()` z `roads.js`). Wiersz aktywnego gracza podświetlony (`.active`), martwi gracze przekreśleni i przygaszeni (`.dead`).

Statystyki są pokazywane dla **wszystkich** imperiów, także wrogich — gra działa na pełnej informacji (nie ma mgły wojny), a te wartości i tak dają się policzyć z widocznej planszy. Konsekwencja świadoma: przy botach widoczna produkcja ujawnia mnożnik ekonomii z presetu trudności (stolica na Koszmarze pokaże więcej niż +3). Zasada, którą to porządkuje: **pokazujemy to, co strukturalne i wyliczalne z planszy, ukrywamy to, co ulotne i niewyliczalne** — dlatego punkty ruchu jednostki widać tylko dla własnych armii (patrz `tileTooltip` w `input.js`).
- **`#log`** — ostatnie 10 komunikatów (`state.log`, max 40 trzymanych w pamięci), np. zdobycia miast, wyniki bitew, aneksje.
- **`<details id="help">`** — zwijana lista zasad gry (identyczna treść co ekran samouczka w menu głównym — **treść jest zduplikowana w dwóch miejscach `index.html`**, każda zmiana kopii tekstu pomocy musi być wprowadzona w obu).
- **`#seed-footer`** — numer seeda bieżącej mapy (+ trudność botów, jeśli są jacyś).

## Panel produkcji (`#build-panel`)

Osobny, warunkowo widoczny panel pod planszą (nie w sidebarze) — pokazuje się po kliknięciu we własne miasto. Pełny opis mechaniki w [Gospodarce](05-Gospodarka.md); tutaj tylko strona UI: panel jest technicznie **zawsze obecny w layoucie** (rezerwuje swoją wysokość), a chowanie/pokazywanie realizowane jest klasą `.build-panel-empty` (`visibility: hidden`), nie atrybutem `hidden` — dzięki temu canvas planszy nie zmienia rozmiaru za każdym razem, gdy panel się pojawia/znika (co powodowałoby widoczny "skok" mapy).

## Tooltip i skróty klawiszowe (`input.js`)

Najechanie myszą na dowolne pole pokazuje tooltip (`tileTooltip`) składający linie tekstu warunkowo: teren/właściciel, miasto (+ port), złoże (+ status drogi: zaopatruje / przerwana / brak), armia (typ + siła + morale), podpowiedź wyboru imperium (tylko gdy `canPickEmpire()`). Skróty: **Enter** — koniec tury, **Esc** — odznacza zarówno wybraną armię, jak i wybrane miasto (chowa panel produkcji).

## System i18n

### Dlaczego jest tak zbudowany

Gra otwiera się bezpośrednio z `file://`, gdzie `fetch()` plików JSON jest blokowany przez przeglądarki ze względów bezpieczeństwa. Dlatego tłumaczenia **nie są ładowane dynamicznie** — są wkompilowane w zwykły `<script>` tak samo jak reszta kodu.

### Przepływ danych

```
locales/pl.json, locales/en.json, locales/de.json   ← źródło prawdy, edytowane ręcznie
              ↓  node tools/build-locales.js
src/locales-data.js   ← WYGENEROWANY plik, const I18N_DATA = {...}, NIGDY nie edytować ręcznie
              ↓  wczytywany jako zwykły <script> w index.html
src/i18n.js   ← i18n.t(key, vars), i18n.setLanguage(), applyI18n()
```

`tools/build-locales.js` po prostu wczytuje trzy pliki JSON i zapisuje je jako sformatowany `JSON.stringify` wewnątrz stałej JS — deterministyczna, bezstratna operacja, ale **musi być uruchomiona ręcznie po każdej zmianie** `locales/*.json`.

### Użycie w kodzie

```js
i18n.t('tooltip.army', { type: '...', player: '...', str: 12, morale: 85 })
```

Podstawianie zmiennych to proste `str.split('{{key}}').join(value)` (bez żadnej biblioteki templatek). Brakujący klucz w aktualnym języku **spada na polski** (`I18N_FALLBACK = 'pl'`, źródło prawdy), a jeśli i tam go nie ma — funkcja zwraca **sam klucz** zamiast pustego stringa, żeby brak tłumaczenia był od razu widoczny w UI, a nie cicho znikał.

### Statyczny tekst w HTML

Elementy oznaczone atrybutem `data-i18n="klucz"` dostają swój `textContent` z tłumaczenia, a `data-i18n-html="klucz"` — swój `innerHTML` (używane tam, gdzie tekst zawiera znaczniki `<b>`, np. w liście pomocy). `applyI18n()` przelatuje po wszystkich takich elementach przy starcie gry i przy każdej zmianie języka, a dodatkowo re-renderuje aktualnie widoczny ekran lobby/gry (bo te renderują tekst dynamicznie przez JS, nie przez atrybuty `data-i18n`).

### Język zapamiętywany między sesjami

`i18n.setLanguage()` zapisuje wybór w `localStorage` (`hexgeneral.lang`), odczytywane przy starcie (`i18nInit`, wywoływane automatycznie na końcu `i18n.js`). Zabezpieczone `try/catch` na wypadek trybu prywatnego przeglądarki, gdzie `localStorage` bywa niedostępny.
