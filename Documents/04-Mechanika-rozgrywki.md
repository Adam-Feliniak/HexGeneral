# Mechanika rozgrywki

## Siatka i tury

Mapa to siatka heksagonalna **odd-r offset, pointy-top** (szczegóły geometryczne w [Architekturze](02-Architektura-i-pliki.md)). Gracze grają po kolei (`currentPlayerIndex`, `nextAliveIndex` pomija martwych graczy). Każda tura daje aktywnemu graczowi **pulę `ACTIVATIONS_PER_TURN = 5` aktywacji** (`state.activationsLeft`) — czyli tyle *jednostek* wolno w niej rozkazać. Ile każda z nich przejdzie, zależy już od jej własnych punktów ruchu (patrz [Ruch](#ruch)).

Na starcie tury (`startTurn` w `turns.js`): zerowane jest zaznaczenie, pula aktywacji wraca do 5, a `resetMoved` odświeża punkty ruchu wszystkich armii tego gracza i czyści ich `activated`. Jeśli to bot — od razu startuje `aiStep`.

Tura kończy się (`endTurn`): produkcją siły w miastach gracza (`produce()`), po czym przechodzi do następnego żywego gracza; pełny obrót wszystkich graczy zwiększa `state.turn`.

Turę człowieka kończy **wyłącznie sam gracz** — przycisk „Zakończ turę" albo Enter (`requestEndTurn`); w trybie multi z limitem czasu dodatkowo `checkTurnTimer`. **Wyczerpanie puli świadomie nie oddaje tury**: po ostatnim ruchu zostaje okno na decyzje niezależne od ruchu — wybór produkcji miasta, rozpoczęcie budowy drogi, przypisanie złoża (`supplyCity`) i samo obejrzenie planszy. Panele miasta i złoża w `onTileClick` nie mają bramki na pulę, więc działają też przy zerze aktywacji.

### Wybór imperium na starcie (tylko single-player)

`canPickEmpire()` zwraca `true` tylko gdy: tryb single, gracz jest człowiekiem, to tura 1 i nie wykonał jeszcze żadnego ruchu (`activationsLeft === ACTIVATIONS_PER_TURN`). W tym oknie kliknięcie w **dowolną cudzą stolicę** przełącza, którym imperium gra człowiek (`switchHuman`) — porzucone imperium przechodzi pod AI z domyślną trudnością tej gry.

## Typy jednostek

Armia na polu to obiekt `{ player, str, vet, type, mp, activated }`. `type` to jedna z trzech wartości zdefiniowanych w `UNIT_TYPES` (`config.js`):

| Typ | Atak (`atk`) | Obrona (`def`) | Punkty ruchu (`mp`) | Zasięg poza drogą / po drodze | Waga wsparcia |
|---|---|---|---|---|---|
| Piechota (`infantry`) | 1.00 | 1.00 | 2 | 1 / 2 pola | 1.00 |
| Czołg (`tank`) | 1.25 | 0.85 | 4 | 2 / 4 pola | 0.80 |
| Artyleria (`artillery`) | 0.75 | 1.20 | 2 | 1 / 2 pola | 1.80 |

Piechota to neutralny punkt odniesienia (mnożniki 1.00/1.00, identyczne z zachowaniem gry sprzed wprowadzenia typów). Czołg jest szybki i mocny w ataku, ale słabszy w obronie. Artyleria jest słaba w bezpośrednim ataku, ale silna w obronie i daje **prawie dwukrotnie większe wsparcie** sąsiadującym własnym armiom w bitwie niż piechota.

Typ jednostki wybiera się w mieście, które ją produkuje (`city.buildType`) — patrz [Gospodarka](05-Gospodarka.md). Renderowanie (jaki sprite jest rysowany) zależy wyłącznie od `army.type`, nie od siły — to inna zasada niż okręty (patrz niżej).

## Ruch

### Dwa budżety: aktywacje i punkty ruchu

Ruch ma **dwa niezależne limity**, których nie należy mylić:

1. **Pula aktywacji gracza** (`state.activationsLeft`, `ACTIVATIONS_PER_TURN = 5`) — ile *jednostek* wolno rozkazać w turze. Aktywacja schodzi **raz na jednostkę**: kolejne ruchy tej samej armii w tej samej turze są darmowe, dopóki ma punkty ruchu. To ten limit tworzy napięcie „które 5 jednostek jest teraz ważne".
2. **Punkty ruchu jednostki** (`army.mp`) — jak daleko ta konkretna armia dojdzie. Odświeżane na starcie tury przez `resetMoved`.

`executeMove()` zwraca **liczbę zużytych aktywacji** (1 przy pierwszym ruchu armii, 0 przy kolejnym) i samo spina `army.mp`. Pulę aktywacji prowadzą wywołujący: człowiek `state.activationsLeft` (`input.js`), bot własny licznik rekurencji w `aiStep()`.

### Koszt wejścia na pole (`moveCostStep`)

| Wejście na | Koszt |
|---|---|
| własną drogę (`tileOnRoad`) | `MOVE_COST_ROAD = 1` |
| każde inne pole (ląd, morze, miasto) | `MOVE_COST_DEFAULT = 2` |
| przejście ląd↔woda | **cała pozostała pula** |

Koszt jest właściwością **przejścia**, nie kafelka — dlatego `moveCostStep(from, to, playerId)` bierze oba pola. Kluczowa konsekwencja: **droga premiuje podróżowanie po niej, nie stanie na niej.** Czołg jadący drogą pokona 4 pola, ale ten sam czołg zjeżdżający z drogi w czyste pole zrobi tylko 2. (Poprzedni model dokładał `roadBonus` na podstawie pola, na którym jednostka stała, więc dawał dodatkowy zasięg **w każdym kierunku** — aurę zamiast korytarza.)

Pula zależy od tego, **gdzie jednostka stoi na początku tury** (`maxMovePoints`): na lądzie `UNIT_TYPES[type].mp`, na morzu `SEA_MOVE_POINTS = 6` **jednakowo dla wszystkich typów** (przy koszcie 2 za pole = 3 pola żeglugi). Po zaokrętowaniu typ lądowy przestaje mieć znaczenie — tak samo jak w renderze, gdzie klasa okrętu wynika z siły armii, nie z typu.

Jednostka z **pełną** pulą może zawsze wejść na jedno sąsiednie pole, choćby koszt pulę przekraczał. Dziś nie ma terenu droższego niż 2, więc reguła jest rezerwą pod przyszłe typy terenu (koszt 3+ nie zablokuje piechoty z 2 MP).

### Legalność kroku (`canStep`)

Pojedynczy krok z pola `from` na sąsiednie pole `to` jest legalny, jeśli:
- pola są rzeczywiście sąsiadami (`hexDist === 1`),
- na docelowym polu **nie stoi pełny własny stos** (`str >= MAX_ARMY = 99`) **ani armia innego typu tego samego gracza** — różne typy nie mogą się łączyć, więc pole zajęte przez inny typ jest dla ruszającej się armii nieprzejezdne (blokada identyczna jak przy pełnym stosie, funkcja `blockedByFriendly`),
- wejście na wodę wymaga, by pole startowe było morzem **albo własnym portem** — każdy typ lądowy może wypłynąć z portu, nie ma osobnych jednostek desantowych/morskich.

### Wielokrokowa ścieżka (`reachableMoves`)

**Dijkstra** (maksymalizacja pozostałych punktów ruchu), nie BFS — koszty pól są różne, więc liczenie samych kroków dawałoby złe zasięgi. Zwraca `Map<pole, poprzednik>`, z której `executeMove` odtwarza trasę wstecz.

Reguły trasy:
- **Pola pośrednie muszą być puste** — nie da się "przeskoczyć" przez zajęty heks (ani wroga, ani własny). Tylko **ostatnie** pole może być zajęte: przez wroga (bitwa) albo własną armię tego samego typu (połączenie).
- **Przejście ląd↔woda jest krokiem terminalnym.** Zeruje pulę, więc trasa nie może za nim kontynuować: `woda → woda → ląd` jest legalna, `ląd → woda → woda` nie. Nie ma potrzeby osobnego znacznika — zerowa pula sama zatrzymuje rozwijanie.

### Łączenie armii (merge)

Wejście na pole z własną armią **tego samego typu** sumuje siły (`str`, ograniczone do `MAX_ARMY = 99`) i bierze **wyższy** z dwóch poziomów weterancji (`Math.max`, nie sumę). Połączona armia dostaje `mp = 0` i `activated = true` — bez tego dostałaby w tej turze ruch „za darmo", cudzymi punktami. Różne typy nigdy się nie łączą (blokowane już na etapie `canStep`, więc pole zajęte przez inny typ w ogóle nie pojawia się jako legalny ruch).

## Morale

```js
function moraleAt(playerId, t) {
  let d = odległość do najbliższego WŁASNEGO miasta (nie stolicy!);
  let m = 100 - 7 * d;
  m = max(40, m);
  if (t.city && t.owner === playerId) m += 5;
  if (!t.land) m -= 15;
  return clamp(25, 100, m);
}
```

Kluczowa decyzja projektowa: morale liczy się od odległości do **najbliższego własnego miasta**, nie od stolicy — inaczej AI wpadało w wieczne paty (front nigdy się nie przesuwał, bo zdobyte tereny nie poprawiały zaopatrzenia). Podbicie miasta na nowym terenie od razu podnosi morale wojsk w okolicy, popychając front do przodu. Dodatkowo: +5 za stanie we własnym mieście, -15 za bycie na wodzie (kara za walkę desantową), całość przycięta do `[25, 100]`.

## Siła bojowa i walka

### `armyPowerAt(army, t, role)`

```js
power = army.str * min(110, moraleAt(...) + army.vet) / 100 * UNIT_TYPES[army.type][role === 'attack' ? 'atk' : 'def']
```

`role` to `'attack'` albo `'defense'` — ta sama armia ma inną moc w zależności od tego, czy atakuje, czy się broni (bo `atk`/`def` różnią się per typ). Weterancja (`vet`, 0–15) dolicza się wprost do efektywnego morale, z twardym pułapem 110%.

### Wsparcie sąsiadów (`supportFor`)

Każda własna armia stojąca na jednym z 6 pól sąsiadujących z polem bitwy dokłada część swojej siły jako wsparcie — **nie bierze bezpośredniego udziału w starciu**, tylko wzmacnia walczącą stronę:

```js
support = suma( n.army.str * UNIT_TYPES[n.army.type].supportWeight ) dla sąsiadów n pola bitwy
```

To działa symetrycznie dla obu stron starcia. Wkład wsparcia do finalnej mocy to `0.12 × support` (stały mnożnik w `resolveBattle`/`aiPickMove`).

### Rozstrzygnięcie (`resolveBattle`)

```
aPow = armyPowerAt(atakujący, 'attack') + 0.12 × wsparcie atakującego
dPow = armyPowerAt(broniący,  'defense') + 0.12 × wsparcie broniącego
dPow *= 1.25 jeśli broni stolicy, 1.15 jeśli broni zwykłego miasta
aPow *= losowość ±8%   (niezależnie dla obu stron)
dPow *= losowość ±8%
```

Kto ma wyższe `Pow`, wygrywa (remis rozstrzyga się na korzyść obrońcy — warunek jest ściśle `>`). **Przegrana armia zostaje całkowicie zniszczona** (znika z planszy). Zwycięzca traci część swojej siły proporcjonalnie do tego, jak wyrównana była walka:

```
strata = round(str_zwycięzcy * 0.75 * (Pow_przegranego / Pow_zwycięzcy))
```

zawsze ograniczona tak, by zwycięzcy została co najmniej `1` siła. Zwycięzca zdobywa **+4 do weterancji** (max 15) — tak samo przegrany, jeśli akurat *przeżył* to konkretne starcie (w praktyce: żadna armia nie przeżywa przegranej, więc realnie weterancję zyskuje tylko zwycięzca; ta sama reguła kodowa obsługuje oba przypadki symetrycznie).

## Weterancja (`vet`)

Poziom 0–15, rośnie **tylko przez walkę** (+4 za każde stoczone i przetrwane starcie), nigdy się nie resetuje sam — zeruje się dopiero, gdy powstaje zupełnie nowa armia (start gry albo świeża produkcja na pustym mieście). Przy łączeniu dwóch armii tego samego typu bierze się **wyższy** poziom weterancji obu, nie sumę.

Wizualnie pokazywana jako odznaka nad jednostką (`drawVetBadge` w `render.js`):

- 0–3: brak znacznika
- 4–7: 1 krokiewka
- 8–11: 2 krokiewki
- 12–14: 3 krokiewki
- 15 (maksimum): złota gwiazdka zamiast krokiewek

## Żegluga i morze

Armia może wejść na wodę tylko z morza albo z **własnego portu** (miasto sąsiadujące z wodą, patrz [Generowanie mapy](03-Generowanie-mapy.md)) i może wylądować na **dowolnym** wybrzeżu (nie tylko porcie) — asymetria odzwierciedlona też w grafie spójności generatora mapy. Na morzu obowiązuje kara -15 do morale (patrz wyżej), niezależnie od typu jednostki.

**Zaokrętowanie i desant zużywają całą pozostałą pulę punktów ruchu** (wystarczy 1 punkt, żeby przejście wykonać). Ponieważ taki krok jest terminalny, w jednej turze nie da się wsiąść na statek i odpłynąć ani wylądować i wjechać w głąb lądu: desant zdobywa przyczółek, a obrońca dostaje turę na reakcję.

Na morzu każda jednostka ma `SEA_MOVE_POINTS = 6` (**3 pola żeglugi**) niezależnie od typu lądowego. Spójnie z tym **klasa okrętu jest czysto kosmetyczna** i niezwiązana z `army.type` — na wodzie sprite dobierany jest wyłącznie wg progu siły (`str`): poniżej 20 barka desantowa, 20–69 pancernik, 70+ lotniskowiec. Gdyby kiedyś powiązać pulę morską z klasą okrętu, te progi są już w kodzie.

## Podboje i koniec gry

- **`captureTile`** (`empire.js`): wejście na pole zmienia jego właściciela. Pojedyncze zajęcie pola kasuje ewentualny heks drogi na nim (sieć się rozspójnia), a przejęte miasto porzuca swój projekt budowy drogi (patrz [Gospodarka](05-Gospodarka.md)). Jeśli zdobyto cudzą **stolicę** — natychmiastowa **aneksja całego imperium** (`conquerEmpire`): wszystkie pola, miasta i złoża pokonanego gracza przechodzą pod zwycięzcę, wszystkie jego pozostałe armie znikają z planszy, a heksy jego sieci dróg stają się siecią zwycięzcy. Zdobyta stolica staje się zwykłym miastem (`capitalOf = -1`).
- **`checkGameOver`**: gra kończy się, gdy zostaje dokładnie jeden żywy gracz (zwycięstwo — różny tekst ekranu końcowego zależnie od trybu single/multi i czy zwycięzcą jest człowiek), albo gdy w trybie single pada stolica jedynego człowieka (porażka), niezależnie od tego, ilu botów jeszcze żyje.
