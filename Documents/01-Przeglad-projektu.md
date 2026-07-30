# Przegląd projektu

## Czym jest Hex General

Hex General to własna, turowa strategia heksagonalna 2D. Gracz (i konkurujące z nim boty) podbijają mapę złożoną z heksagonalnych pól, zdobywając miasta i stolice przeciwników, aż zostanie jedno imperium. Grafika utrzymana jest w stylu pixel-art nawiązującym do *Metal Slug* — jednostki, budynki i teren to sprite'y z wyraźnym czarnym konturem, militarno-arkadowy interfejs, eksplozje jako animowane sprite-sheety.

Projekt jest własną grą — **nie jest klonem ani nie jest inspirowany** żadną konkretną istniejącą grą o podobnej nazwie; wszelkie podobieństwa nazwy są przypadkowe i nie powinny być tak opisywane w dokumentacji czy komunikacji o projekcie.

## Filozofia "bez builda"

To kluczowa decyzja architektoniczna, która wpływa na cały kod:

- **Brak bundlera, brak `npm install`, brak `package.json` z zależnościami runtime.** Grę uruchamia się, otwierając `index.html` bezpośrednio w przeglądarce (protokół `file://`).
- Ponieważ `file://` blokuje `fetch()` (m.in. z powodów bezpieczeństwa przeglądarek), **wszystko musi być wkompilowane w zwykłe pliki `<script>`**:
  - Logika gry: zwykłe pliki `.js` w `src/`, bez `import`/`export` (moduły ES też bywają blokowane z `file://`).
  - Tłumaczenia: źródło to `locales/*.json`, ale gra faktycznie ładuje `src/locales-data.js` — wygenerowaną kopię tych JSON-ów jako stałą JS.
  - Grafika: sprite'y to gotowe pliki PNG w `assets/`, generowane raz przez skrypt Node (`tools/gen-sprites.js`) i **commitowane do repo** (bo nie ma etapu builda, który mógłby je wytworzyć przy starcie gry).
- Konsekwencja: **każda zmiana w `locales/*.json` wymaga ręcznego przebudowania** `src/locales-data.js` (`node tools/build-locales.js`), a każda zmiana w generatorze sprite'ów — ręcznego przebudowania `assets/*.png` (`node tools/gen-sprites.js`). Oba kroki opisane szczegółowo w [Przewodniku developera](09-Przewodnik-developera.md).

## Struktura repozytorium (poziom najwyższy)

```
index.html          punkt wejścia — <script>-i ładujące src/*.js w konkretnej kolejności
style.css            cały styl wizualny (arkadowy HUD, pixel-art, kafelkowe tło)
README.md            krótki opis + tabela plików (skrót tego, co tu jest rozwinięte)
src/                 logika gry i UI (patrz 02-Architektura-i-pliki.md)
locales/             źródłowe pliki tłumaczeń: pl.json, en.json, de.json
assets/              wygenerowane sprite'y PNG (jednostki, teren, budynki, efekty)
tools/               skrypty Node uruchamiane ręcznie: gen-sprites.js, build-locales.js
```

## Jak uruchomić grę

Nie ma serwera ani kroku instalacji. Wystarczy otworzyć `index.html` w przeglądarce (podwójne kliknięcie w Eksploratorze plików albo `file://` w pasku adresu).

## Tryby rozgrywki

Gra ma dwa tryby, wybierane w lobby:

- **Pojedynczy gracz (single)** — jeden człowiek + 0–5 botów AI. Przed pierwszym ruchem w turze 1 gracz może kliknąć **dowolną stolicę** na mapie, żeby zamiast domyślnego imperium zagrać tym (mechanika `canPickEmpire`/`switchHuman` w `input.js`) — porzucone imperium przechodzi wtedy pod sterowanie AI.
- **Wieloosobowy (multi, hot-seat)** — do 6 imperiów przy jednym urządzeniu, grających na zmianę: ludzie i boty w dowolnym układzie. Skład ustawia **tabela slotów** (obsada + drużyna na slot, jak w potyczce z serii Command & Conquer), więc jeden ekran obsługuje trzy różne partie:
  - **każdy na każdego** — klasyczne FFA, każdy w swojej drużynie,
  - **co-op** — ludzie w jednej drużynie przeciw botom. Sojusznicy nie walczą ze sobą i nie zabierają sobie pól, ale imperia zostają osobne (produkcja, morale, drogi i limity armii dalej per gracz); wygrywa **drużyna**,
  - **tryb bossa** — jeden przeciwnik w czarnych barwach (Czarna Legia) z premią do produkcji i do agresji naraz, przeciw drużynie graczy. Boss nie jest osobnym trybem gry, tylko obsadą slotu.

  Tryb ma opcjonalny limit czasu na turę (`TURN_TIME_LIMIT_OPTIONS`: 60s / 120s / bez limitu). W lobby jest już miejsce na **grę przez internet**, na razie nieaktywne (patrz [Silnik i przenośność](15-Silnik-i-przenosnosc.md)).

W obu trybach każdy gracz-bot ma przypisany poziom trudności AI (Easy/Normal/Hard/Nightmare albo suwak "Custom" 0–100%, patrz [Sztuczna inteligencja](06-Sztuczna-inteligencja.md)); premia bossa nakłada się na wybrany poziom, więc suwak trudności działa także w trybie bossa.

## Cel gry

Zdobyć stolice wszystkich przeciwników. Zajęcie cudzej stolicy **anektuje całe jej imperium** — wszystkie pola, miasta i złoża pokonanego gracza natychmiast przechodzą pod zwycięzcę (`conquerEmpire` w `empire.js`), więc gra kończy się szybciej niż przy stopniowym wykruszaniu pojedynczych pól. Gra kończy się, gdy zostaje **jedna żywa drużyna** (zwycięstwo — w FFA każdy jest własną drużyną, więc to dokładnie „ostatnie żywe imperium") albo gdy w trybie single ginie cała drużyna człowieka (porażka).

## Mapa gry

Prostokątna siatka heksagonalna `23 × 14` pól (`MAP_W`/`MAP_H` w `config.js`), generowana proceduralnie z ziarna liczbowego (seed 0–999999) — ten sam seed zawsze daje tę samą mapę. Szczegóły algorytmu generacji w [Generowanie mapy](03-Generowanie-mapy.md).
