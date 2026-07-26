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

Trudność "Custom" (suwak 0–100% w lobby) interpoluje liniowo (`resolveDifficulty`) między presetami Easy i Nightmare dla wszystkich czterech parametrów naraz.

## Wycena celów (`aiTargets`)

Dla każdego pola na mapie AI liczy wartość, jeśli warto by tam dotrzeć:

| Cel | Wartość |
|---|---|
| Cudze/niczyje złoże | 7 |
| Żywa stolica wroga | 30 |
| Niczyje miasto | 14 |
| Inne miasto wroga | 10 |

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

Zmierzony efekt (seria 300 gier normal vs normal, seedy 1–300, limit 500 rund): remisy
spadły z 40,0% do 24,7%, mediana długości partii z ~348 do ~274 rund, drabinka trudności
bez zmian (Nightmare ~89% rozstrzygniętych w teście mirror), balans stron w szumie.

## Pętla wykonania (`aiStep`)

```
aiStep(playerId, movesLeft, done):
  jeśli gra zakończona → koniec
  jeśli brak ruchów → done() (kończy turę)
  wybierz najlepszy ruch (aiPickMove)
  jeśli brak ruchu → done()
  wykonaj ruch (executeMove), policz zużyte hopy
  po thinkDelay ms → aiStep(playerId, movesLeft - hopy, done)
```

Rekurencyjna pętla z `setTimeout` między krokami (kontrolowana przez `gameId`, żeby spóźnione callbacki z porzuconej gry nie wpływały na nową) — kończy się wywołaniem `endTurn` przekazanym jako `done`.

## Wybór typu produkcji

Opisany szczegółowo w [Gospodarce](05-Gospodarka.md) — `aiAssignBuildType` używa prostej heurystyki odległości do frontu (blisko wroga → artyleria, średnio → czołg, daleko → piechota), a jeśli miasto już ma stojącą własną armię, zawsze dopasowuje `buildType` do niej, żeby nigdy nie marnować produkcji.

## Uwaga o wariancji

Symulacje AI-vs-AI (np. do testów balansu) mają dużą wariancję wyników — pojedyncza partia 300–500 tur może dać rozstrzygnięcie w zakresie mniej więcej 40–65% szans dla którejkolwiek ze stron nawet przy identycznych ustawieniach startowych, głównie przez losowość w `resolveBattle` (±8% z każdej strony) i szum w scoringu ruchów. Pojedynczy nietypowy wynik testu nie musi oznaczać regresji.
