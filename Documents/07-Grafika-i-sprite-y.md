# Grafika i sprite'y

## Filozofia

Cały wizualny styl gry to pixel-art nawiązujący do *Metal Slug*: sprite'y z wyraźnym czarnym konturem, nasycone kolory, militarno-arkadowy HUD. **Żaden sprite nie jest rysowany ręcznie w edytorze grafiki** — wszystkie pliki PNG w `assets/` są generowane proceduralnie przez skrypt `tools/gen-sprites.js`, uruchamiany ręcznie z Node (`node tools/gen-sprites.js`), i dopiero wynikowe pliki są commitowane do repo (bo gra nie ma etapu builda, który mógłby je wygenerować przy starcie — patrz [Przegląd projektu](01-Przeglad-projektu.md)).

## Generator (`tools/gen-sprites.js`)

Skrypt nie ma żadnych zależności npm — łącznie z **własnoręcznie napisanym enkoderem PNG** (zlib + CRC32, korzysta tylko z wbudowanego modułu `zlib` Node). Ma dwa niezależne "malarze":

### 1. Painter siatki znaków (jednostki, budynki, drobiazgi)

Prosty system: `makeGrid(w,h)` tworzy 2D tablicę znaków wypełnioną `.` (przezroczystość), a funkcje `P()` (pojedynczy piksel), `rect()` (prostokąt) i `ellipseFill()` (elipsa) malują nią konkretnymi znakami z palety `BASE_PAL` (np. `t`=gąsienice, `w`/`W`=koła, `g`/`G`=metal działa, `b`/`B`/`h`=kolor gracza — ciało/cień/podświetlenie). Na koniec `outline(g)` automatycznie zamienia każdy kolorowy piksel stykający się z przezroczystością na czarny kontur — **żaden sprite nie rysuje konturu ręcznie**, dostaje go za darmo z tej jednej funkcji.

Tym mechanizmem namalowane są m.in.:
- `tankGrid()` — czołg 48×28
- `artilleryGrid()` — armata polowa 44×26, **rysowana inaczej niż reszta**: nie kodem malującym, tylko ręcznie ułożoną mapą znaków 22×13, skalowaną 2× (patrz niżej)
- `soldierTop()` + `legsGrid(phase)` — piechur 24×30/klatkę, głowa+tułów stałe, animują się tylko nogi (4 fazy chodu)
- `capitalGrid()` — stolica (kwatera główna) 48×34
- `city0/1/2()` — 3 warianty zwykłego miasta 46×38
- `cityPort()` — miasto-port z żurawiem i keją
- `craneGrid()` — sam żuraw (nakładka na stolicę-port)
- `ship0/1/2()` — 3 klasy okrętów: barka desantowa, pancernik, lotniskowiec
- `resOil/resFarm/resMine()` — złoża surowców
- drzewa i skały (po 2 warianty każde)

### 1b. Ręczna mapa znaków (armata 2×, czołg 1:1 — docelowo reszta jednostek)

Sprite'y składane z `ellipseFill()` dają bryły organiczne, a nie maszyny — stara armata
czytała się jako „kula z patykiem". Dlatego armata jest dziś **ułożona ręcznie piksel po
pikselu** jako tablica 13 stringów po 22 znaki (`ARTILLERY_ROWS`), a potem powiększona
całą liczbą przez `upscale(rows, 2)` do 44×26.

Powiększenie całkowite nie jest oszczędnością, tylko decyzją stylistyczną: piksel staje się
blokiem 2×2, więc sylwetka czyta się z odległości i **nie konkuruje z jednopikselowym
szumem kafli terenu**. Przy okazji znosi znacznie lepiej skalowanie planszy do okna,
gdzie przeglądarka wyrzuca całe rzędy pikseli.

**Czołg (`TANK_ROWS`) jest ułożony tak samo ręcznie, ale w skali 1:1 — 28 stringów po 48
znaków, bez `upscale()`.** Reżimy różnią się jedną rzeczą: tolerancją na skosy. Przy 2×
przekątna o grubości 3 zostaje po konturze czarnym patykiem (dlatego lufa armaty jest
pozioma), przy 1:1 skos przeżywa. To dlatego czołg unosi detal, którego armata nie mogła:
nity, spoinę pancerza, peryskop, zapasowe koło, łopatę.

