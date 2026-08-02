# Do zrobienia w 0.7.1

Lista robocza jednego wydania — znika po wypuszczeniu 0.7.1, a to, co z niej wyjdzie,
ląduje w `CHANGELOG.md`. Nie mylić z `Documents/10-Przyszle-plany.md` (katalog featureów
na roadmapę EA) ani z `Documents/11-Early-Access.md` (analiza gotowości produktu).

Dwie pierwsze pozycje pochodzą z **fali 0 testów zewnętrznych** (jedna testerka,
niedoświadczona w gatunku i w testowaniu; sesja 40 minut, jedna partia co-op przeciw
bossowi sprzed poprawek z `f25bceb`; obie uwagi padły spontanicznie). Trzecia jest
wewnętrzna. Kolejność prac: **1 → 2 → 3**.

---

## 1. Ścieżka dźwiękowa brzmi „jak dla dzieci"

**Uwaga testerki, dosłownie.** I nie jest to kwestia gustu — składniki widać w kodzie.
Ale nie tam, gdzie się ich najpierw szuka: **materiał wysokościowy jest w porządku**.
Motyw to midi `64-67-71-74`, czyli E-G-B-D — akord **molowy** (Em7), a bas chodzi
E → F → G → D, gdzie E-F to półton, czyli **skala frygijska**, jedna z ciemniejszych
w użyciu. Tonacji nie ma po co ruszać.

Dziecięcość robi troje czego innego:

- **`MUSIC_INSTRUMENTS.lead` to fala `square`** w rejestrze E4-D5 — tembr i wysokość,
  które same z siebie czytają się jako „chiptune dla dzieci". To największy pojedynczy
  składnik,
- **oom-pah**: bas siedzi na bitach parzystych, perkusja na nieparzystych, na zmianę,
  bez przerwy przez całą pętlę. Naprzemienność co bit przy 104 bpm to rytm polki,
  nie marszu,
- **melodia bez ani jednej pauzy** — równe nuty dwubitowe od początku do końca pętli,
  krok i arpeggio, jak wyliczanka.

**Ale i to celuje za nisko — cel się zmienił.** Adam nazwał brzmienie „8-bitowe / NES"
i wskazał **Metal Slug 2-3** jako punkt odniesienia. To nie jest opis kompozycji, tylko
architektury: cała muzyka gra dziś na **trzech** instrumentach (`triangle`, `square`,
`noise`) z jedną obwiednią, bez filtra, ADSR, FM i efektów — czyli dokładnie na zestawie
NES-a. Żadna zmiana tabeli nut tego nie ruszy.

Metal Slug to Neo Geo / YM2610: **kanały FM + próbki ADPCM**. Blachy, bas i leady są
syntezą FM (do zrobienia proceduralnie), a perkusja i głos lektora są nagraniami
(do podrobienia nie są). Stąd podział prac:

- **Decyzja podjęta: najpierw czysta synteza**, próbki dopiero gdyby po niej dalej
  brakowało konkretnie perkusji. Odwrotna kolejność każe łamać zasadę „zero plików
  audio", zanim wiadomo, czy to konieczne. Próbki, gdyby weszły, idą jako base64
  w pliku `.js` (nie przez `fetch()`, który `file://` blokuje) — ~70 KB przy buildzie
  196 KB.
