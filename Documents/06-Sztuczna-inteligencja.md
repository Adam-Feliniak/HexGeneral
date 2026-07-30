# Sztuczna inteligencja

Cała logika botów mieszka w `src/ai.js`. AI nie ma żadnego "wglądu" niedostępnego graczowi — operuje na tym samym `state`, tymi samymi funkcjami walki/ruchu co człowiek (`armyPowerAt`, `supportFor`, `validMoves`), więc jego oceny są bezpośrednio porównywalne z tym, co widziałby gracz w tooltipach.

## Poziomy trudności (`AI_DIFFICULTY_PRESETS`, `config.js`)

| Poziom | `economy` | `aggression` | `aggressionThreshold` | `thinkDelay` |
|---|---|---|---|---|
| Easy | 0.5 | 0.7 | 1.3 | 260 ms |
| Normal | 1.0 | 1.0 | 1.0 | 160 ms |
| Hard | 1.25 | 1.35 | 0.85 | 110 ms |
| Nightmare | 1.725 | 1.7 | 0.7 | 70 ms |

- **`economy`** — mnożnik produkcji siły (patrz [Gospodarka](05-Gospodarka.md)); Nightmare ma `1.725` zamiast "okrągłego" 1.5, żeby był wyraźnie najtrudniejszy (bazowe 1.5× dodatkowo pomnożone przez 1.15 handicapu ekonomicznego).
- **`aggression`** — mnożnik ważący wszystkie oceny ruchów bojowych (im wyższy, tym chętniej AI wybiera agresywne opcje względem defensywnych/marszowych).
- **`aggressionThreshold` (AT)** — mnożnik progów stosunku sił wymaganych do zaakceptowania ataku. **Niższy = atakuje przy gorszym stosunku sił** (Nightmare zaatakuje nawet przy przewadze przeciwnika, Easy potrzebuje wyraźnej przewagi).
- **`thinkDelay`** — opóźnienie (ms) między kolejnymi ruchami bota w tej samej turze (czysto kosmetyczne, żeby ruchy AI były widoczne, a nie natychmiastowe).

Trudność "Custom" (suwak 0–100%) interpoluje liniowo (`resolveDifficulty`) między presetami Easy i Nightmare dla wszystkich czterech parametrów naraz. Dostępna jest w lobby single i w Opcjach; lobby wieloosobowe ustawia **trudność osobno dla każdego slotu** (cztery presety), więc jeden bot może być Łatwy, a drugi Koszmarny w tej samej partii — `player.difficulty` był per gracz od zawsze, zmieniło się tylko to, że lobby wreszcie z tego korzysta.

### Boss — dwie reguły, których nie ma nikt inny

Zanim liczby: najważniejsze w bossie jest to, że **łamie dwie zasady obowiązujące
wszystkich pozostałych**. To jest różnica gatunkowa, a nie skala — bot z samymi
większymi mnożnikami zostaje botem, tylko bogatszym.

| Reguła | Gdzie | Co robi |
|---|---|---|
| **„Legion nie zna zaplecza"** | `moraleAt` (`combat.js`) | Morale bossa **nie spada z odległością** od jego miast: zawsze 100 na lądzie (85 na morzu — środowisko zostaje). Rajd 10 pól w głębi cudzego kraju jest dla niego tak samo skuteczny jak obrona własnej stolicy, choć dla obrońców robiących to samo nadal jest samobójstwem |
| **Linie wewnętrzne** | `moveCostStep` (`combat.js`) | Całe **własne terytorium** jest dla bossa drogą (koszt 1 zamiast 2), bez budowania czegokolwiek. Przerzuca siły między frontami dwa razy szybciej |

