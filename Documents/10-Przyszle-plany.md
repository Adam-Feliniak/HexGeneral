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

- 🟡 **AI słabo domyka wygrane pozycje (stalemate)** — priorytet, potwierdzony pomiarem.
  W serii 300 gier `normal` vs `normal` (`tools/sim.js`, seedy 1–300, limit 500 rund)
  **40% partii nie kończy się w limicie** — dobija do capa bez rozstrzygnięcia, mediana
  długości ~348 rund. To nie wariancja: przy równych AI połowa gier grzęźnie, bo bot
  nie potrafi przełamać ostatniej obrony i dobić stolicy wroga (turtling po obu
  stronach). Bias pozycji przy tym n mieści się w szumie (~1,5σ), więc realny problem
  to *domykanie*, nie asymetria stron.

  Gdzie w kodzie: ocena ruchów w `aiPickMove` (`ai.js`) — progi ataku
  (`aggressionThreshold`) i wagi w `aiTargets` sprawiają, że przy wyrównanych siłach
  atak na miasto/stolicę rzadko przekracza próg opłacalności, a obrońca dostaje bonus
  miejski (`resolveBattle`: ×1,15/×1,25) i wsparcie sąsiadów — więc front zastyga.

  Kierunki do zbadania (przez runner, mierząc odsetek remisów jako metrykę):
  koncentracja sił na jednym kierunku zamiast rozpraszania; premia za oblężenie
  (skumulowany nacisk kilku armii na to samo miasto); mechanizm przełamujący pat
  (rosnąca desperacja/agresja przy przeciągającej się grze albo przy przewadze
  terytorialnej); rewizja bonusu obronnego miast, jeśli okaże się zbyt silny.
  Walidacja: ta sama seria 300 gier powinna po zmianie pokazać wyraźnie niższy odsetek
  remisów bez rozjechania balansu 50/50.
- 🟡 **Scenariusze / mapy z celami** — inne warunki zwycięstwa niż eliminacja (utrzymaj
  X tur, zdobądź konkretne miasto). Nadbudowa nad istniejącym generatorem i seedem.
- 🔴 **Dyplomacja (multi / AI)** — sojusze, zawieszenie broni, wspólny wróg.
- 🟡 **Tryb kooperacyjny (drużyny)** — ludzie (i/lub boty) w stałym sojuszu grający
  przeciw wspólnemu wrogowi. Prostszy, „zamrożony" wariant dyplomacji (powyżej) — zamiast
  dynamicznych paktów po prostu przypisanie drużyny przy zakładaniu gry.

  Uwaga projektowa: to, co początkowo wyglądało na „dwa tryby", to naprawdę **dwie
  niezależne decyzje**, i lepiej trzymać je osobno:
  1. **Kształt strony wroga** — jeden boss czy zwykła obsada osobnych przeciwników.
  2. **Trudność** — suwak mnożnika produkcji wroga. To *parametr*, nie tryb: działa
     niezależnie od kształtu strony wroga (i nadaje się jako ogólny handicap trudności
     także poza co-opem). Suwak podnosi trudność, ale sam nie tworzy „wyjątkowego wroga" —
     to dwie różne rzeczy.

  **Fundament (wspólny dla wszystkiego): szkielet drużyn.** Pojęcie drużyny w stanie
  gracza (`state.js`); brak friendly-fire i przechodzenie przez pola sojusznika
  (`combat.js` / `empire.js` — walka i zajmowanie pól ignorują sojuszników); warunek
  zwycięstwa liczony na drużyny, nie pojedynczych graczy (`checkGameOver` w `empire.js`
  dziś kończy grę przy jednym żywym imperium — musiałby kończyć przy jednej żywej
  drużynie); AI traktujące sojuszników jak swoich, a nie cele (`aiTargets` w `ai.js`);
  przypisanie drużyn w lobby (`menu.js`, `renderSpSetup` / `renderMpSetup`) + nowe klucze
  i18n. Ten szkielet od razu daje wariant **„osobne imperia w sojuszu, wspólne
  zwycięstwo"** (gracze jako drużyna vs zwykła obsada botów, sojusz trwa do końca gry —
  bez „ostatniego żywego z drużyny") praktycznie za darmo.

  **Nadbudowa: super-wróg (ten „wyjątkowy wróg").** Pojedynczy bot w osobnym kolorze
  (czarny) jako flagowy wariant co-opa. Tańszy niż sojusz wielu botów — jedno imperium,
  więc AI nie musi koordynować sprzymierzeńców (koordynacja to już krok w stronę 🔴
  dyplomacji). Wymaga dodatkowo: nowego koloru i sprite'ów super-bota (`PLAYERS_DEF`
  w `config.js` + `PLAYERS` w `tools/gen-sprites.js`, regeneracja `assets/`) oraz suwaka
  produkcji (patrz niżej). Dwa haczyki, których sam mnożnik nie załatwia:
  - **Mnożnik daje wroga *bogatszego*, niekoniecznie *groźniejszego*.** Przy znanym
    problemie domykania gier (pozycja „AI słabo domyka wygrane pozycje" wyżej — 40%
    remisów) super-bot z produkcją ×3 może po prostu turtlować z gigantycznym stosem
    i dalej nie dobijać. Żeby boss faktycznie napierał, mnożnik powinien iść **w parze
    z agresją** — spina się to z „Osobowościami AI" (niżej) i z pozycją o stalemate.
  - **Mnożnik zderza się z limitami.** Produkcja miasta i `MAX_ARMY` / cap garnizonu
    sprawią, że nadmiar skumulowany w jednym mieście się zmarnuje — mnożnik trzeba
    rozłożyć na miasta bossa (albo podnieść mu capy), inaczej ×3 daje realnie ×~1,3.
    Wpięcie w `produce()` (`roads.js`).