**Reguła, która o tym decyduje, jest łatwa do przeoczenia:** `outline()` zamienia na kontur
wyłącznie piksele stykające się z przezroczystością. Minimum „≥3 piksele grubości" obowiązuje
więc tylko dla elementów **wystających poza obrys** — antenka czołga jest cienka świadomie
i wychodzi w całości czarna. Detal narysowany **wewnątrz** sylwetki przeżywa w dowolnym
rozmiarze, łącznie z jednopikselową piastą koła.

Sufit detalu nie leży zresztą w mapie znaków, tylko w polu rysowania: przy `HEX = 28` heks
ma 48,5 px szerokości, a czołg jest rysowany jako 48×28 — **zajmuje już całą szerokość
heksa**. Większa mapa przy tym samym polu to wyrzucenie co drugiego piksela
(`imageSmoothingEnabled = false`). Podniesienie `HEX` jest możliwe na Full HD przy 100%
skalowania (zostaje ~1588 px na planszę), ale przy 125% skalowania Windows — domyślnym na
laptopach Full HD — zostaje ~1204 px, co ogranicza `HEX` do ~28. Obecna wartość nie jest
przypadkowa.

**Kolejność jest wymuszona i łatwa do zepsucia:**

```
mapa znaków -> outline() -> upscale(2) -> gridToPixels() -> dropShadow()
```

`outline()` musi lecieć **przed** skalowaniem, żeby kontur miał 2 px. Po skalowaniu dałby
kontur 1 px na blokach 2×2 i sprite wyglądałby na uszkodzony. `dropShadow()` (czyli `hq()`)
odwrotnie — **po**.

**Dwie reguły wynikające z pipeline'u, sprawdzone empirycznie:**

- **Każdy wystający element potrzebuje ≥3 pikseli grubości**, bo `outline()` zabiera cały
  zewnętrzny pierścień. Laweta na dwóch wierszach znika w całości pod konturem.
- **Skosów przy 2× nie ma.** Przekątna o grubości 3 zostawia po konturze jeden widoczny
  piksel i zamienia się w czarny patyk. Dlatego lufa armaty jest pozioma, choć w starej
  wersji była uniesiona. Przy autorstwie 1× skos przeżywa — i to jest granica metody:
  **2× nadaje się do jednostek, których tożsamością jest masa** (czołg: wieża, kadłub,
  gąsienica), a **utrudnia te, których tożsamością jest struktura** (armata: długa lufa,
  rozstawiona laweta, szprychy).

Rampa barwy gracza ma cztery szczeble: `h` (światło) → `b` (baza) → `m` (cień) → `B`
(cień głęboki). `m` liczy `coolShade()` — miesza kolor gracza z chłodnym granatem zamiast
go po prostu przyciemniać, bo samo przyciemnienie czyta się jak brud, a nie jak brak
światła.

Udział barwy gracza w sylwetce mierzy `node tools/png-to-grid.js <plik.png>` — wypisuje go
w pierwszej linii wraz z celem 25–35%. Warto sprawdzać, bo oko myli się tu bardzo łatwo:
przy pierwszym pomiarze okazało się, że jednostki lądowe (30/31/32%) od dawna są w normie,
a odstają **okręty** (15/12/8%) i **stolica** (4%). Miarę czyta się z gotowego assetu, nie
z rysunku sprzed potoku — cel jest skalibrowany na obrazie **po** `outline()`, który zjada
zewnętrzny pierścień pikseli `b`.

Do rysowania sprite'a poza repo (edytor pixel-artu, Aseprite przez MCP) ten sam skrypt
wypisuje paletę: `node tools/png-to-grid.js --palette` zwraca JSON znak → kolor, rozwiązany
przez tę samą funkcję, której użyje mapowanie z powrotem. Sens jest wyłącznie taki, żeby
paleta nie była nigdzie przepisywana ręcznie — literówka w hexie wyszłaby dopiero na końcu
łańcucha, jako `?` w siatce znaków. Warsztat opisuje
[Przewodnik developera](09-Przewodnik-developera.md).