Obie wpięte przez `isBossPlayer()` (`state.js`), obie po jednej gałęzi. Uzasadnienie
doboru: to są odpowiedzi na dwa mechanizmy, które w tej grze najmocniej **hamują
ofensywę i karzą samotnego gracza** — kara morale za dystans (dlatego fronty zastygają)
oraz wspólna pula aktywacji, która rośnie z liczbą graczy w drużynie, a bossowi nie
(`ACTIVATIONS_PER_TURN = 5` ma każdy, więc dwoje ludzi wydaje 10 rozkazów na rundę).
Linie wewnętrzne nie dają mu więcej rozkazów, tylko sprawiają, że mniej ich marnuje
na marsz.

**Zmierzony rozkład zasług** (30 partii na wariant, te same seedy, boss przeciw drużynie
botów Normal). Cztery warianty tego samego przeciwnika: same mnożniki bez reguł, same
reguły bez mnożników, reguły z złagodzonymi mnożnikami (×1,25) i stan gry:

| Scenariusz | same liczby | same reguły | reguły + ×1,25 | **stan gry** |
|---|---|---|---|---|
| boss Easy vs 2 boty | 7% | 23% | 30% | **27%** |
| boss Normal vs 2 boty | 97% | 43% | 77% | **100%** |
| boss Normal vs 3 boty | 83% | 37% | 33% | **97%** |
| boss Normal vs 4 boty | 63% | 23% | 30% | **93%** |
| boss Normal vs 5 botów | 30% | 3% | 7% | **83%** |

Trzy wnioski, z których każdy zmienia decyzje projektowe:

1. **Mnożniki i reguły działają w innych miejscach skali.** Przy parze przeciwników
   wystarczają same liczby (97%), a reguły dokładają tylko 3 punkty. Przy pięciu jest
   odwrotnie: liczby dają 30%, a reguły podbijają to do 83% — **+53 punkty**. Reguły są
   ubezpieczeniem od bycia w mniejszości, nie ogólnym wzmocnieniem.
2. **Same reguły to za mało.** Bez premii ekonomicznej boss ma 43% przy dwóch
   przeciwnikach i 3% przy pięciu — nie nadrabiają one tego, że pięć imperiów ma pięć
   stolic, a on jedną.
3. **Dopiero razem dają płaską trudność 83–100% w zakresie 2–5 przeciwników.** Żaden
   składnik osobno tego nie robi (liczby lecą 97→30, reguły 43→3). To jest realnie
   najcenniejsza właściwość: sesja co-op zostaje **tak samo trudna niezależnie od tego,
   ile osób usiądzie do stołu** — a właśnie tego nie wiadomo z góry przy testach domowych.

Kolumna „reguły + ×1,25" tłumaczy, czemu nie ma tu prostego pokrętła pośredniego:
mnożnik 1,25 wpada **pod próg zaokrąglenia** (`Math.round(1 × 1,25) = 1`), więc zwykłe
miasta bossa produkują tyle co u każdego bota i wariant osuwa się z powrotem w okolice
„samych reguł". Sensowne wartości `economy` są w praktyce trzy: poniżej 1,5, w przedziale
1,5–2,49 i od 2,5 — a skalę reguluje się presetem trudności, nie `BOSS_MULT`.

### Mnożniki (`BOSS_MULT`)

Boss to **nie** kolejny wiersz w tabeli presetów, tylko mnożniki nałożone na wybrany
preset (`playerDifficulty(p)` w `config.js` — jedno miejsce prawdy, bo wołają je
i produkcja, i pętla decyzji AI):

| Parametr | Mnożnik | Po co |
|---|---|---|
| `economy` | ×1.6 | boss ma z czego stawiać armie |
| `aggression` | ×1.4 | żeby faktycznie napierał |
| `aggressionThreshold` | ×0.85 | atakuje przy gorszym stosunku sił |

Premia ekonomiczna **musi** iść w parze z agresją: sam mnożnik produkcji daje wroga
*bogatszego*, niekoniecznie *groźniejszego* — bot potrafi okopać się z jednym wielkim
stosem i nie dobijać. Zmierzone na 30 partiach (samotnik kontra dwa boty Normal
w drużynie, ten sam układ slotów): **23% wygranych samotnika bez premii → 97% z premią**.