- **Głos lektora („mission start") to osobne pytanie** — o treść, nie o syntezę.
  Albo nagranie/głos wygenerowany, albo świadomie robotyczny komunikat z syntezy
  formantowej. Nie mieszać z decyzją o muzyce.

### 1a. Dźwięki bojowe — ZROBIONE

Warstwa DSP dostała `svfSweep` (filtr rezonansowy z przemiataniem geometrycznym),
`saturate`, `addThump` i `reverbTail`; `finishBuffer` dostał blokadę składowej stałej.
Na tym przepisane `explosion`, `shot` i `move`. Wynik i trzy pułapki, które przy okazji
wyszły (poziomy miksu były życzeniami; kolejność pogłosu i saturacji wobec trzasku;
centroida mierzyła tylko atak) — w [14-Dzwiek.md](Documents/14-Dzwiek.md).

### 1b. Silnik muzyki — ZROBIONE

Muzyka renderuje się do bufora i gra jako zapętlony `BufferSource`, a nie jako graf
oscylatorów. Konsekwencja architektoniczna: `renderMusicLoop()` jest czystą funkcją,
więc narzędzie i gra liczą **ten sam** sygnał — problem „druga implementacja" zniknął,
a razem z nim część testów w `--selftest`, która go pilnowała.

Głosy: FM (lead), subtraktywna z filtrem rezonansowym i obwiednią (bas, pad),
syntezowany zestaw perkusyjny (stopa/werbel/hi-hat osobno). Tonacja bez zmian.
Koszt: ~440 ms na pętlę, raz na sesję, odłożone poza obsługę kliknięcia.
Szczegóły i pułapki (szew pętli, pogłos ze stanem, kwantyzacja długości do próbek)
— [14-Dzwiek.md](Documents/14-Dzwiek.md).

**Zostaje do rozważenia:** sekcja B (dziś jeden wzór 32-bitowy w kółko), nadpróbkowanie
stopni nieliniowych przy jaśniejszych barwach, i wciąż otwarte pytanie o głos lektora.

**Blokada narzędziowa — ZDJĘTA.** `tools/gen-sounds.js --music` renderuje pętle
z `MUSIC_TRACKS` do `dist/music/*.wav`, a `--tracks=<plik.js>` bierze tabelę nut spoza
`src/audio.js` — czyli porównanie wariantów nie wymaga już edytowania gry między
odsłuchami. Renderer odtwarza pasmowo ograniczone oscylatory Web Audio i automatykę
wzmocnienia z `musicVoice`, ma `--selftest` (15 sprawdzeń) i lintuje partyturę
(m.in. nuta z `b >= loopBeats`, która w grze nie zagra nigdy). Szczegóły:
[Documents/14-Dzwiek.md](Documents/14-Dzwiek.md#strojenie-muzyki).

> **Odsłuch A/B wykonany** — pętla z `dist/music/` brzmi tak samo jak w grze, więc
> render jest wiarygodną podstawą do wyboru wariantu. Powtórzyć dopiero po zmianie
> w rendererze albo w `musicVoice`/`musicTick`.

**Pytanie otwarte, blokujące generowanie wariantów:** do czego to ma brzmieć? Ponuro
i ciężko / sucho i sztabowo, prawie bez melodii / podniośle i marszowo, ale poważnie.
Bez tej jednej decyzji trzy warianty mogą zostać odrzucone razem.

Zakres: `src/audio.js` (`MUSIC_TRACKS`, `MUSIC_INSTRUMENTS`), `tools/gen-sounds.js`,
`Documents/14-Dzwiek.md`.

## 2. Miasta niewidoczne pod jednostkami — MECHANIZM ZROBIONY, WYGLĄD DO DOSTROJENIA

> **Stan po pierwszym podejściu:** sam pomysł zaakceptowany (znacznik przy krawędzi,
> rozróżnianie kształtem i położeniem, warstwa nad sprite'em a pod HUD-em), ale
> **konkretne wykonanie odrzucone** — obecny łuk się nie podoba. Do dostrojenia w kolejnej
> sesji: grubość, barwa, kształt i to, czy stolica ma być podwójnym łukiem. Kod jest tak
> ustawiony, że rusza się wyłącznie `drawTileMarks()` w `src/render.js` — kolejność
> rysowania i podział `drawArmy()` zostają bez zmian niezależnie od wybranego wyglądu.
> Warianty oglądać w `marker-preview.html` (przełącznik „przed/po" + arkusz 16 przypadków).

**Znacznik na krawędzi heksa: dolny łuk = miasto (podwójny = stolica), górny = złoże.**
Zgodnie z rozpisanym niżej kierunkiem — łuk przy krawędzi, promień 0,88 (żeby nie siadać na
obrysie heksa, pianie wybrzeża i granicy imperium), rozróżnianie kształtem i położeniem,
nie barwą, bo prawie każdy odcień jest już kolorem któregoś imperium. Linia ciągła, a
stolica dostaje drugi łuk do wewnątrz zamiast dłuższego obrysu — ten zlałby się z ramką
zaznaczenia (0,92) i hoveru (0,95). Złoża objęte tą samą zmianą.

**Kolejność rysowania musiała się rozjechać na trzy przebiegi**, i to jest sedno poprawki:
sprite'y armii → znaczniki → HUD armii. Pierwsza wersja szła na samym wierzchu i **zjadała
liczbę siły oraz pasek morale** — dolna krawędź heksa to jedyne czytelne miejsce na
znacznik, ale siedzą tam też liczba (x+9, y+19) i morale (x-17..x-1, y+15..y+19). Zasłonić
sprite wolno, zasłonić danych nie. Stąd `drawArmy()` rozpadło się na `drawArmySprite()`
i `drawArmyHud()`.

Weryfikacja: `marker-preview.html` — arkusz 16 przypadków (miasto/stolica/port × czołg/
piechota/artyleria, złoża, weteran, zaznaczenie, piana wybrzeża, kalka koloru właściciela,
puste pole jako kontrola) z przełącznikiem „przed/po". Oglądane w przeglądarce, bo żaden
harness headless nie sięga renderu.

<details>
<summary>Pierwotny opis zadania</summary>

**Uwaga testerki:** nie widziała, gdzie są miasta — szczególnie gdy stały na nich
jednostki. To nie jest przeoczenie gracza, tylko brak informacji na ekranie:
`draw()` (`src/render.js:345-347`) rysuje miasta w przebiegu kafli, a **wszystkie armie
w osobnym przebiegu na wierzchu**. Czołg (48×28 od `x-24, y-15`) jest szerszy niż miasto
(46×38 od `-23,-26`) i zjada mu dolną połowę. Nie zostaje żaden ślad: ani flagi, ani
obwódki, ani ikony — heks z miastem i jednostką wygląda jak pusty heks z jednostką.
Autor tego nie widzi, bo pamięta mapę.

**Kierunek:** znacznik na **krawędzi** heksa, nie w środku — krawędź to jedyne miejsce,
którego nie dosięga bounding box żadnego sprite'a jednostki, także przyszłej. Dwa
zastrzeżenia sprawdzone w kodzie:

- krawędź nie jest pusta: `drawTile` rysuje tam obrys 1px `rgba(90,70,30,0.35)`, kalkę
  koloru właściciela (30% na całym heksie) i pianę wybrzeża — znacznik miasta musi być
  wyraźnie inny, żeby się nie zlał;
- zaznaczenie jednostki rysuje własną ramkę (`selBox` + puls) — znacznik miasta nie może
  czytać się jako „zaznaczone".

**Przy okazji, ten sam błąd klasowo:** złoża też rysują się pod armią (`drawDecor`, komentarz
jest w kodzie wprost). Mniejsze (30×28), więc czasem wystają — ale problem jest ten sam.

**Świadomie poza zakresem:** poprawka palety pod daltonizm (`#d64550` vs `#3fae62`
w `PLAYERS_DEF`, P2 w `11-Early-Access.md`). Ta sama rodzina problemu — koduj informację
kształtem, nie samym kolorem — ale rusza paletę graczy i wymaga osobnej decyzji
o kolorach. Notatka na później, nie do doklejenia tutaj.

Zakres: `src/render.js`; weryfikacja ręczna w przeglądarce (Ctrl+F5), bo żaden harness
headless nie sięgnie renderu.

</details>

## 3. Fuzz drużyn i bossa w `tools/stress.js` — ZROBIONE

**Wynik: 500 partii fuzz bez naruszeń i bez wyjątków** — 34 różne układy: 152 składy starą
drogą (`humanCount`/`botCount`), 64 FFA ze slotów, 172 drużynowe (w tym 57 na trzy drużyny:
2v2v2, 2v2v1, 2v1v1) i 112 z bossem (w tym 28, w których boss miał sojusznika). 443/500
rozstrzygniętych, 604 tys. zajęć pola przeszło przez podsłuch reguł sojuszu. Do tego soak po
6 partii w każdym z układów `ffa/2v2/3v3/boss` z płaskim trendem heapu (< 1,2 MB przy
`--expose-gc`) i czasem rundy niezależnym od długości sesji. Rozkład układów sprawdza się
przez `node tools/stress.js --games=60 --shapes`. Szczegóły w
[09-Przewodnik-developera.md](Documents/09-Przewodnik-developera.md#harness-stabilnościowy-toolsstressjs).

**Przy okazji wyszedł realny błąd gry, nie harnessu:** w partii z bossem i jednym
człowiekiem klik w stolicę bossa w pierwszej turze zostawiał grę bez ani jednego gracza
(`switchHuman` nie rusza slotu `kind === 'boss'`, więc boss zostawał bossem, a człowiek
tracił imperium na rzecz nikogo). Naprawione w `src/input.js` — warunek wyboru imperium
siedzi teraz w jednej funkcji `canPickEmpireAt()`, wspólnej dla kliknięcia i tooltipa.
Kontrola negatywna: po cofnięciu poprawki fuzz łapie to jako `single: 0 ludzi zamiast
jednego` (seed 18).

**Trzy pułapki, które przy okazji wyszły** — pierwsze dwie dają zielony przebieg bez
pokrycia, trzecia zatrzymuje partię: (1) `normalizeSlots` po cichu NAPRAWIA niegrywalny
skład (jedna drużyna → rozbicie na FFA), więc fuzz porównuje realny skład z zamierzonym
i wypisuje rozkład składów; (2) podsłuch reguł sojuszu, który nie wszedł, wygląda
identycznie jak zero naruszeń, więc sprawdzana jest też tożsamość podmienionych funkcji;
(3) sterownik musiał zacząć wołać `kickOffAiGame()` po `newGame()` (jak każda ścieżka startu
w grze) — przy slotach pierwszy gracz nie musi być człowiekiem, a samo `newGame` nikogo
nie rusza, więc partia stoi w miejscu.

<details>
<summary>Pierwotny opis zadania</summary>

Wewnętrzne, nie od testerki. `stress.js` losuje konfigurację wyłącznie przez
`humanCount`/`botCount` (linie ~176-184) — **nigdy nie podaje `slots`**. Czyli cały kod,
który wszedł w 0.7.0 (drużyny, sojusze, boss, trudność per slot, zamknięte sloty), nie
jest objęty ani fuzzem, ani inwariantami, ani soakiem. Ślad tego jest w samych
inwariantach: warunek `phase=over przy N żywych (multi)` zakłada FFA — przy drużynach
zwycięstwo zostawia dwóch żywych, więc reguła jest napisana pod świat sprzed 0.7.0
i nie wybucha tylko dlatego, że fuzz nigdy nie tworzy drużyny.

`tools/team-check.js` (91 sprawdzeń) pokrywa drużyny scenariuszowo, ale nie losowymi
akcjami, nie zapisem/odczytem w środku partii i nie soakiem.

Do zrobienia: dorzucić `slots` do losowanej konfiguracji (FFA / 2v2 / 3v3 / boss /
zamknięte sloty), poprawić inwarianty pod drużyny (koniec gry liczony na drużyny, zero
pól i armii przechodzących między sojusznikami), przepuścić ~500 partii + soak.

**Termin: przed spakowaniem builda dla fali 1** (`node tools/pack-build.js --tag=...`),
nie przed pozycjami 1-2. Uwagi z fali 0 są twardszym sygnałem niż brak pokrycia testami.

</details>

---

Do odhaczenia przed samym wydaniem 0.7.1, niezależnie od powyższych: protokół smoke
z `Documents/12-Protokol-smoke.md` (obie pozycje 1-2 to zmiany renderu i audio, których
nie pokrywa żaden harness), `node tools/check-portability.js`, `node tools/team-check.js`,
bump `GAME_VERSION` w `src/config.js` + wpis w `CHANGELOG.md` w tym samym commicie.

**Wzorzec regresji wizualnej do przestawienia — świadomie odłożone.** Znaczniki miast
i złóż zmieniły piksele każdego heksa z miastem i złożem, więc zapisany wzorzec
`visual-test.html` już nie pasuje i do czasu przestawienia każdy przebieg będzie ścianą
fałszywych błędów. Przestawiać dopiero, gdy render przestanie się ruszać (`node tools/serve.js`
→ „Ustaw jako wzorzec") — robienie tego w trakcie pracy nad wyglądem tylko zabetonowałoby
stan pośredni.