### Paleta — specyfikacja odtworzeniowa

Poniższe jest opisem stanu, nie drugim źródłem prawdy: **źródłem prawdy zostaje `BASE_PAL`
w `tools/gen-sprites.js`**. Tabela istnieje po to, żeby dało się odtworzyć paletę, gdyby
plik przepadł, oraz żeby wiadomo było **za co odpowiada każdy znak** — bo sam hex tego nie
mówi, a przy 37 kolorach nie da się tego trzymać w głowie. Zrzut maszynowy zawsze bierz
z `node tools/png-to-grid.js --palette`.

33 kolory bazowe (wspólne dla wszystkich graczy):

| Rola | Znaki | Kolory |
|---|---|---|
| Kontur | `o` | `#16140c` |
| Metal / gąsienice | `g` `G` `t` | `#4a4a42` `#6a6a5e` `#2e2c24` |
| Bieżnik gąsienic | `T` | `#4a3e2c` |
| Koła / jasny metal | `w` `W` | `#8f8d7a` `#b8b4a0` |
| Worki / piaskowiec | `s` `S` `z` | `#cbb36a` `#a89050` `#e0cc8a` |
| Mrok wnętrza | `e` | `#241f14` |
| Szyby | `i` | `#7aa0b8` |
| Beton | `c` `C` `x` | `#9aa38f` `#6e7566` `#b8bfa8` |
| Cegła | `d` `D` `q` | `#a8663c` `#7a4628` `#c07a48` |
| Liście | `l` `L` `p` | `#3f7a33` `#2c5c24` `#5a9c48` |
| Pień / skóra ekwipunku | `k` `K` | `#6b4a2a` `#4a3018` |
| Skała | `r` `R` | `#8f8a76` `#6e6a58` |
| Skóra | `n` `N` | `#e8b98a` `#b8845a` |
| Markiza / jasny akcent | `a` `A` | `#c04a32` `#e8d8b0` |
| Ciemna czerwień kontenera | `u` | `#8f3222` |
| Żółte akcenty | `y` `Y` | `#ffd91c` `#b89410` |
| Piana / kilwater | `F` | `#dff0fa` |

4 kolory liczone z barwy gracza — **to je trzeba umieć odtworzyć wzorem, nie z tabeli**,
bo są inne dla każdego z 7 graczy:

| Znak | Rola | Wzór |
|---|---|---|
| `b` | baza | `PLAYERS[i].color` |
| `B` | cień głęboki | `PLAYERS[i].dark` |
| `h` | światło | `lighten(color, 0.4)` — każdy kanał `v + (255-v)·0.4` |
| `m` | cień | `coolShade(color, 0.28)` — mieszanie z granatem `[42, 36, 72]`, `v·0.72 + tint·0.28` |

**`coolShade` jest decyzją, nie szczegółem implementacyjnym.** Cień barwy gracza liczony
zwykłym przyciemnieniem (tak było kiedyś: `m` nie istniało, cieniem było `B: p.dark`)
czyta się jak brud na sprite, a nie jak brak światła. Dlatego cień idzie w chłodne barwy.
Kto kiedyś „uprości" to do mnożnika, cofnie zmianę, której nie widać w kodzie — widać ją
dopiero na sprite.

Kolory graczy (`PLAYERS` w `tools/gen-sprites.js`) — **duplikat `PLAYERS_DEF`
z `src/config.js`, synchronizowany ręcznie**, bo generator nie może zrobić `require`
na pliku bez modułów:

| # | `color` | `dark` | |
|---|---|---|---|
| 0 | `#d64550` | `#8c2530` | czerwony |
| 1 | `#3f7fd6` | `#24518f` | niebieski |
| 2 | `#3fae62` | `#22703c` | zielony |
| 3 | `#d6a53f` | `#8f6a1f` | żółty |
| 4 | `#8a4fd6` | `#5a2f8f` | fioletowy |
| 5 | `#3fc9c2` | `#1f7f7a` | turkusowy |
| 6 | `#3c3c46` | `#15151a` | boss (Czarna Legia), indeks `BOSS_SKIN` |

Dla gracza 0 daje to `h = #e68f96`, `m = #a63c4e` — dobry test, czy wzory zostały
odtworzone poprawnie.

