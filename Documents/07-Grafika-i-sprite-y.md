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

### 2. Painter per-piksel (teren)

Kafle heksów terenu (`hexTilePixels(seed, paint)`) używają osobnego, proceduralnego mechanizmu rysującego bezpośrednio piksel po pikselu (nie przez siatkę znaków) — stąd `hex_sand/grass/water_0..2` (po 3 warianty) i `hex_shallow`.

### Przebarwianie per gracz

Kolory graczy (`PLAYERS` — lista `{color, dark}`, **musi być ręcznie zsynchronizowana** z `PLAYERS_DEF` w `src/config.js`, generator nie ma do niego dostępu przez `require`) są aplikowane przez podmianę trzech znaków palety na kolor gracza:

```js
const pal = { ...BASE_PAL, b: p.color, B: p.dark, h: lighten(p.color, 0.4) };
```

Każdy sprite, który ma reprezentować barwy gracza, maluje odpowiednie fragmenty właśnie znakami `b`/`B`/`h`, a cała reszta palety (metal, szkło, cegła, liście...) zostaje neutralna. Stąd np. `tank_0.png` .. `tank_5.png` — ten sam kształt, przemalowany 6 razy.

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
→ znaczniki miast i złóż (drawTileMarks — łuk przy krawędzi heksa)
→ HUD armii (drawArmyHud — liczba siły, pasek morale, odznaka weterana, puls zaznaczenia)
→ eksplozje (arkusz 6 klatek, indeksowany po czasie trwania efektu)
→ floatery strat (unoszący się tekst "-N" z zanikającą przezroczystością)
```

Jednostka rysuje się **w dwóch przebiegach, nie w jednym**, i to nie jest kosmetyka —
między nimi wchodzą znaczniki miast i złóż. Znacznik MUSI iść nad sprite'em, bo inaczej
nie rozwiązuje problemu, dla którego powstał (czołg 48×28 zasłania miasto 46×38), ale MUSI
iść pod liczbą siły i paskiem morale, bo pierwsza wersja szła na samym wierzchu i zjadała
liczbę siły. Zasłonić sprite wolno, zasłonić danych nie.

### Znaczniki miast i złóż (`drawTileMarks`)

Dolny łuk przy krawędzi heksa = miasto (podwójny = stolica), górny = złoże. Trzy decyzje,
każdą wymusza to, co na heksie już jest:

- **łuk przy krawędzi, nie ikona w środku** — środek należy do sprite'a jednostki,
  a krawędzi nie dosięga bounding box żadnego z nich (także przyszłego);
- **promień 0,88 zamiast 1,0** — na samej krawędzi siedzą już obrys heksa, piana wybrzeża
  i granica imperium;
- **rozróżnianie kształtem i położeniem, nie barwą** — prawie każdy odcień jest kolorem
  któregoś imperium (`PLAYERS_DEF`), a z rzeczy rysowanych przy krawędzi biały pełny obrys
  to zaznaczenie (0,92), biały przerywany to zasięg ruchu (0,86), a złoty to wybór celu
  drogi. Stąd też linia zawsze ciągła i stolica oznaczona drugim łukiem do wewnątrz,
  a nie dłuższym obrysem — ten zlałby się z ramką zaznaczenia i hoveru.

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