**Uwaga przy strojeniu: `economy` działa skokowo, nie płynnie.** `cityGain` liczy
`Math.round(base * mult)`, a zwykłe miasto ma `base = 1`, więc produkcja przeskakuje
z 1 na 2 dopiero przy `mult ≥ 1,5` — mnożniki 1,0 i 1,49 dają **identyczny** wynik dla
zwykłych miast, a różnica 1,4 → 1,5 podwaja gospodarkę. Zmierzony efekt: boss z `economy`
1,4 wygrywa 20% partii, z 1,5 — 93%. To samo tłumaczy, czemu preset Hard (1,25) różni się
od Normal głównie stolicą (3 → 4), a Nightmare (1,725) skacze na całej mapie. Przy
strojeniu patrz na **wynikową produkcję**, a nie na sam mnożnik.

Domyślny boss (preset Normal × `BOSS_MULT` + obie reguły) jest **bardzo mocny**: wygrywa
100% partii z dwoma botami Normal i 83% przeciw pięciu. Do pierwszej sesji z żywymi
graczami warto zejść na **Easy** — tam boss wygrywa 27% i jest realnie do pokonania,
a jego ekonomia (0,5 × 1,6 = 0,8) jest nawet słabsza niż zwykłego bota na Normalnym,
więc groźny robi się wyłącznie regułami. Uwaga przy czytaniu tych liczb: boty sojusznicze
niczego nie uzgadniają, a dwoje ludzi rozmawiających przy stole to inny przeciwnik.

### Drużyny a decyzje AI