**Wykonywalna połowa tej gwarancji to `node tools/png-to-grid.js --selftest`.** Sprawdza
trzy rzeczy naraz: że `assets/artillery_0.png` odtwarza się z `BASE_PAL` + `artilleryGrid()`
znak w znak, że pętla enkoder → dekoder jest stratna zerowo, oraz że **u żadnego z 7 graczy
dwa znaki nie mają tego samego hexa**. Ta ostatnia kontrola jest mniej oczywista, niż
wygląda: `reverseMap()` mapuje hex → znak, więc kolizja kolorów oznacza, że jeden ze znaków
po cichu znika w drodze powrotnej z PNG, a `b`/`B`/`h`/`m` liczą się z barwy gracza —
kolizja może istnieć u jednego gracza i nie istnieć u pozostałych. Stan na dziś: 37 różnych
kolorów, zero kolizji u wszystkich siedmiu.

Paleta wychodzi na zewnątrz w trzech postaciach:

```
node tools/png-to-grid.js --palette                 # znak -> hex (rysowanie ręczne)
node tools/png-to-grid.js --palette --format=list   # ["#16140c", ...] wprost do set_palette
node tools/png-to-grid.js --palette --format=gpl    # plik .gpl (Aseprite/GIMP/Krita)
```

Wszystkie trzy liczą się z tego samego `playerPalette()`, więc nie mogą się rozjechać.
`--player=N` przełącza barwy gracza.

### 2. Painter per-piksel (teren)

Kafle heksów terenu (`hexTilePixels(seed, paint)`) używają osobnego, proceduralnego mechanizmu rysującego bezpośrednio piksel po pikselu (nie przez siatkę znaków) — stąd `hex_sand/grass/water_0..2` (po 3 warianty) i `hex_shallow`.

### Przebarwianie per gracz

Kolory graczy (`PLAYERS` — lista `{color, dark}`, **musi być ręcznie zsynchronizowana** z `PLAYERS_DEF` w `src/config.js`, generator nie ma do niego dostępu przez `require`) są aplikowane przez podmianę trzech znaków palety na kolor gracza:

```js
const pal = {
  ...BASE_PAL, b: p.color, B: p.dark, h: lighten(p.color, 0.4),
  m: coolShade(p.color, 0.28),
};
```

Każdy sprite, który ma reprezentować barwy gracza, maluje odpowiednie fragmenty właśnie znakami `b`/`B`/`h`/`m`, a cała reszta palety (metal, szkło, cegła, liście...) zostaje neutralna. Stąd np. `tank_0.png` .. `tank_5.png` — ten sam kształt, przemalowany 6 razy.

