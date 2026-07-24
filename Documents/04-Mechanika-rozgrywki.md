# Mechanika rozgrywki

## Siatka i tury

Mapa to siatka heksagonalna **odd-r offset, pointy-top** (szczegóły geometryczne w [Architekturze](02-Architektura-i-pliki.md)). Gracze grają po kolei (`currentPlayerIndex`, `nextAliveIndex` pomija martwych graczy). Każda tura daje aktywnemu graczowi **wspólną pulę `MOVES_PER_TURN = 5` ruchów** (`state.movesLeft`) — nie każda armia osobno, tylko jeden globalny licznik na gracza, dzielony między wszystkie jego armie w tej turze.

Na starcie tury (`startTurn` w `turns.js`): zerowane jest zaznaczenie, pula ruchów wraca do 5, resetuje się `movesUsed` wszystkich armii tego gracza (`resetMoved`). Jeśli to bot — od razu startuje `aiStep`.

Tura kończy się (`endTurn`): produkcją siły w miastach gracza (`produce()`), po czym przechodzi do następnego żywego gracza; pełny obrót wszystkich graczy zwiększa `state.turn`.

### Wybór imperium na starcie (tylko single-player)

`canPickEmpire()` zwraca `true` tylko gdy: tryb single, gracz jest człowiekiem, to tura 1 i nie wykonał jeszcze żadnego ruchu (`movesLeft === MOVES_PER_TURN`). W tym oknie kliknięcie w **dowolną cudzą stolicę** przełącza, którym imperium gra człowiek (`switchHuman`) — porzucone imperium przechodzi pod AI z domyślną trudnością tej gry.

## Typy jednostek

Armia na polu to obiekt `{ player, str, vet, movesUsed, type }`. `type` to jedna z trzech wartości zdefiniowanych w `UNIT_TYPES` (`config.js`):

| Typ | Atak (`atk`) | Obrona (`def`) | Zasięg bazowy | Bonus z drogi | Waga wsparcia |
|---|---|---|---|---|---|
| Piechota (`infantry`) | 1.00 | 1.00 | 1 | +1 (razem 2) | 1.00 |
| Czołg (`tank`) | 1.25 | 0.85 | 1 | +2 (razem 3) | 0.80 |
| Artyleria (`artillery`) | 0.75 | 1.20 | 1 | +0 (zawsze 1) | 1.80 |

Piechota to neutralny punkt odniesienia (mnożniki 1.00/1.00, identyczne z zachowaniem gry sprzed wprowadzenia typów). Czołg jest szybki i mocny w ataku, ale słabszy w obronie. Artyleria jest wolna (nigdy nie korzysta z bonusu drogi) i słaba w bezpośrednim ataku, ale silna w obronie i daje **prawie dwukrotnie większe wsparcie** sąsiadującym własnym armiom w bitwie niż piechota.

Typ jednostki wybiera się w mieście, które ją produkuje (`city.buildType`) — patrz [Gospodarka](05-Gospodarka.md). Renderowanie (jaki sprite jest rysowany) zależy wyłącznie od `army.type`, nie od siły — to inna zasada niż okręty (patrz niżej).

## Ruch

### Zasięg ruchu (`moveCap`)

```js
function moveCap(t) {
  const ut = UNIT_TYPES[t.army.type];
  return ut.moveBase + (tileOnRoad(t, t.army.player) ? ut.roadBonus : 0);
}
```

Piechota: 1 pole normalnie, 2 na aktywnej drodze. Czołg: 1 normalnie, **3** na drodze. Artyleria: zawsze 1, drogi jej nie przyspieszają. "Aktywna droga" to pole leżące na trasie własnego, nieprzerwanego połączenia złoże→miasto (`tileOnRoad`, patrz [Gospodarka](05-Gospodarka.md)).

### Legalność kroku (`canStep`)

Pojedynczy krok z pola `from` na sąsiednie pole `to` jest legalny, jeśli:
- pola są rzeczywiście sąsiadami (`hexDist === 1`),
- na docelowym polu **nie stoi pełny własny stos** (`str >= MAX_ARMY = 99`) **ani armia innego typu tego samego gracza** — różne typy nie mogą się łączyć, więc pole zajęte przez inny typ jest dla ruszającej się armii nieprzejezdne (blokada identyczna jak przy pełnym stosie, funkcja `blockedByFriendly`),
- wejście na wodę wymaga, by pole startowe było morzem **albo własnym portem** — każdy typ lądowy może wypłynąć z portu, nie ma osobnych jednostek desantowych/morskich.

### Wielokrokowa ścieżka (`reachableMoves`)

BFS od pola startowego, do `moveCap` kroków. **Pola pośrednie na trasie muszą być puste** — nie da się "przeskoczyć" przez zajęty heks (ani wroga, ani własny). Tylko **ostatnie** pole na trasie może być zajęte: przez wroga (wtedy dochodzi do bitwy) albo przez własną armię tego samego typu (wtedy następuje połączenie).

### Łączenie armii (merge)

Wejście na pole z własną armią **tego samego typu** sumuje siły (`str`, ograniczone do `MAX_ARMY = 99`) i bierze **wyższy** z dwóch poziomów weterancji (`Math.max`, nie sumę). Połączona armia ma `movesUsed` ustawione na `Infinity` — zużyła swój ruch w tej turze. Różne typy nigdy się nie łączą (blokowane już na etapie `canStep`, więc pole zajęte przez inny typ w ogóle nie pojawia się jako legalny ruch).

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

**Klasa okrętu jest czysto kosmetyczna** i niezwiązana z `army.type` — na wodzie sprite dobierany jest wyłącznie wg progu siły (`str`): poniżej 20 barka desantowa, 20–69 pancernik, 70+ lotniskowiec. Mechanika walki/ruchu na morzu jest identyczna dla każdego typu lądowego, który akurat płynie.

## Podboje i koniec gry

- **`captureTile`** (`empire.js`): wejście na pole zmienia jego właściciela. Pojedyncze zajęcie pola kasuje ewentualny heks drogi na nim (sieć się rozspójnia), a przejęte miasto porzuca swój projekt budowy drogi (patrz [Gospodarka](05-Gospodarka.md)). Jeśli zdobyto cudzą **stolicę** — natychmiastowa **aneksja całego imperium** (`conquerEmpire`): wszystkie pola, miasta i złoża pokonanego gracza przechodzą pod zwycięzcę, wszystkie jego pozostałe armie znikają z planszy, a heksy jego sieci dróg stają się siecią zwycięzcy. Zdobyta stolica staje się zwykłym miastem (`capitalOf = -1`).
- **`checkGameOver`**: gra kończy się, gdy zostaje dokładnie jeden żywy gracz (zwycięstwo — różny tekst ekranu końcowego zależnie od trybu single/multi i czy zwycięzcą jest człowiek), albo gdy w trybie single pada stolica jedynego człowieka (porażka), niezależnie od tego, ilu botów jeszcze żyje.