- 🟡 **Osobowości AI** — agresywny / obronny / ekspansywny zamiast samego skalowania
  liczb w `AI_DIFFICULTY_PRESETS`.

## Jakość życia i prezentacja

- 🔴 **Zapis i wczytywanie gry** — obecnie brak formatu zapisu (patrz sekcja
  „Versioning" w `CLAUDE.md`). Fundament pod wiele innych rzeczy, ale wymaga formatu
  serializacji stanu i strategii migracji między wersjami.
- 🟢 **Ręczne kończenie tury (bez auto-oddawania po wyczerpaniu ruchów)** — dziś po
  wykorzystaniu wszystkich ruchów tura sama się kończy: `input.js` (okolice linii 63)
  odpala `requestEndTurn()` przez `setTimeout(..., 350)`, gdy `state.movesLeft <= 0`.
  Odbiera to graczowi okno na decyzje niezależne od puli ruchów — wybór produkcji miast,
  rozpoczęcie / kierunek budowy drogi, przypisanie złoża (`supplyCity`) czy samo
  obejrzenie planszy po ostatnim ruchu. Propozycja: usunąć auto-oddawanie (turę kończy
  wyłącznie gracz przyciskiem / Enterem) albo wystawić to jako opcję w ustawieniach.
  Zmiana lokalna w `input.js` — reszta pętli tur (`requestEndTurn` / `endTurn`
  w `turns.js`) już obsługuje ręczne kończenie.
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

- ✅ **Wsadowy runner AI-vs-AI** — **zrealizowane** w `tools/sim.js` (równoległe,
  deterministyczne, z trybem `--mirror` znoszącym bias pozycji). Zamienia „jeden dziwny
  wynik to pewnie wariancja" (patrz [06-Sztuczna-inteligencja.md](06-Sztuczna-inteligencja.md))
  w twarde dane do balansu. Opis w [09-Przewodnik-developera.md](09-Przewodnik-developera.md).
- ✅ **Optymalizacja `aiPickMove` (wydajność)** — **zrealizowane** (v0.2.1, ~2,2×
  szybciej): cache miast dla `moraleAt` na czas oceny ruchów, siła własna liczona tylko
  dla kandydatów bitewnych, hoisting dystansów do celów, `reachableMoves` na wskaźnikach
  poprzedników. Metoda: wyłącznie zmiany behavior-preserving — zachowana sekwencja
  wywołań RNG, zweryfikowane bitową identycznością wyników 540 gier `sim.js` przed/po.
  Pozostały kierunek na przyszłość (świadomie pominięty, bo zmienia decyzje AI):
  ograniczenie skanu celów do okolic frontu — do rozważenia razem z pracą nad
  zachowaniem AI (stalemate wyżej).
- 🟡 **Minimapa** — przy proceduralnych mapach szybko robi się przydatna, zwłaszcza
  z mgłą wojny.
- 🔴 **Multiplayer sieciowy** — jeśli obecny tryb multi to hotseat, gra online to osobny,
  duży kierunek (zależny od formatu zapisu stanu).

## Dwa tryby złożoności (prosty / złożony)

Zamiast pełnego systemu modułów z dowolnymi przełącznikami — **dwa gotowe tryby**
wybierane przy zakładaniu gry:

- **Prosty** — obecny rdzeń rozgrywki (ląd, 3 typy jednostek, drogi, złoża). Wersja
  kanoniczna, którą realnie się balansuje.
- **Złożony** — rdzeń **plus** dodatkowe systemy: budynki, technologie, a docelowo
  lotnictwo. Opcjonalny nadzbiór dla graczy chcących większej głębi.

Dlaczego dwa tryby zamiast rejestru modułów:

- **Tańsze.** Dowolne przełączniki to 2^N konfiguracji do przetestowania i ogrania
  przez AI. Dwa tryby to dwie konfiguracje — zwykła flaga (np. `state.complex`)
  bramkująca kilka systemów. To sprowadza koszt z 🔴 do 🟡.
- **Prostsza decyzja dla gracza** — jeden wybór zamiast listy checkboxów.

Zasady projektowe (ważne, żeby to się nie rozjechało):

1. 🟡 **Złożony = nadzbiór prostego, nie drugi ruleset.** Rdzeń balansujesz raz;
   w trybie złożonym tylko *doklejasz* systemy. Dwa rozjeżdżające się zestawy reguł
   to dwie gry do utrzymania.
2. **Prosty jest kanoniczny.** To wersja dla większości graczy i punkt odniesienia
   balansu; złożony jest opt-in i nie dzieli uwagi po połowie.
3. **Skład trybu złożonego rośnie etapami.** Najpierw budynki + technologie (spójna,
   tańsza paczka „głębszej gospodarki”), lotnictwo dopiero potem — to najdroższy
   pojedynczy system (nowa domena + obsługa w AI), więc nie powinno blokować startu
   trybu złożonego.

- 🟡 **UI wyboru trybu w lobby** — przełącznik prosty/złożony na ekranie zakładania gry
  (`menu.js`, `renderSpSetup`/`renderMpSetup`), zapisywany do stanu nowej rozgrywki.
  Nowe klucze i18n w `locales/*.json`.

Uwaga architektoniczna: AI musi respektować wybrany tryb (nie planować lotnictwa
w trybie prostym), a ewentualny przyszły format zapisu powinien zapisywać wybór trybu
razem ze stanem gry — inaczej wczytana partia mogłaby zmienić reguły w locie.

---

## Rekomendowana kolejność

1. ✅ **Wsadowy runner AI-vs-AI** — **zrobione** (`tools/sim.js`). Odblokowuje mierzalny
   balans dla wszystkiego dalej.
2. **Linie zaopatrzenia / atrycja** — nadbudowa nad istniejącym `moraleAt()` (liczy już
   dystans do najbliższego własnego miasta), więc relatywnie tanio zmienia decyzje
   gracza (nagradza przecinanie szlaków wroga).
3. **Modyfikatory terenu w walce** — uwaga: wymaga *najpierw* dodania typów terenu
   w `mapgen.js` i renderze (dziś kafelek ma tylko `land`/`shade`), dopiero potem mnożnik
   w `armyPowerAt()`. Większe niż się wydaje, ale domyka taktykę.
4. **Mgła wojny** — najbardziej „gra robi się inna" pomysł, ale największy zakres
   (render + AI + input).
5. Duże kierunki (rozwój morski, tryb złożony z budynkami/technologiami, lotnictwo)
   dopiero na fundamencie powyższych.

Zasada przekrojowa: im więcej z powyższych systemów, tym większa wartość **systemu
modułów** — warto wprowadzić go, zanim dołoży się drugi–trzeci opcjonalny system, żeby
każdy kolejny pisać od razu jako włączalny/wyłączalny, a nie przerabiać wstecz.
