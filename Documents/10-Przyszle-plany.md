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

  **Uwaga na rozproszoną widoczność informacji o wrogu.** Dziś gra działa na pełnej
  informacji i **każde miejsce decyduje samo za siebie**, co ujawnia: panel boczny
  (`ui.js`) pokazuje dla wszystkich graczy liczbę miast, złóż, łączną siłę i produkcję;
  tooltip armii podaje siłę i morale cudzych jednostek; tooltip miasta jego produkcję;
  tooltip złoża — które miasto zaopatruje. Osobno tooltip punktów ruchu jest już
  ograniczony do własnych jednostek (bo to informacja ulotna i niewyliczalna z planszy,
  w odróżnieniu od reszty, którą da się policzyć z widocznego stanu).

  Wprowadzenie mgły wymaga więc **jednego wspólnego predykatu** („czy gracz widzi
  szczegóły tego pola/gracza") użytego przez wszystkie te miejsca. Inaczej logika
  ujawniania rozlezie się po `input.js` i `ui.js`, i któreś miejsce na pewno zostanie
  pominięte — co jest gorsze niż brak mgły, bo tworzy wyciek informacji trudny do
  zauważenia.
- 🟡 **Okopanie / fortyfikacje** — jednostka stojąca kilka tur w miejscu dostaje bonus
  obronny; miasta mogłyby mieć poziomy umocnień.
- 🟡 **Typy terenu (koszt ruchu + modyfikatory walki)** — wzgórza/las = +obrona i droższe
  wejście, przekraczanie rzeki/brzegu = kara. **Potaniało po v0.5.0:** system punktów ruchu
  wprowadził już tabelę kosztów wejścia na pole (`moveCostStep` w `combat.js`), a reguła
  „pełna pula zawsze pozwala na jedno pole" jest właśnie rezerwą pod koszt 3+, więc nowy
  teren to dopisanie wierszy do tabeli plus mnożnik w `armyPowerAt()`. Brakującą częścią
  zostaje samo **wygenerowanie i narysowanie** terenu (`mapgen.js` + render — dziś kafelek
  zna tylko `land`/`shade`/`shallow`).

## Gospodarka i rozbudowa

- 🟡 **Poziomy / rozbudowa miast** — miasto można ulepszać (więcej produkcji, wyższy
  limit garnizonu). Kolejny cel do wydawania punktów obok dróg.
- 🟢 **Nowy surowiec / typ produkcji** — np. złoże dające bonus badawczy albo lokalny,
  rozbudowa istniejącego systemu `resource`.
- 🔴 **Prosty tech-tree / globalne ulepszenia** — odblokowania (lepszy pancerz, tańsze
  drogi) dające długoterminową progresję w dłuższych partiach.
- 🟡 **System monopoli surowcowych** (do przemyślenia) — kontrola nad wieloma złożami
  tego samego typu daje bonus powiązany z typem jednostki. Pomysł ma naturalne
  odwzorowanie, bo **liczba typów złóż i typów jednostek jest ta sama**:

  | Złoże | Jednostka | Uzasadnienie |
  |---|---|---|
  | `farm` | piechota | żywność i rekruci |
  | `oil` | czołg | paliwo |
  | `mine` | artyleria | stal i amunicja |

  Wartość dla rozgrywki: złoża przestają być tylko „+1 do produkcji", a stają się celami
  o znaczeniu strategicznym. Utrata jednego złoża **łamie monopol**, więc pojawia się
  motyw rajdu na zaplecze i obrony zaplecza — czyli dokładnie ten rodzaj decyzji, którego
  grze dziś brakuje.

  **Twardy prerekwizyt: dziś to nie zadziała, bo typy złóż są losowe.** `mapgen.js`
  przypisuje typ wyłącznie po `t.shade` (`t.resource = t.shade < -0.45 ? 'mine' : t.shade > 0.15 ? 'farm' : 'oil'`),
  bez żadnego wyrównywania. Zmierzone na 400 mapach przy `RESOURCE_COUNT = 6`:

  | Typ | Średnio | Min | Map z mniej niż 2 |
  |---|---|---|---|
  | `farm` | 2,47 | 0 | 21,0% |
  | `oil` | 1,85 | 0 | 40,0% |
  | `mine` | 1,68 | 0 | **45,8%** |

  **Tylko na 12,5% map każdy typ ma co najmniej 2 sztuki.** Bonus „za dwie farmy" byłby
  więc na większości map nieosiągalny dla części typów, a do tego niesymetryczny (farmy
  najłatwiejsze, kopalnie najrzadsze). Pierwszym krokiem musi być **gwarantowany rozkład
  typów w `mapgen.js`** — np. rozdanie po równo z resztą losowo, zamiast wyliczania z szumu.

  Pytania do rozstrzygnięcia, zanim to ruszy:
  - **Próg czy pełny monopol?** Przy 6 złożach i 3 typach „dwie sztuki" *jest* pełnym
    monopolem, więc dziś te pojęcia się zlewają. Próg musi skalować się z liczbą złóż,
    inaczej pozycja „kilka rozmiarów mapy" go zepsuje.
  - **Bonus w produkcji czy w walce?** Produkcja (taniej/szybciej) jest tania i bezpieczna.
    Mnożnik bojowy dotyka `armyPowerAt`, a więc i wyceny ruchów AI — wymaga przestrojenia
    balansu i serii przez `sim.js`.
  - **Wymagać podłączenia drogą?** Dziś złoże daje +1 tylko podłączone do sieci
    (`supplyCity`). Monopol liczony od samego posiadania byłby prostszy, ale rozjechałby
    się z istniejącą zasadą — a liczony od podłączenia robi z dróg wymóg, nie opcję.
  - **AI musi to rozumieć**, inaczej człowiek dostaje darmową przewagę: `aiTargets` wycenia
    już złoża, ale trzeba podbić wagę złoża domykającego monopol i tego, które monopol
    wroga łamie.
  - **Stan monopolu wyliczać, nie zapisywać** — da się policzyć z `state.tiles`, więc
    `SAVE_FORMAT` zostaje nietknięty.
  - UI: gracz musi widzieć, co ma i ile brakuje (panel boczny), inaczej mechanika jest
    niewidzialna.

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
- 🟡 **Rzeki i mosty** — rzeka jako naturalna linia obrony i wąskie gardło ruchu, mosty
  jako punkty, o które warto się bić. Wraz z „liniami zaopatrzenia" i „przecinaniem
  szlaków" daje grze geografię, której dziś nie ma: mapa jest jednorodnym lądem, więc
  front nie ma się o co zaczepić.

  **Kluczowa decyzja projektowa: rzeka jako krawędź, nie jako heks.** Rzeka-heks jest
  banalna do zrobienia (kolejny typ terenu), ale zjada pola i wygląda jak kanał zamiast
  rzeki. Rzeka na **krawędzi** między dwoma polami jest tym, czym rzeka faktycznie jest —
  i to dokładnie pasuje do obecnego kodu ruchu:

  > `moveCostStep(from, to, playerId)` przyjmuje **oba** pola, bo koszt przejścia
  > ląd↔woda i tak jest właściwością krawędzi, nie kafelka. Koszt przeprawy przez rzekę
  > wpina się w tę samą sygnaturę, bez zmiany kształtu funkcji.

  Refaktor ruchu z v0.5.0 zrobił więc połowę roboty. Do zrobienia zostaje:
  - dane: zbiór krawędzi z rzeką per kafelek (wzorem istniejącego `coast[]`, które już
    trzyma indeksy krawędzi stykających się z wodą — ten sam wzorzec, gotowy do skopiowania),
  - generowanie w `mapgen.js` (rzeka jako ścieżka od wnętrza do wybrzeża) i render
    krawędzi w `render.js`,
  - koszt przeprawy w `moveCostStep` plus most jako krawędź z rzeką, ale bez kary,
  - modyfikator obronny przy walce **przez** rzekę (`armyPowerAt` musi wtedy wiedzieć,
    z której strony następuje atak — dziś nie dostaje tej informacji),
  - **`SAVE_FORMAT` do podbicia** (nowe pole kafelka wpływające na rozgrywkę),
  - budowa mostu jako cel punktów produkcji, naturalnie obok `roadProject` w `roads.js`;
    droga przecinająca rzekę powinna wymagać mostu.

  Wchłania dotychczasową pozycję „Mosty / przeprawy" z sekcji *Domeny i ruch*.

## Tryby i AI

- ✅ **AI słabo domyka wygrane pozycje (stalemate)** — **zrealizowane w dwóch
  iteracjach** (v0.2.2 + v0.2.3): remisy w serii referencyjnej 300 gier `normal` vs
  `normal` spadły z **40,0% do ~7%** (iteracja 1: eskalacja+oblężenie → 24,7%;
  iteracja 1.1: ekonomia — zbieranie niczyich miast i podział ról wg siły → ~7%),
  mediana długości z ~348 do ~122 rund, drabinka trudności i balans stron
  nienaruszone. Mechanizm (bezstanowy, w `aiPickMove`,
  opisany w [06-Sztuczna-inteligencja.md](06-Sztuczna-inteligencja.md)): eskalacja
  progów ataku bramkowana przewagą materialną + stolica-cel z polem BFS po lądzie +
  szturm falowy ze strefą zborną (zamiast karmienia obrońców pojedynczo dowożonymi
  armiami) + premia szturmowa na obrońców blokujących dojście. Bonusy obronne miast
  celowo nietknięte (decyzja projektowa: trudno wykończyć gracza = feature).

  Pozostałe ~7% remisów to głębsze przypadki (twierdze w ciasnych przesmykach,
  wzajemne rajdy na stolice) — ewentualna kolejna iteracja wymagałaby prawdopodobnie
  planu trzymanego między turami (`aiPlan`) albo desantów morskich (niżej); pomiar
  wykluczył korelację z udziałem wody na mapie jako główną przyczyną.
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
- 🟢 **AI realnie budujące drogi** — obserwacja z rozgrywek, potwierdzona w kodzie:
  `aiAssignCityProject` (`ai.js`) buduje drogi tylko z miast daleko od frontu (>2 od
  wrogiego terytorium — w miarę zbliżania się granic przestaje budować w ogóle),
  z szansą ledwie 20%/turę (`AI_ROAD_BUILD_CHANCE`) i wyłącznie do złóż (max
  `RESOURCE_COUNT` = 6 na mapie) — nigdy miasto–miasto. Bot nie ma więc sieci, którą
  buduje człowiek: traci bonus ruchu (czołg +2 na drodze — szybszy dowóz sił, synergia
  z domykaniem gier wyżej) i spójną gospodarkę. Kierunek: budowa dróg miasto–miasto,
  wyższa/warunkowa szansa, priorytet dla połączeń zaplecze→front.
- 🟡 **Desanty morskie AI** — obserwacja z rozgrywek: AI technicznie umie wchodzić na
  wodę (`canStep` z portu), ale marsz karze morze i bot nie ma pojęcia „przeprawy do
  celu za wodą" — nigdy nie robi desantu. Na mapach z długą linią brzegową odcina to
  AI od naturalnych manewrów oskrzydlających (i od części twierdz — patrz pozycja
  o domykaniu gier). Wymaga planowania wieloetapowego (port → morze → lądowanie),
  więc dobrze łączy się z ewentualnym stanem `aiPlan` między turami i z rozwojem
  morskim (sekcja niżej).

## Jakość życia i prezentacja

- ✅ **Zapis i wczytywanie gry** — **zrealizowane** (v0.3.0, `src/save.js`): autozapis
  do `localStorage` na początku tury człowieka i przy wyjściu do menu, „Kontynuuj"
  w menu głównym, eksport/import zapisu jako tekst JSON (ekran „Zapis gry",
  kopiuj/wklej). Jawny kodek z polem `SAVE_FORMAT` (bramka kompatybilności; migracje
  świadomie odłożone do po 1.0) — opis w
  [02-Architektura-i-pliki.md](02-Architektura-i-pliki.md). Otwiera drogę pod undo,
  scenariusze i cloud save. Nie ma ręcznych slotów (do rozważenia przy realnej
  potrzebie).
- ✅ **Ręczne kończenie tury (bez auto-oddawania po wyczerpaniu ruchów)** —
  **zrealizowane** (v0.4.2): usunięte auto-oddawanie z `input.js` (`setTimeout(...,
  350)` przy `state.movesLeft <= 0`). Turę człowieka kończy wyłącznie przycisk / Enter,
  więc po ostatnim ruchu zostaje okno na decyzje niezależne od puli ruchów — produkcja
  miast, budowa drogi, przypisanie złoża, obejrzenie planszy. Wariant „opcja
  w ustawieniach" świadomie pominięty: nikt nie chciałby wracać do auto-oddawania,
  a ekran Opcje i tak jest do rozbudowy osobno.
- 🟡 **Cofnięcie ostatniego ruchu (undo)**, interaktywny samouczek, statystyki po partii.
- ✅ **Dźwięk / muzyka** — **iteracja 1 zrobiona** (v0.6.0, `src/audio.js`): 8 efektów
  i dwie pętle chiptune, wszystko **syntezowane proceduralnie w runtime**, zero plików
  audio w repo. Przewidywanie „trzeba zainline'ować jako data-URI" okazało się niepotrzebne:
  na `file://` blokowane jest tylko `fetch()`/`decodeAudioData`, a `ctx.createBuffer()`
  z wypełnieniem próbek to czysta arytmetyka. Kluczowa korzyść przy wydaniu komercyjnym:
  `LICENSE` zostaje bez zmian, bo nie ma cudzych assetów. Opis w
  [14-Dzwiek.md](14-Dzwiek.md), strojenie przez `tools/gen-sounds.js`.
  **Iteracja 2:** dźwięk startu tury (pierwszy kandydat — to rytm gry), osobne brzmienia
  per typ jednostki, zaokrętowanie/desant, ukończenie drogi, produkcja, timer tury w multi.

### Drobne zaległości (niski priorytet)

Rzeczy zauważone przy okazji innych prac. Wszystkie są **tanie** i żadna nie psuje
rozgrywki — stąd niski priorytet, mimo niskiego kosztu. Nie blokują ani testów
zewnętrznych, ani Early Access.

- 🟢 **Niespójne utrwalanie ustawień w Opcjach** — głośność (dodana w v0.6.0) przeżywa
  odświeżenie strony, bo idzie do `localStorage` (`hexgeneral.audio`), a `defaultSeed`
  i `defaultDifficulty` z tego samego ekranu **giną**, bo żyją tylko w `state.options`
  na czas sesji. Na jednym ekranie jedno działa, drugie nie. Naprawa: utrwalić cały
  `state.options` pod własnym kluczem, wzorem `i18n.js` (z `try/catch` na tryb prywatny)
  i odczytać go w `defaultOptions()` (`state.js`).
- 🟢 **Kolizja palety graczy pod daltonizmem** — `PLAYERS_DEF` (`config.js`) ma `#d64550`
  (czerwony, domyślny gracz ludzki) i `#3fae62` (zielony, gracz 3), czyli klasyczny
  konflikt przy deuteranopii — najczęstszej postaci daltonizmu. Sprawdzone w kodzie, nie
  hipoteza. Naprawa: przesunąć jeden z odcieni albo dodać drugi nośnik informacji obok
  koloru (kształt/symbol przy kropce gracza i na jednostkach), co jest odporniejsze
  niż samo strojenie palety. Powiązane z pozycją „animacje jako opcja" niżej — obie są
  z obszaru dostępności.
- 🟢 **(opcjonalne) Osobny kolor pól desantu i załadunku w podświetleniu zasięgu** —
  *sam zasięg jest poprawny* i nie wymaga zmian: `render.js` iteruje wprost
  `validMoves(sel)`, więc podświetlenie wydłuża się wzdłuż drogi i skraca nad wodą
  automatycznie (sprawdzone). Luka jest wyłącznie w **czytelności**: pole, na które
  wejście zżera całą pulę punktów ruchu (zaokrętowanie z portu, desant na brzeg),
  wygląda identycznie jak zwykły krok, mimo że konsekwencja taktyczna jest zupełnie
  inna. Wrogie pola mają już swój kolor (czerwony), te nie mają żadnego wyróżnika.
  Zmiana lokalna w bloku podświetleń `render.js` (~10 linii): warunek
  `isEmbarkStep(sel, n)` i trzeci wariant kolorystyczny — proponowany odcień morski,
  żeby nie kolidował z białym zasięgiem, czerwonym wrogiem ani złotym wyborem trasy
  drogi. Wybór kolorystyki to decyzja estetyczna, nie poprawka błędu.

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
- 🟡 **Mosty / przeprawy** — przeniesione do pozycji „Rzeki i mosty" w sekcji
  [Mapa i świat](#mapa-i-świat), bo most bez rzeki nie ma sensu.

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
3. **Typy terenu** — po v0.5.0 połowa fundamentu już stoi: tabela kosztów wejścia
   (`moveCostStep`) przyjmuje nowe wartości bez refaktoru, a reguła „pełna pula zawsze
   pozwala na jedno pole" chroni piechotę przed nieprzejezdnym terenem. Zostaje generowanie
   i render terenu (`mapgen.js` — dziś kafelek ma tylko `land`/`shade`/`shallow`) oraz
   mnożnik w `armyPowerAt()`. Domyka taktykę i wreszcie wykorzystuje system MP.
4. **Mgła wojny** — najbardziej „gra robi się inna" pomysł, ale największy zakres
   (render + AI + input).
5. Duże kierunki (rozwój morski, tryb złożony z budynkami/technologiami, lotnictwo)
   dopiero na fundamencie powyższych.

Zasada przekrojowa: im więcej z powyższych systemów, tym większa wartość **systemu
modułów** — warto wprowadzić go, zanim dołoży się drugi–trzeci opcjonalny system, żeby
każdy kolejny pisać od razu jako włączalny/wyłączalny, a nie przerabiać wstecz.