Wszystkie miejsca, w których AI pyta „czy to wróg", idą przez `aiIsEnemy` /
`aiIsOwnSide` (`ai.js`), a te przez `sameTeam` (`state.js`). Dotyczy to wyceny celów,
dystansu do frontu, sumowania siły wroga, wykrywania zagrożenia stolicy i liczenia
lokalnej obrony przy oblężeniu. Pomyłka w którymkolwiek z nich objawia się botem, który
liczy sojusznika jako wroga (i np. eskaluje agresję, bo „przeciwnik" ma dużo siły).

## Wycena celów (`aiTargets`)

Dla każdego pola na mapie AI liczy wartość, jeśli warto by tam dotrzeć:

Pola i miasta **sojuszników** (oraz własne) w ogóle nie trafiają na tę listę — `captureTile`
i tak by ich nie zajęło, więc marsz na nie byłby marnowaniem ruchów.

| Cel | Wartość |
|---|---|
| Cudze/niczyje złoże | 7 |
| Żywa stolica wroga | 30 |
| Niczyje miasto | 23 |
| Inne miasto wroga | 10 |

Wartość niczyjego miasta była pierwotnie 14 — pomiar pokazał, że przegrywała wtedy
scoring z odległą stolicą i AI zostawiało 3–4 wolne miasta na mapie przez całą grę
(podniesienie do 23 + podział ról niżej zbija to do ~0,1 już przed rundą 60).

To surowa lista wartości pól — nie uwzględnia jeszcze odległości ani obecnej pozycji armii (to dzieje się dopiero w scoringu ruchu, niżej).

## Wybór ruchu (`aiPickMove`)

Dla każdej własnej armii z pozostałymi ruchami (posortowanych malejąco po `str` — w praktyce wpływa to tylko na kolejność rozpatrywania przy remisach wyniku, bo globalny scoring i tak przegląda wszystkie pary armia×ruch) i dla każdego jej osiągalnego pola:

### Atak na wroga

```
myPow  = armyPowerAt(atakujący, 'attack') + 0.12 * wsparcie
defPow = armyPowerAt(broniący, 'defense') + 0.12 * wsparcie (+ bonus miasta/stolicy)
ratio  = myPow / defPow
```

Bramki decyzyjne (AT = `aggressionThreshold` bieżącej trudności, dodatkowo obniżany
przez eskalację — patrz sekcja „Eskalacja i oblężenie" niżej):

| Warunek | Wynik ataku |
|---|---|
| Cel to stolica wroga i `ratio > 0.8·AT` | `(100 + ratio·10) · aggression` |
| Zwykły cel i `ratio > 1.05·AT` | `(40 + ratio·5 + bonus_za_miasto) · aggression` |
| `ratio > 0.8·AT` (atak na wyniszczenie) | `(5 + str_atakującego·0.25) · aggression` — preferuje duże stosy |
| Broniona własna stolica jest zagrożona i to ten cel, `ratio > 0.9·AT` | `60 · aggression` |
| Żaden z powyższych | brak ataku (`-Infinity`) |

Trzecia reguła ("atak na wyniszczenie") to celowo najbardziej permisywna bramka poza obroną stolicy — pozwala AI naciskać nawet przy niekorzystnym stosunku sił, jeśli akurat dysponuje dużym stosem, żeby front się nie zablokował w wiecznym patcie.

### Łączenie z własną armią

Jeśli suma sił po połączeniu nie przekroczy `MAX_ARMY`, AI traktuje to jak marsz w stronę najbliższego wartościowego celu (siła "idzie do przodu" razem z marszem). Jeśli własna stolica jest zagrożona, a docelowe pole leży blisko niej (`hexDist ≤ 2`) — dodatkowy bonus obronny.

### Marsz na puste/niczyje pole

Wynik liczony z wartości najbliższego atrakcyjnego celu z `aiTargets`, skorygowany o to, czy ruch przybliża czy oddala od niego (`+8` za przybliżenie, `-10` za oddalenie), plus bonusy za wejście na niczyje miasto (`+25`) czy w ogóle na niczyją ziemię (`+3`), kara `-2` za wejście na wodę. Dodatkowo: jeśli własna stolica jest zagrożona, ruchy przybliżające do niej dostają bonus obronny; a ostatnia armia broniąca stolicy **nie rusza się w ogóle**, dopóki trwa zagrożenie (twarda reguła garnizonowa, `score = -Infinity`).

### Finalny wybór

Do każdego nieujemnego wyniku dodawany jest mały losowy szum (`rnd(0,3)`), żeby AI nie było w 100% deterministyczne przy remisach. Wybierany jest ruch o najwyższym wyniku spośród **wszystkich** par (armia, pole docelowe) — jeśli najlepszy wynik jest `≤ 0`, AI w ogóle nic nie robi tą turą.

## Eskalacja i oblężenie (domykanie wygranych pozycji)

Warstwa nad podstawowym scoringiem, dodana po pomiarach `tools/sim.js`, które pokazały,
że 40% partii AI-vs-AI kończyło się patem: strona z wyraźną przewagą materialną nie
umiała zdobyć ostatniej stolicy wroga (rozpraszała siły na potyczki, a pojedynczo
dowożone pod twierdzę armie były zjadane wycieczkami wysokomoralnych obrońców).
Wszystko bezstanowe — liczone z planszy przy każdym wyborze ruchu; stałe `AI_ESC_*`
i `AI_SIEGE_BONUS` w `config.js`.

- **Bramka przewagi (`dominance`)** — mechanizmy odpalają się wyłącznie dla strony
  z przewagą łącznej siły armii (0 przy równowadze, 1 od `AI_ESC_DOMINANCE_FULL` =
  1.4× siły wroga). Słabszy gra dokładnie podstawowym scoringiem — bez bramki obie
  strony wyrównanej partii zmieniały zachowanie naraz i psuły partie, które normalnie
  by się rozstrzygnęły.
- **Eskalacja progów** — `escProgress = min(1, tura/AI_ESC_TURNS) · dominance` obniża
  `AT` aż o `AI_ESC_MAX` (50%): lider z czasem akceptuje ataki przy coraz gorszym
  stosunku sił, zamiast wiecznie czekać na idealne okazje.
- **Stolica-cel (focus)** — najsłabiej broniona i najbliższa żywa stolica wroga; jej
  wartość w `aiTargets` rośnie o `AI_ESC_FOCUS_VAL · escProgress`, więc marsz i łączenie
  armii kierują wspólną pulę ruchów na jeden punkt. Dystans do focusa liczony jest
  **polem BFS po lądzie** (nie `hexDist`) — bez tego armie zbijały się w ślepe zaułki
  na linii brzegowej.
- **Szturm falowy** — armie gromadzą się w strefie zbornej (dystans ścieżkowy 2–3 od
  focusa; premia `AI_SIEGE_BONUS` ważona `supportWeight` typu, więc pierścień obsadza
  głównie artyleria), a na pierścień (dystans 1) front wchodzi dopiero, gdy zebrana
  siła przewyższa lokalną obronę — wiele armii w jednej turze. Próg gotowości maleje
  z długością partii („cierpliwość oblężnicza": od 1.2× do 0.55× lokalnej obrony), bo
  na ciasnych mapach strefa zborna bywa za mała na pełną przewagę.
- **Premia szturmowa** — ataki na wrogie armie blisko focusa (dystans ścieżkowy ≤ 4)
  dostają bonus rosnący z bliskością; bez niego marsz z podbitą wartością celu wygrywał
  ocenę i oblężenie „tańczyło" wokół obrońców, nigdy ich nie atakując.
- **Podział ról wg siły (`AI_SIEGE_MIN_STR` = 25)** — armie słabsze niż próg nie są
  kanalizowane na front (bez podbicia focusa i strefy zbornej): zbierają wolne miasta
  i złoża, budując ekonomię. Ablacja pokazała silną synergię: sama wyższa wartość
  niczyich miast bez podziału ról daje 26,7% remisów, z podziałem — 6,3% (małe armie
  w strefie zbornej sztucznie pompowały `massedStr`, fałszując gotowość szturmu).

Zmierzony efekt po obu iteracjach (seria 300 gier normal vs normal, seedy 1–300,
limit 500 rund): remisy spadły z 40,0% do **7,0%** (iteracja 1: eskalacja+oblężenie
→ 24,7%; iteracja 1.1: ekonomia+podział ról → ~7%), mediana długości partii z ~348
do ~122 rund, drabinka trudności bez zmian (Nightmare ~91% rozstrzygniętych w teście
mirror), balans stron 52/48 (szum).

## Pętla wykonania (`aiStep`)

```
aiStep(playerId, activationsLeft, done):
  jeśli gra zakończona → koniec
  jeśli brak aktywacji → done() (kończy turę)
  wybierz najlepszy ruch (aiPickMove)
  jeśli brak ruchu → done()
  wykonaj ruch (executeMove), policz zużyte aktywacje (0 albo 1)
  po thinkDelay ms → aiStep(playerId, activationsLeft - zużyte, done)
```

Rekurencyjna pętla z `setTimeout` między krokami (kontrolowana przez `gameId`, żeby spóźnione callbacki z porzuconej gry nie wpływały na nową) — kończy się wywołaniem `endTurn` przekazanym jako `done`.

## Wybór typu produkcji

Opisany szczegółowo w [Gospodarce](05-Gospodarka.md) — `aiAssignBuildType` używa prostej heurystyki odległości do frontu (blisko wroga → artyleria, średnio → czołg, daleko → piechota), a jeśli miasto już ma stojącą własną armię, zawsze dopasowuje `buildType` do niej, żeby nigdy nie marnować produkcji.

## Uwaga o wariancji

Symulacje AI-vs-AI (np. do testów balansu) mają dużą wariancję wyników — pojedyncza partia 300–500 tur może dać rozstrzygnięcie w zakresie mniej więcej 40–65% szans dla którejkolwiek ze stron nawet przy identycznych ustawieniach startowych, głównie przez losowość w `resolveBattle` (±8% z każdej strony) i szum w scoringu ruchów. Pojedynczy nietypowy wynik testu nie musi oznaczać regresji.