Dodatkowe narzędzia: `dropShadow()` (miękki cień pod sprite'ami budynków), `composeH()` (sklejanie klatek animacji w jeden poziomy arkusz — używane dla 4-klatkowego marszu piechura, 4-klatkowej jazdy czołgu i 6-klatkowej eksplozji).

Przy klatkach kolejność jest wymuszona: **`hq()` leci per klatka, dopiero potem `composeH()`**. `dropShadow()` przesuwa alfę w prawo-dół, więc na gotowym pasku cień jednej klatki wchodziłby w kolumnę zerową następnej — a `drawImage` wycina dokładnie tyle pikseli, ile ma klatka.

### Rozmiary i nazewnictwo plików

Każdy sprite zapisywany jest przez `save(name, pixels)` jako `assets/<name>.png`. Konwencja nazw jednostek: `<typ>_<idGracza>` (np. `tank_2`, `artillery_5`, `soldier_0`). Okręty: `ship0_<id>` / `ship1_<id>` / `ship2_<id>`.

Trzy pliki są **paskami klatek**, nie pojedynczymi obrazami — `drawImage` wycina z nich klatkę po indeksie, więc rozmiar pliku to wielokrotność rozmiaru klatki:

| Plik | Rozmiar pliku | Klatka | Klatek |
|---|---|---|---|
| `soldier_<id>.png` | 96×30 | 24×30 | 4 (marsz) |
| `tank_<id>.png` | 192×28 | 48×28 | 4 (jazda) |
| `explosion.png` | 288×48 | 48×48 | 6 |

## Wczytywanie (`src/sprites.js`)

`loadSprites()` buduje globalny obiekt `SPR`, ładując każdy PNG jako zwykły `new Image()` (bez czekania na załadowanie — canvas po prostu nic nie rysuje, dopóki obraz się nie doczyta, sprawdzane przez `sprOk(img)`: `img.complete && img.naturalWidth > 0`). Struktura `SPR`:

```js
SPR = {
  tanks: [img0..img5], soldiers: [...], artillery: [...], capitals: [...],
  ships: [[barka, pancernik, lotniskowiec], ...] (per gracz),
  cities: [img0,img1,img2], cityPort, crane,
  trees: [img0,img1], rocks: [img0,img1],
  res: { oil, farm, mine },
  hexSand: [v0,v1,v2], hexGrass: [...], hexWater: [...], hexShallow,
  explosion,   // arkusz 6 klatek 48×48 obok siebie
}
```

## Pipeline renderowania (`src/render.js`)

Canvas jest ustawiany raz (`setupCanvas`): rozmiar `BOARD_PX_W × BOARD_PX_H` przemnożony przez `devicePixelRatio` (ostre wyświetlanie na ekranach Retina/HiDPI), `ctx.imageSmoothingEnabled = false` (**twardy wymóg pixel-artu** — bez tego przeglądarka rozmywałaby powiększone sprite'y).

Główna pętla `frame(now)` (wołana przez `requestAnimationFrame`) co klatkę:
1. Aktualizuje animacje (`anims` — tween pozycji przy ruchu armii, 0.18s), napisy strat (`floaters`, 1.2s) i eksplozje (`effects`, 0.48s), usuwając te, które wygasły.
2. Sprawdza timer tury (`checkTurnTimer`).
3. Woła `draw(now)`.

`draw(now)` rysuje w tej kolejności (kolejność ma znaczenie — późniejsze elementy przykrywają wcześniejsze):

```
tło (kolor bazowy)
→ kafle terenu (drawTile — sprite + półprzezroczysta kalka koloru właściciela + piana wybrzeża)
→ drogi (drawRoads — asfalt z przerywaną linią środkową, albo przygaszona czerwona kreska jeśli przerwana)
→ granice terytoriów (drawBorders — kontur w ciemnym kolorze gracza wzdłuż krawędzi z cudzym/niczyim terenem)
→ podświetlenia (zaznaczone pole + dostępne ruchy — czerwonawe dla wrogich, białe dla pustych/własnych + hover)
→ miasta i dekoracje (drawCity / drawDecor — drzewa/skały tylko gdy pole puste)
→ sprite'y armii (drawArmySprite — sprite typu jednostki albo klasy okrętu)
→ znaczniki miast i złóż (drawTileMarks — gwiazdka/klin przy górnym wierzchołku)
→ HUD armii (drawArmyHud — liczba siły, pasek morale, odznaka weterana, puls zaznaczenia)
→ eksplozje (arkusz 6 klatek, indeksowany po czasie trwania efektu)
→ floatery strat (unoszący się tekst "-N" z zanikającą przezroczystością)
```

Jednostka rysuje się **w dwóch przebiegach, nie w jednym**, i to nie jest kosmetyka —
między nimi wchodzą znaczniki miast i złóż. Znacznik MUSI iść nad sprite'em, bo inaczej
nie rozwiązuje problemu, dla którego powstał (czołg 48×28 zasłania miasto 46×38), ale MUSI
iść pod liczbą siły i paskiem morale, bo pierwsza wersja szła na samym wierzchu i zjadała
liczbę siły. Zasłonić sprite wolno, zasłonić danych nie.

Ta kolejność ma jeszcze jedną konsekwencję, którą łatwo przeoczyć: skoro znacznik pojawia
się domyślnie tylko na heksie z jednostką, to **zawsze** współistnieje z HUD-em. Kolizja
z liczbą siły i paskiem morale przestaje być przypadkiem brzegowym i staje się jedynym
przypadkiem — dlatego glify siedzą u góry (patrz niżej).

### Znaczniki miast i złóż (`drawTileMarks`)

**Stolica to korona, miasto to gwiazdka, złoże to klin**, wszystkie w korytarzu
**górnego wierzchołka** heksa. Kształt niesie kategorię, barwa rodzaj: gwiazdka srebrna =
miasto, granatowa = port; klin zielony = farma, czarny = ropa, brązowy = kopalnia.
Stolica jest jedynym rodzajem wyjętym z kanału barwy — patrz „Dlaczego stolica ma własny
kształt" niżej; jej złoto (`#ffd21e`) zostało to samo, co przy gwiazdce z 0.8.0.

**Domyślnie znacznik pojawia się TYLKO na heksie z jednostką** — czyli tam, gdzie coś
faktycznie zasłania. Puste miasto pokazuje swój sprite i znacznik nic by tam nie wniósł
poza bałaganem, a to właśnie bałagan przesądził o odrzuceniu pierwszej wersji. Przycisk
**Znaczniki miast** w panelu bocznym (klawisz **D**) pokazuje wszystkie; preferencja żyje
w `localStorage` pod kluczem `hexgeneral.view` i nie wchodzi do zapisu gry.

#### Reguła, która zastąpiła „łuk przy krawędzi"

Wersja z 0.7.1 kładła łuk przy krawędzi, uzasadniając to tym, że krawędź jest wolna.
**Nie jest** — siedzą tam trzy pierścienie podświetleń: zasięg ruchu (0,86), zaznaczenie
(0,92) i hover (0,95). Co gorsza, żaden łuk nie może ich ominąć: `hexPath()` i dawne
`hexArcPath()` kreślą TEN SAM sześciokąt w różnych skalach, a dwa współśrodkowe
sześciokąty o tej samej orientacji nigdy się nie przecinają. Kreska o półgrubości `w/2`
wokół skali `s` pokrywa pas skal `s ± (w/2)/24,249`, więc ominięcie wszystkich trzech
wymaga `s < 0,726` (wnętrze sprite'a jednostki) albo `s > 1,084` (poza kaflem). Cała
rodzina łuków odpada na arytmetyce, nie na guście — stary łuk zamalowywał **33% obwodu
każdego pierścienia**.

Dlatego znacznik żyje **promieniowo**, a nie stycznie, i obowiązuje go:

> **`0,866·r + 0,5·|d| ≤ 20,10`** — `r` to promień punktu z półgrubością konturu,
> `d` odchylenie boczne od osi wierzchołka, a 20,10 to wewnętrzna krawędź pierścienia 0,86.

#### Dlaczego akurat górny wierzchołek

HUD jednostki rysuje się **po** znacznikach, więc każdy jego piksel wygrywa. To zamyka
dwa z trzech korytarzy:

| korytarz | co tam siedzi |
|---|---|
| 90° (dół) | liczba siły (x−1…x+19, y+12,5…y+25) i pasek morale (x−17…x−1, y+15…y+19) |
| 210° (górny lewy) | odznaka weterana (x−21,75…x−10,25, y−22…y−7,5) |
| **270° (góra)** | **wolny** — i jako jedyny leży NAD sprite'em każdej jednostki (czołg kończy się na y−16, piechota y−15, artyleria y−13) |

Skoro miasto i złoże nigdy nie dzielą heksa (mapgen sadzi złoża tylko na polach bez
miasta), oba mogą zająć ten sam korytarz.

#### Świadome odstępstwo: barwa niesie informację

Prawie każdy odcień jest już kolorem imperium: Werdania `#3fae62` (zieleń złoża), Aurelia
`#d6a53f` (złoto stolicy), Lazuria `#3f7fd6` (granat portu), Czarna Legia `#3c3c46` (czerń
ropy). Do zniesienia, bo barwa imperium pojawia się WYŁĄCZNIE jako 30-procentowa kalka na
całym heksie i obwódka granicy — nigdy jako mały glif przy wierzchołku. To inny kanał,
a kategorię i tak niesie kształt.

#### Dlaczego stolica ma własny kształt (0.8.1)

W 0.8.0 stolica była **złotą gwiazdką** i zapisaliśmy to jako świadome ryzyko: odznaka
elitarnego weterana (`vet >= 15`) jest tą samą gwiazdką z `drawStarPath()`, więc stolica
obsadzona elitą nosiła dwie złote gwiazdki 16 px od siebie — „elita w stolicy zdarza się
rzadko". Pierwsza osoba testująca odrzuciła gwiazdkę na stolicy od razu. Warto rozdzielić
dwie rzeczy: te glify **nie zasłaniały się** (pozycja i rozmiar 6 vs 5 px je rozróżniały),
tylko **myliły** — a przy 12 px różnica złoto/srebro i tak była słabszym nośnikiem rangi
niż sylwetka. Stolica dostała więc koronę i jako jedyna niesie rodzaj kształtem.

Korona (`MARK_CROWN_PTS`) to trzy zęby, środkowy wyższy — i ta asymetria jest wymuszona
budżetem, nie stylizacją. Ząb boczny stoi na `r = 17,5`, bo odsunięcie o 6,8 px w bok zjada
3,4 px z tej samej nierówności; środkowy, na osi, dochodzi do 20,5. Przy zębach równej
wysokości cała korona musiałaby zejść do 17,5 i wyglądałaby na wciśniętą w sprite jednostki.
Półszerokość 6,8 ma jeszcze drugi sufit — pudełko odznaki weterana zaczyna się na `x−10,25`,
a kontur dokłada 1,5 px, więc 8,75 to koniec niezależnie od promienia.

**Wcięcia są tu wielkością krytyczną**, bo `markFill()` kreśli kontur 3 px PRZED
wypełnieniem: każda ściana wcięcia wrzuca do środka 1,5 px ciemnego, więc przy prześwicie
poniżej ~3 px obwódki schodzą się i ząb znika. Odrzucone w audycji warianty przegrały
dokładnie na tym — blanki z prostokątnymi zębami (prześwit 4,2 px) czytały się jako złota
sztabka, a obręcz z trzema kulkami zlała się we wspólnym konturze w plamę. Kto chce
gęstszą koronę, musi najpierw ścienić kontur — a to jest ta sama decyzja, co u złóż:
kontur jest po to, żeby glif odkleił się od tła.

#### Kontur zależy od jasności wypełnienia

To nie kosmetyka: zieleń farmy pada na trawę, brąz kopalni na piasek, a czerń ropy na
ciemny teren — każdy kolor trafia dokładnie na to tło, z którym się zlewa. Jasne glify
dostają więc kontur ciemny (`rgba(22,20,12,0.62)`), ciemne — ropa i port — jasny
(`rgba(240,236,220,0.72)`). Pole `dark` w `MARK_CITY`/`MARK_WEDGE` opisuje jasność
**wypełnienia**, a kontur wychodzi z niej przez negację, więc nowy glif wymaga jednej
decyzji, nie dwóch.

Alfa zamiast pełnego krycia jest osobną poprawką z tej samej rundy: do 0.7.2 znacznik był
JEDYNYM w pełni nieprzezroczystym elementem przy krawędzi heksa (obrys 0,35, piana 0,75,
kalka właściciela 0,30, podświetlenia 0,22–0,9) i to dlatego czytał się jako ciało obce.
Zawsze przez `rgba()`, **nigdy** przez `globalAlpha` — te funkcje nie mają `save/restore`,
a `draw()` zeruje alfę dopiero przy floaterach, więc ustawienie wyciekłoby na HUD.

#### Promienie są dosunięte do sufitu

Zmierzone zapasy do pierścienia 0,86: gwiazdka **0,08 px**, klin **0,03 px**, korona
**0,04 px** — i to zębem bocznym, nie środkowym, który ma jeszcze 0,85 px luzu. Podniesienie
glifu choćby o pół piksela zaczyna zjadać pierścień. Kto chce wyżej, musi najpierw glif
zmniejszyć albo ścienić kontur — przy klinie 0,1 px zabrane z szerokości podstawy kupuje
0,058 px wysokości (przy odwróconym grocie to narożniki podstawy leżą najdalej od środka,
a nie wierzchołek).

### `drawArmySprite` — wybór sprite'a jednostki

Na lądzie wybór jest **wprost po `army.type`** (trójstronna gałąź `if/else if/else`): `'infantry'` → `SPR.soldiers` (marsz, 4 klatki), `'tank'` → `SPR.tanks` (jazda, 4 klatki), `'artillery'` → `SPR.artillery` (statyczny). Na wodzie wybór jest **wprost po `army.str`** (progi 20/70) i niezależny od `army.type` — klasa okrętu jest czysto kosmetyczna (patrz [Mechanika rozgrywki](04-Mechanika-rozgrywki.md)).

**Kiedy animowana jednostka faktycznie się rusza** — reguła jest wspólna i ma powód: animuje się **tylko jednostka zaznaczona przez gracza**, bo gdyby ruszały się wszystkie, plansza migotałaby od stojących w miejscu oddziałów.

Czołg ma nad piechurem jeden dodatkowy wyzwalacz: w trakcie przejazdu między heksami klatka jest liczona z **postępu tweenu** (`anims`, 0,18 s), a nie z zegara. Dzięki temu na jeden krok przypada dokładnie jeden pełny obrót gąsienicy, niezależnie od tempa gry — przy zegarze krok trwałby ~1,5 klatki i przejazd byłby migawką, a nie jazdą.

Sama gąsienica przewija się w **przeciwne strony** na górze i na dole (jest pętlą; w tę samą stronę czytałaby się jak ślizg w bok). Uwaga na pułapkę, która już raz to zepsuła: dolny pas ogniw musi leżeć w **przedostatnim** wierszu mapy, bo ostatni styka się z przezroczystością i `outline()` zamienia go w całości na kontur — przewijanie było tam niewidoczne.

### Elementy HUD rysowane wektorowo (nie sprite'ami)

Kilka elementów nad jednostką jest rysowanych bezpośrednio poleceniami canvasu 2D, nie jako obrazek PNG:

- **Liczba siły** — pogrubiony tekst arkadowy (żółty z czarnym konturem, `strokeText`+`fillText`).
- **Pasek morale** — dwa nachodzące na siebie prostokąty (ciemne tło + kolorowy wypełniacz, zielony/żółty/czerwony wg progu).
- **Odznaka weterana** (`drawVetBadge`) — 1–3 krokiewki (grube złote linie z czarnym obrysem) albo złota gwiazdka na maksymalnym poziomie weterancji, progi opisane w [Mechanice rozgrywki](04-Mechanika-rozgrywki.md).
- **Puls zaznaczenia** — pulsująca biała ramka (`sin(now/140)`) wokół aktualnie wybranej jednostki.

## Regeneracja sprite'ów

Po każdej zmianie w `tools/gen-sprites.js` trzeba ręcznie uruchomić `node tools/gen-sprites.js` i **scommitować zmienione pliki `assets/*.png`** — bez tego kroku zmiana w generatorze nie ma żadnego efektu w grze (patrz [Przewodnik developera](09-Przewodnik-developera.md)).

### Archiwum poprzednich wersji grafiki

Generator nadpisuje `assets/*.png` w miejscu, więc **przemalowanie sprite'a kasuje poprzednią wersję** — zostaje wyłącznie w historii gita, do odzyskania trzeba znać commit, w którym zniknęła. Przy porównywaniu wariantów chce się ją mieć po prostu obok, jako plik.

Dlatego przed przemalowaniem:

```
node tools/archive-assets.js tank      # tank_0.png .. tank_6.png
node tools/archive-assets.js --all     # cały obecny stan assets/
```

Kopie lądują w `archiwum/` z datą w nazwie (`tank_0_2026-08-02.png`). Data, a nie numer wersji, bo grafika bywa wymieniana częściej niż wersja gry — dwa warianty tego samego sprite'a w jednej wersji dostałyby ten sam numer. Skrypt nie nadpisuje istniejącej kopii: druga próba tego samego dnia oznaczałaby, że to pierwsza kopia jest tą starą wersją, którą chcemy zachować.

**Katalog leży poza `assets/` świadomie.** `tools/pack-build.js` czyta `assets/` i bierze wszystko, co kończy się na `.png`; podkatalog dziś by się nie załapał, ale to przypadek, nie gwarancja. Katalog na poziomie repo nie trafi do buildu nigdy, bo pack-build działa na allowliście. Rozmiar nie jest problemem — całe `assets/` to ~29 KB.
