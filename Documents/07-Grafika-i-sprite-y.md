# Grafika i sprite'y

## Filozofia

Cały wizualny styl gry to pixel-art nawiązujący do *Metal Slug*: sprite'y z wyraźnym czarnym konturem, nasycone kolory, militarno-arkadowy HUD. **Żaden sprite nie jest rysowany ręcznie w edytorze grafiki** — wszystkie pliki PNG w `assets/` są generowane proceduralnie przez skrypt `tools/gen-sprites.js`, uruchamiany ręcznie z Node (`node tools/gen-sprites.js`), i dopiero wynikowe pliki są commitowane do repo (bo gra nie ma etapu builda, który mógłby je wygenerować przy starcie — patrz [Przegląd projektu](01-Przeglad-projektu.md)).

## Generator (`tools/gen-sprites.js`)

Skrypt nie ma żadnych zależności npm — łącznie z **własnoręcznie napisanym enkoderem PNG** (zlib + CRC32, korzysta tylko z wbudowanego modułu `zlib` Node). Ma dwa niezależne "malarze":

### 1. Painter siatki znaków (jednostki, budynki, drobiazgi)

Prosty system: `makeGrid(w,h)` tworzy 2D tablicę znaków wypełnioną `.` (przezroczystość), a funkcje `P()` (pojedynczy piksel), `rect()` (prostokąt) i `ellipseFill()` (elipsa) malują nią konkretnymi znakami z palety `BASE_PAL` (np. `t`=gąsienice, `w`/`W`=koła, `g`/`G`=metal działa, `b`/`B`/`h`=kolor gracza — ciało/cień/podświetlenie). Na koniec `outline(g)` automatycznie zamienia każdy kolorowy piksel stykający się z przezroczystością na czarny kontur — **żaden sprite nie rysuje konturu ręcznie**, dostaje go za darmo z tej jednej funkcji.

Tym mechanizmem namalowane są m.in.:
- `tankGrid()` — czołg 48×28
- `artilleryGrid()` — armata polowa 44×26 (koła, laweta, tarcza w kolorze gracza, ukośna lufa rysowana schodkowo małymi prostokątami)
- `soldierTop()` + `legsGrid(phase)` — piechur 24×30/klatkę, głowa+tułów stałe, animują się tylko nogi (4 fazy chodu)
- `capitalGrid()` — stolica (kwatera główna) 48×34
- `city0/1/2()` — 3 warianty zwykłego miasta 46×38
- `cityPort()` — miasto-port z żurawiem i keją
- `craneGrid()` — sam żuraw (nakładka na stolicę-port)
- `ship0/1/2()` — 3 klasy okrętów: barka desantowa, pancernik, lotniskowiec
- `resOil/resFarm/resMine()` — złoża surowców
- drzewa i skały (po 2 warianty każde)

### 2. Painter per-piksel (teren)

Kafle heksów terenu (`hexTilePixels(seed, paint)`) używają osobnego, proceduralnego mechanizmu rysującego bezpośrednio piksel po pikselu (nie przez siatkę znaków) — stąd `hex_sand/grass/water_0..2` (po 3 warianty) i `hex_shallow`.

### Przebarwianie per gracz

Kolory graczy (`PLAYERS` — lista `{color, dark}`, **musi być ręcznie zsynchronizowana** z `PLAYERS_DEF` w `src/config.js`, generator nie ma do niego dostępu przez `require`) są aplikowane przez podmianę trzech znaków palety na kolor gracza:

```js
const pal = { ...BASE_PAL, b: p.color, B: p.dark, h: lighten(p.color, 0.4) };
```

Każdy sprite, który ma reprezentować barwy gracza, maluje odpowiednie fragmenty właśnie znakami `b`/`B`/`h`, a cała reszta palety (metal, szkło, cegła, liście...) zostaje neutralna. Stąd np. `tank_0.png` .. `tank_5.png` — ten sam kształt, przemalowany 6 razy.

Dodatkowe narzędzia: `dropShadow()` (miękki cień pod sprite'ami budynków), `composeH()` (sklejanie klatek animacji w jeden poziomy arkusz — używane dla 4-klatkowego marszu piechura i 6-klatkowej eksplozji).

### Rozmiary i nazewnictwo plików

Każdy sprite zapisywany jest przez `save(name, pixels)` jako `assets/<name>.png`. Konwencja nazw jednostek: `<typ>_<idGracza>` (np. `tank_2`, `artillery_5`, `soldier_0`). Okręty: `ship0_<id>` / `ship1_<id>` / `ship2_<id>`.

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
→ armie (drawArmy — sprite typu/klasy okrętu + liczba siły + pasek morale + odznaka weterana)
→ eksplozje (arkusz 6 klatek, indeksowany po czasie trwania efektu)
→ floatery strat (unoszący się tekst "-N" z zanikającą przezroczystością)
```

### `drawArmy` — wybór sprite'a jednostki

Na lądzie wybór jest **wprost po `army.type`** (trójstronna gałąź `if/else if/else`): `'infantry'` → `SPR.soldiers` (z animacją marszu — 4 klatki, ale animuje się **tylko** jednostka aktualnie zaznaczona przez gracza, żeby plansza się nie "migotała" masowo), `'tank'` → `SPR.tanks`, `'artillery'` → `SPR.artillery`. Na wodzie wybór jest **wprost po `army.str`** (progi 20/70) i niezależny od `army.type` — klasa okrętu jest czysto kosmetyczna (patrz [Mechanika rozgrywki](04-Mechanika-rozgrywki.md)).

### Elementy HUD rysowane wektorowo (nie sprite'ami)

Kilka elementów nad jednostką jest rysowanych bezpośrednio poleceniami canvasu 2D, nie jako obrazek PNG:

- **Liczba siły** — pogrubiony tekst arkadowy (żółty z czarnym konturem, `strokeText`+`fillText`).
- **Pasek morale** — dwa nachodzące na siebie prostokąty (ciemne tło + kolorowy wypełniacz, zielony/żółty/czerwony wg progu).
- **Odznaka weterana** (`drawVetBadge`) — 1–3 krokiewki (grube złote linie z czarnym obrysem) albo złota gwiazdka na maksymalnym poziomie weterancji, progi opisane w [Mechanice rozgrywki](04-Mechanika-rozgrywki.md).
- **Puls zaznaczenia** — pulsująca biała ramka (`sin(now/140)`) wokół aktualnie wybranej jednostki.

## Regeneracja sprite'ów

Po każdej zmianie w `tools/gen-sprites.js` trzeba ręcznie uruchomić `node tools/gen-sprites.js` i **scommitować zmienione pliki `assets/*.png`** — bez tego kroku zmiana w generatorze nie ma żadnego efektu w grze (patrz [Przewodnik developera](09-Przewodnik-developera.md)).
