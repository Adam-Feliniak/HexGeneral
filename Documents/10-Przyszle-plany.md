# Przyszłe plany

Zbiór pomysłów na rozwój gry — kandydaci do przyszłych wersji, a nie opis
istniejącego stanu. W przeciwieństwie do pozostałych dokumentów w tym folderze
(które opisują faktyczny kod), ten plik jest listą propozycji. Każda pozycja ma
zaznaczony orientacyjny koszt względem obecnej architektury, żeby ułatwić wybór
kolejności prac.

Legenda kosztu:
- 🟢 **niski** — mieści się w istniejących strukturach (np. `UNIT_TYPES`, generator sprite'ów), niewiele plików do ruszenia.
- 🟡 **średni** — dotyka kilku warstw (logika + render + UI), ale bez zmiany fundamentów.
- 🔴 **wysoki** — nowa warstwa/fundament (format zapisu, mgła wojny) dotykająca renderu, AI i inputu naraz.

---

## Mechanika walki i jednostek

- 🟢 **Nowe typy jednostek** — najtańszy kierunek, bo istnieje już system `UNIT_TYPES`
  (`config.js`) i proceduralny generator sprite'ów (`tools/gen-sprites.js`). Kandydaci:
  - jednostka inżynieryjna — buduje drogi/mosty taniej lub szybciej,
  - zwiadowca — duży ruch, słaba siła, odkrywa mapę (synergia z mgłą wojny),
  - obrona przeciwpancerna / przeciwlotnicza — kontra na czołgi.
- 🔴 **Mgła wojny (fog of war)** — widoczne tylko okolice własnych jednostek i miast.
  Mocno zmienia odczucie gry, ale dotyka renderu, AI (musi grać z niepełną informacją)
  i inputu. Otwiera realną rolę zwiadu i zasadzek.
- 🟡 **Okopanie / fortyfikacje** — jednostka stojąca kilka tur w miejscu dostaje bonus
  obronny; miasta mogłyby mieć poziomy umocnień.
- 🟡 **Modyfikatory terenu w walce** — wzgórza/las = +obrona, przekraczanie rzeki/brzegu
  = kara. Jeśli jeszcze ich nie ma, mocno pogłębiają taktykę na istniejącej mapie.

## Gospodarka i rozbudowa

- 🟡 **Poziomy / rozbudowa miast** — miasto można ulepszać (więcej produkcji, wyższy
  limit garnizonu). Kolejny cel do wydawania punktów obok dróg.
- 🟢 **Nowy surowiec / typ produkcji** — np. złoże dające bonus badawczy albo lokalny,
  rozbudowa istniejącego systemu `resource`.
- 🔴 **Prosty tech-tree / globalne ulepszenia** — odblokowania (lepszy pancerz, tańsze
  drogi) dające długoterminową progresję w dłuższych partiach.

## Mapa i świat

- 🟡 **Kilka rozmiarów mapy** — wybór mała / średnia / duża zamiast sztywnego
  `MAP_W`/`MAP_H` z `config.js`. Rozmiar wpięty w zakładanie gry (`menu.js`, lobby),
  z sensownym doborem liczby miast/złóż i pozycji stolic pod skalę (`CAPITAL_SPOTS`,
  `generateMap()`). Trzeba zweryfikować, że render i geometria nie zakładają nigdzie
  stałych wymiarów.
- 🟡 **Różne kształty mapy** — nie tylko prostokąt: np. archipelag (dużo wysp i morza),
  pangea (jeden zwarty ląd), przesmyk/kontynenty. To warianty/parametry `generateMap()`
  dobrze grające z rozwojem morskim (archipelag wymusza żeglugę) i z mgłą wojny.
- 🟢 **Podgląd / reroll mapy w lobby** — możliwość podejrzenia i przelosowania seeda
  (mechanika seeda już istnieje w `state`/`mapSeed`) przed startem, zwłaszcza gdy dojdą
  rozmiary i kształty.

## Tryby i AI

- 🟡 **Scenariusze / mapy z celami** — inne warunki zwycięstwa niż eliminacja (utrzymaj
  X tur, zdobądź konkretne miasto). Nadbudowa nad istniejącym generatorem i seedem.
- 🔴 **Dyplomacja (multi / AI)** — sojusze, zawieszenie broni, wspólny wróg.
- 🟡 **Osobowości AI** — agresywny / obronny / ekspansywny zamiast samego skalowania
  liczb w `AI_DIFFICULTY_PRESETS`.

## Jakość życia i prezentacja

- 🔴 **Zapis i wczytywanie gry** — obecnie brak formatu zapisu (patrz sekcja
  „Versioning" w `CLAUDE.md`). Fundament pod wiele innych rzeczy, ale wymaga formatu
  serializacji stanu i strategii migracji między wersjami.
- 🟡 **Cofnięcie ostatniego ruchu (undo)**, interaktywny samouczek, statystyki po partii.
- 🟡 **Dźwięk / muzyka** — na `file://` audio trzeba zainline'ować (np. jako data-URI),
  ale jest to wykonalne.

## Grafika i animacje

Podniesienie oprawy wizualnej — z zachowaniem zasady „bez builda". Cały pixel-art
powstaje proceduralnie w `tools/gen-sprites.js` i jest commitowany do `assets/`, więc
poprawki grafiki to zmiany w generatorze + regeneracja + commit PNG-ów (patrz
[07-Grafika-i-sprite-y.md](07-Grafika-i-sprite-y.md)).

- 🟡 **Bogatsze, bardziej szczegółowe sprite'y** — więcej detalu i klatek na jednostkę,
  warianty terenu (kilka wariantów lasu/wzgórz zamiast jednego), cieniowanie i obrys.
  Rozbudowa funkcji malujących w `tools/gen-sprites.js`; koszt to głównie robota
  artystyczna, architektura już to udźwignie (rejestracja w `loadSprites()` w
  `src/sprites.js`).
- 🟡 **Animacje jednostek i terenu** — sprite'y wieloklatkowe (chód, strzał, bezruch),
  animowana woda/wybrzeże, dym z miast. Wymaga klatek w generatorze i pętli animacji
  w renderze (istnieją już `anims`, `floaters`, `effects`, `lastFrame` w `state.js`
  oraz `frame()`/`draw()` w `render.js`, więc jest na czym budować).
- 🟡 **Bogatsze efekty walki i ruchu** — animowane trafienia, eksplozje, ślady po
  drodze, płynne przesuwanie jednostek między heksami zamiast skoku. Nadbudowa nad
  istniejącym systemem `effects`/`floaters`.
- 🟢 **Animacje jako opcja (wydajność / dostępność)** — przełącznik „animacje: wł/wył”
  (a najlepiej moduł w [systemie modułów](#system-modułów-customizacja-rozgrywki)),
  z pełnym fallbackiem na wersję statyczną. Ważne dla słabszego sprzętu, redukcji
  ruchu (dostępność) i szybkich symulacji AI-vs-AI, gdzie render i tak jest zbędny.

Uwaga: przy wieloklatkowych sprite'ach rośnie rozmiar `assets/` w repo (brak builda =
wszystko commitowane). Warto pilnować liczby klatek/rozdzielczości, żeby repo nie
spuchło.

## Rozwój morski

Osobny, spójny kierunek rozbudowy — z „morza jako przeszkody" w pełnoprawną
warstwę rozgrywki. Obecnie istnieją już porty i żegluga (jednostki lądowe wchodzą
na wodę), więc jest na czym budować.

- 🟡 **Szlaki morskie** — morski odpowiednik dróg: sieć heksów wodnych dająca bonus do
  ruchu / zaopatrzenia między portami. Analogicznie do `roads.js` (per-heks marker
  `{owner}`, sieć = sąsiadujące heksy tego samego właściciela), ale na wodzie i
  z zaczepieniem o porty.
- 🟢 **Jednostki morskie** — nowe wpisy w `UNIT_TYPES` z tymi samymi statystykami co
  lądowe (siła, ruch, weterancja, morale), ograniczone do heksów wodnych. Kandydaci:
  - okręt transportowy — przewozi jednostki lądowe (zastępuje/rozszerza obecną żeglugę),
  - okręt bojowy — kontrola morza, ostrzał wybrzeża,
  - okręt zwiadowczy — duży zasięg (synergia z mgłą wojny).
  Wymaga też sprite'ów morskich w `tools/gen-sprites.js`.
- 🟢 **Nowe surowce morskie** — złoża na heksach wodnych (np. podmorska ropa, łowiska),
  rozbudowa istniejącego systemu `resource` o wariant wodny wpięty w porty i szlaki
  morskie, na wzór lądowego `supplyCity`.

Kolejność wewnątrz tego kierunku: najpierw **jednostki morskie** (najtańsze, dają od
razu grywalność na wodzie), potem **surowce morskie**, na końcu **szlaki morskie**
(spinają całość w sieć zaopatrzenia). Warto rozważyć wspólnie z mgłą wojny — morze
naturalnie eksponuje wartość zwiadu.

## Domeny i ruch

- 🔴 **Lotnictwo / jednostki powietrzne** — trzecia domena po lądzie i morzu (myśliwiec,
  bombowiec, rozpoznanie). Domyka triadę, ale to duży zakres: zasięg operacyjny, przelot
  nad każdym terenem, osobna logika przechwytu.
- 🟡 **Linie zaopatrzenia / atrycja** — jednostki odcięte od sieci dróg/miast słabną
  z turami. Dobrze łączy się z istniejącą siecią dróg i nagradza przecinanie szlaków
  wroga zamiast tylko bicia armii wprost.
- 🟡 **Mosty / przeprawy** — element terenu i cel dla jednostki inżynieryjnej; wpina się
  w ewentualne modyfikatory rzek w walce.

## Dynamika świata

- 🟡 **Pogoda / pory roku** — modyfikatory ruchu i walki (błoto, mróz, sztorm blokujący
  morze). Tania warstwa losowości zmieniająca tempo bez nowych systemów.
- 🟡 **Zdarzenia losowe** — bunty w świeżo podbitych miastach, dezercje przy niskim
  morale, bonusowe złoża. Wpina się w istniejące morale i podboje.

## Narzędzia i meta

- 🟢 **Wsadowy runner AI-vs-AI** — narzędzie w `tools/` odpalające N gier headless
  i zbierające win-rate. Zamienia „jeden dziwny wynik to pewnie wariancja" (patrz
  [06-Sztuczna-inteligencja.md](06-Sztuczna-inteligencja.md)) w twarde dane do balansu.
  Najtańsza rzecz z realną wartością dla dalszego rozwoju.
- 🟡 **Minimapa** — przy proceduralnych mapach szybko robi się przydatna, zwłaszcza
  z mgłą wojny.
- 🔴 **Multiplayer sieciowy** — jeśli obecny tryb multi to hotseat, gra online to osobny,
  duży kierunek (zależny od formatu zapisu stanu).

## System modułów (customizacja rozgrywki)

Klamra spinająca całą tę listę: zamiast wciskać każdy nowy system na sztywno, wiele
z nich (lotnictwo, technologie, pogoda, dyplomacja, zdarzenia losowe, rozwój morski…)
byłoby **modułami**, które gracz włącza/wyłącza przy zakładaniu rozgrywki. Efekt:
każdy dobiera złożoność pod siebie — od czystej wersji lądowej po pełną grę ze
wszystkim.

- 🔴 **Rejestr modułów** — każdy opcjonalny system deklaruje się jako moduł (np. flaga
  w `config.js`), a kod odwołujący się do niego sprawdza, czy jest aktywny. Wymaga
  dyscypliny: nowe systemy pisane od początku jako włączalne/wyłączalne, z sensownym
  zachowaniem, gdy moduł jest OFF (np. brak lotnictwa = brak jednostek powietrznych
  w `UNIT_TYPES`, w produkcji miast i w celach AI).
- 🟡 **UI wyboru modułów w lobby** — lista przełączników na ekranie zakładania gry
  (`menu.js`, `renderSpSetup`/`renderMpSetup`), zapisywana do stanu nowej rozgrywki.
  Każdy moduł to nowe klucze i18n w `locales/*.json`.
- 🟢 **Presety** — kilka gotowych zestawów (np. „Klasyczna", „Pełna", „Tylko ląd”),
  żeby nie zmuszać gracza do klikania każdego przełącznika.

Uwaga architektoniczna: AI musi respektować aktywne moduły (nie planować lotnictwa,
gdy wyłączone), a ewentualny przyszły format zapisu powinien zapisywać wybór modułów
razem ze stanem gry — inaczej wczytana partia mogłaby zmienić reguły w locie.

---

## Rekomendowana kolejność

1. **Nowy typ jednostki** lub **modyfikatory terenu w walce** — najtańsze względem
   architektury (istnieją `combat.js`, `UNIT_TYPES`, generator sprite'ów), a dużo
   zmieniają w odczuciu gry.
2. **Mgła wojny** — najbardziej „gra robi się inna" pomysł, ale większy zakres
   (render + AI + input).
3. Reszta wg tego, czy priorytetem jest głębsza taktyka na mapie, głębsza gospodarka,
   czy nowe tryby rozgrywki.

Zasada przekrojowa: im więcej z powyższych systemów, tym większa wartość **systemu
modułów** — warto wprowadzić go, zanim dołoży się drugi–trzeci opcjonalny system, żeby
każdy kolejny pisać od razu jako włączalny/wyłączalny, a nie przerabiać wstecz.
