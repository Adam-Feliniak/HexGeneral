# Przewodnik developera

## Uruchomienie

Brak builda, brak serwera, brak `npm install`. Wystarczy otworzyć `index.html` bezpośrednio w przeglądarce. Do skryptów pomocniczych w `tools/` wystarczy zwykły Node.js (bez żadnych zależności npm — cały projekt, łącznie z enkoderem PNG, jest napisany na czystym `fs`/`zlib`/`path`).

## Typowe zadania

### Dodanie/zmiana tekstu UI

1. Dodaj/zmień klucz we **wszystkich trzech** plikach: `locales/pl.json`, `locales/en.json`, `locales/de.json` (ten sam klucz, trzy tłumaczenia).
2. Uruchom `node tools/build-locales.js` — przebudowuje `src/locales-data.js`.
3. **Nigdy nie edytuj `src/locales-data.js` ręcznie** — to plik generowany, ręczna zmiana zniknie przy następnym uruchomieniu skryptu i będzie niespójna z `locales/*.json`.
4. Jeśli tekst ma pojawić się statycznie w HTML: dodaj atrybut `data-i18n="klucz"` (zwykły tekst) albo `data-i18n-html="klucz"` (tekst z `<b>` itp.) do elementu w `index.html`.

### Dodanie/zmiana sprite'a

1. Edytuj `tools/gen-sprites.js` — dodaj nową funkcję malującą (wzorując się na istniejących, np. `tankGrid()`/`artilleryGrid()` dla jednostek lądowych) albo zmień istniejącą.
2. Jeśli sprite ma być przebarwiany per gracz — zarejestruj go w pętli `PLAYERS.forEach(...)` na końcu pliku, malując fragmenty w kolorze gracza znakami `b`/`B`/`h` z palety.
3. Uruchom `node tools/gen-sprites.js` — nadpisuje pliki w `assets/`.
4. Jeśli dodano nowy plik/kategorię sprite'a: zarejestruj go w `src/sprites.js` (`loadSprites()`), żeby trafił do globalnego `SPR`.
5. **Scommituj zmienione/nowe pliki `assets/*.png`** razem ze zmianą w generatorze — gra nie ma builda, który mógłby je wygenerować automatycznie, więc PNG-i muszą być w repo na bieżąco.

Pełny opis systemu malowania (paleta, `outline()`, przebarwianie) w [Grafice i sprite'ach](07-Grafika-i-sprite-y.md).

### Dodanie/strojenie dźwięku

Uwaga na różnicę wobec sprite'ów: **dźwięki nie są plikami w repo**. Gra syntezuje je
w runtime z przepisów, więc nie ma czego regenerować ani commitować — zmiana przepisu
działa od razu po odświeżeniu strony.

1. Edytuj przepis w `SFX_RECIPES` (`src/audio.js`) — jedna funkcja `(rate) => Float32Array`
   na dźwięk, wzorem `explosion()`/`shot()`. Do dyspozycji `addTone()` (oscylator
   z przemiataniem wysokości), `addNoise()` (szum z filtrem dolnoprzepustowym)
   i `finishBuffer()` (normalizacja + wygaszenie ogona).
2. **Odsłuchaj:** `node tools/gen-sounds.js --only=explosion` renderuje dźwięk do
   `dist/sfx/explosion.wav` — otwórz go w edytorze audio, żeby zobaczyć przebieg
   i porównać wersje przed/po. `--rate=44100` daje podglądowo wyższą jakość.
   Gra tych plików **nie wczytuje**, `dist/` jest gitignorowane.
3. Powtarzaj 1-2, aż zabrzmi dobrze.
4. Nowy dźwięk: dodaj klucz do `SFX_RECIPES`, potem wywołaj go z kodu **zawsze przez
   osłonę** `if (typeof playSfx === 'function') playSfx('nazwa');` — harnessy
   (`stress.js`, `sim.js`) i `visual-test.html` ładują logikę bez `audio.js`.
5. Rozważ wpis w `SFX_MIN_GAP` (odstęp między powtórzeniami) i `SFX_ALWAYS` (czy dźwięk
   ma przechodzić przy przyspieszonym AI) — bez tego dźwięk częstego zdarzenia zamienia
   się w karabin maszynowy w trybie obserwatora.

Muzyka to partytury `MUSIC_TRACKS` (tabela `[ćwierćnuta, długość, MIDI, instrument]`),
grane oscylatorami — nie da się ich odsłuchać generatorem, trzeba uruchomić grę.

Pełny opis (dlaczego proceduralnie, inwentarz, pułapki) w [Dźwięku](14-Dzwiek.md).

### Dodanie nowej mechaniki gry

Ponieważ nie ma modułów, nowa funkcja w dowolnym `src/*.js` jest natychmiast widoczna dla wszystkich pozostałych plików — nie trzeba nic eksportować/importować. Jedyne, o czym trzeba pamiętać:
- Jeśli nowy kod dotyka DOM-u (`document.*`), owiń go strażnikiem `if (typeof document === 'undefined') return;` na początku funkcji, żeby logika gry dała się nadal uruchamiać headless (patrz niżej).
- Jeśli nowy kod wykonuje się **natychmiast** przy wczytaniu pliku (nie tylko definiuje funkcję), sprawdź kolejność `<script>` w `index.html` — musi być po wszystkim, czego używa.

## Weryfikacja bez przeglądarki (headless Node)

Repo **nigdy nie miało formalnych testów jednostkowych** i nie ma żadnego frameworka testowego. Zamiast tego, pliki `src/*.js` mają wbudowane osłony `typeof document === 'undefined'`, co pozwala uruchomić samą logikę gry (bez rysowania) w zwykłym Node.js przez `vm.createContext` — przydatne np. do weryfikacji zmian w mechanice walki/ruchu albo do symulacji AI-vs-AI sprawdzającej, że nic nie rzuca wyjątkiem.

Szkielet takiego harnessu (użyty realnie do zweryfikowania wprowadzenia typów jednostek):

```js
const vm = require('vm');
const fs = require('fs');

// pliki DOM-owe (ui.js, menu.js) też można doładować — mają własne strażniki
const files = ['src/config.js','src/locales-data.js','src/i18n.js','src/geometry.js',
  'src/utils.js','src/mapgen.js','src/state.js','src/combat.js','src/roads.js',
  'src/empire.js','src/turns.js','src/ai.js','src/ui.js','src/menu.js'];

const sandbox = { console, Math, JSON, Infinity, performance: { now: () => Date.now() } };
vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });

function run(code) { return vm.runInContext(code, sandbox); }

// newGame() NIE zwraca stanu — ustawia globalną zmienną `state` (w kontekście vm)
run("newGame({ humanCount: 1, botCount: 3, aiDifficulty: 'normal', seed: 12345, timeLimit: Infinity });");
console.log(run('state.players.length'));   // odczyt stanu przez kolejne wywołania run()
```

Uwaga praktyczna: `newGame(opts)` przyjmuje **obiekt opcji** (`{ humanCount, botCount, aiDifficulty, seed, timeLimit }`), nie argumenty pozycyjne — i nic nie zwraca, tylko nadpisuje globalną zmienną `state`. Symulacja pełnej rozgrywki AI-vs-AI (przydatna do sprawdzenia, że zmiana w mechanice nie wywala wyjątku w żadnym scenariuszu) wygląda tak:

```js
run(`(() => {
  newGame({ humanCount: 1, botCount: 3, aiDifficulty: 'normal', seed: 999, timeLimit: Infinity });
  state.players.forEach(p => { p.isHuman = false; if (p.difficulty == null) p.difficulty = 'normal'; });
  for (let turn = 0; turn < 60; turn++) {
    for (const p of state.players) {
      if (!p.alive) continue;
      const diff = resolveDifficulty(p.difficulty);
      let activations = ACTIVATIONS_PER_TURN, guard = 0;
      while (activations > 0 && guard++ < 50) {
        const mv = aiPickMove(p.id, diff);
        if (!mv) break;
        activations -= executeMove(mv.from, mv.to);
      }
      produce(p.id);
      resetMoved(p.id);
    }
  }
})()`);
```

## Wsadowy runner balansu (`tools/sim.js`)

Nadbudowa nad powyższym harnessem: `node tools/sim.js` rozgrywa **N pełnych partii
AI-vs-AI** i zbiera statystyki, zamieniając „jeden dziwny wynik to pewnie wariancja"
w twarde liczby. Zero zależności; gry biegną **równolegle** na wielu rdzeniach
(`worker_threads`), każdy wątek w osobnym kontekście `vm`.

```
node tools/sim.js --games=200                       # 2 graczy, normal vs normal
node tools/sim.js --games=200 --players=4 --diff=hard
node tools/sim.js --games=100 --mirror --diffs=normal,hard
node tools/sim.js --games=1 --seed=12345 --list     # powtórka jednej konkretnej partii
node tools/sim.js --help
```

Najważniejsze cechy (i dlaczego tak):

- **Determinizm.** Każda partia jest w pełni odtwarzalna z jej seeda, **niezależnie od
  liczby wątków**. Mapę seeduje `generateMap()`, ale walka/AI wołają globalny
  `Math.random` — więc runner podmienia `Math.random` w sandboxie na seedowany
  strumień (mulberry32) per gra. Bez tego seed odtwarzałby tylko mapę, nie przebieg.
- **Tryb `single` się nie nadaje.** `checkGameOver()` w trybie `single` kończy grę, gdy
  padnie slot 0 (`state.human`), a nie gdy zostaje jedno imperium. Runner wymusza tryb
  `multi` (`humanCount = liczba graczy`), a potem przełącza wszystkich na AI — dzięki
  temu partia toczy się do ostatniego stojącego.
- **Pętla ręczna, nie `startTurn`/`aiStep`.** Te używają `setTimeout`/bannerów; runner
  replikuje przebieg wprost: `resetMoved` → do `ACTIVATIONS_PER_TURN` aktywacji `aiPickMove`/
  `executeMove` → `produce`.
- **`--mirror` znosi bias pozycji.** Sloty startują na stałych stolicach i w stałej
  kolejności tur, co samo w sobie przechyla win-rate. Bez `--mirror` raport pokazuje
  zwycięstwa **wg slota** (przewaga trudności zmieszana z pozycją); z `--mirror` runner
  gra każdą mapę we wszystkich rotacjach przypisania trudności do slotów i agreguje
  wynik **wg trudności** — czysta przewaga trudności. (Przykład: `hard` vs `normal`
  potrafi dać 77% „wg slota", ale 66% „wg trudności", bo reszta to była lepsza pozycja.)
- **Remisy to metryka, nie błąd.** Równe AI często turtlują — przy limicie rund partia
  bez rozstrzygnięcia liczy się jako remis, a wysoki odsetek remisów sam w sobie mówi
  coś o balansie. Limit `--max-turns` domyślnie 500 (gry rozstrzygają się zwykle w
  300–500 rundach).

## Harness stabilnościowy (`tools/stress.js`)

Uzupełnienie sim.js o to, czego sim NIE ćwiczy: sim gra przez czystą warstwę logiki
(`aiPickMove`/`executeMove`/`produce`), a stress przechodzi przez **prawdziwą pętlę
gry i ścieżki człowieka** — kliknięcia przez `onTileClick` (selekcje, ruchy,
road-pick, `switchHuman`), pętlę tur z `setTimeout` (aiStep, auto-koniec tury) na
ręcznie pompowanej kolejce timeoutów i kontrolowanym zegarze `performance.now`,
zapis/wczytanie w środku partii, „Nową mapę" w trakcie zakolejkowanych timeoutów
starej gry (test osłon `gameId`) oraz timer tury w multi.

```
node tools/stress.js --games=200                # fuzz: losowe legalne akcje + inwarianty
node tools/stress.js --games=1 --seed=123       # reprodukcja konkretnej partii
node --expose-gc tools/stress.js --mode=soak    # sesja: 10+ partii z rzędu, trend heapu
```

- **Fuzz** steruje turami ludzi losowymi LEGALNYMI akcjami (w granicach tego, co
  pozwala lobby/UI) i po każdej rundzie oraz po każdym wczytaniu sprawdza
  **inwarianty stanu** (m.in. armie 1..MAX_ARMY z żywym właścicielem, spójność
  stolic z `capitalOf`, żywi właściciele pól/dróg, domknięte projekty dróg,
  `phase` zgodne z liczbą żywych). Naruszenie/wyjątek → seed do reprodukcji.
- **Soak** gra wiele partii z rzędu w jednym kontekście (jak gracz bez odświeżania
  strony) — trend pamięci między partiami ma być płaski, czas rundy stabilny.
- Deterministyczny per seed (losowość sterownika i gry z mulberry32, kolejka
  timeoutów deterministyczna).

Kiedy uruchamiać: po każdej zmianie w mechanice/AI/zapisie — fuzz ~200 partii jako
bramka przed wydaniem (obok `sim.js --games=300` dla metryk balansu).

## Protokół smoke przed wydaniem (przeglądarka, ręcznie)

Ścieżek DOM headless nie sięgnie — przed każdym wydaniem przejść 15-punktową
checklistę z **[12-Protokol-smoke.md](12-Protokol-smoke.md)** (osobny plik
z checkboxami; jedno źródło prawdy, tu tylko odnośnik).

## Serwer deweloperski i regresja wizualna (`tools/serve.js` + `visual-test.html`)

Sama gra działa z `file://`, ale narzędzia, które **czytają piksele canvasa**
(`getImageData`), tego nie mogą — na `file://` canvas jest „skażony" przez sprite'y
ładowane z dysku i przeglądarka blokuje odczyt. Stąd `tools/serve.js`: statyczny
serwer (czysty Node `http`, zero zależności), który serwuje repo przez
`http://localhost` (same-origin znosi ograniczenie).

```
node tools/serve.js                 # http://localhost:8080
node tools/serve.js --port=9000
```

**`visual-test.html`** (otwierać **przez serwer**, nie z `file://`) to dashboard
regresji wizualnej: renderuje wiele partii AI-vs-AI **prawdziwym `draw()`** na
prawdziwym canvasie, w zadanych rundach-checkpointach robi migawkę, hashuje wszystkie
piksele klatki (FNV-1a) i porównuje z zapisanym wzorcem, pokazując miniaturę każdej
planszy (✓ zgodne / ✗ zmiana z porównaniem wzorzec↔teraz / ⭑ nowe). Wzorzec trzymany
w `localStorage` (przycisk „Ustaw jako wzorzec"; eksport/import haszy tekstem).
Deterministyczne per seed (jak `sim.js`: `Math.random = makeRng(...)` po `newGame`).

Kiedy używać: po zmianach w `render.js`/`gen-sprites.js`/geometrii — ustaw wzorzec
**przed** zmianą, po zmianie uruchom i obejrzyj, które klatki się ruszyły (i czy
celowo). Uzupełnia headless (`stress.js`/`sim.js` nie dotykają renderu).

Uwaga techniczna: `visual-test.html` ładuje warstwę logiki + `render.js`/`ui.js`/
`menu.js` (bez `main.js` — nie chce autostartu menu) i daje **atrapy elementów DOM**
(`#stubs`), bo `newGame` woła `applyScreen`/`updateUI`/`showOverlay`, które sięgają po
elementy interfejsu (część bez osłon na `null`).

Do oglądania „na żywo" przyspieszonej partii samych botów służy natomiast **tryb
obserwatora w samej grze** (lobby single → „Oglądam") z regulacją tempa AI 1×/4×/16×.

## Weryfikacja UI/wizualna

Projekt jest czystym HTML/CSS/JS otwieranym z `file://` — nie ma zainstalowanego narzędzia do automatycznego sterowania przeglądarką (typu Playwright/`chromium-cli`) w standardowym środowisku roboczym tego repo. Zmiany w layoucie/CSS/renderowaniu canvasu należy sprawdzać **ręcznie**, otwierając `index.html` w przeglądarce po każdej zmianie (i robiąc **hard refresh**, `Ctrl+F5`, jeśli zmiana w `style.css` pozornie "nie działa" — przeglądarki potrafią agresywnie cache'ować lokalne pliki). Do regresji renderu na wielu partiach naraz — `visual-test.html` (wyżej).

## Znane charakterystyki

- **Duża wariancja symulacji AI-vs-AI** — pojedyncza partia 300–500 tur potrafi dać rozstrzygnięcie w widełkach ~40–65% na korzyść którejkolwiek strony nawet przy identycznych ustawieniach. Pojedynczy nietypowy wynik testu balansu to zwykle wariancja, nie regresja (patrz [Sztuczna inteligencja](06-Sztuczna-inteligencja.md)).
- **Kolory graczy zduplikowane** — `PLAYERS_DEF` w `src/config.js` i `PLAYERS` w `tools/gen-sprites.js` muszą być ręcznie trzymane w synchronizacji (generator nie ma dostępu do `config.js` przez `require`, bo to nie jest moduł CommonJS).
- **Treść pomocy zduplikowana w `index.html`** — ekran samouczka (`#menu-tutorial`) i zwijana lista pomocy w sidebarze gry (`#help`) mają identyczną listę `<li data-i18n-html="...">` w dwóch miejscach pliku; każdą zmianę trzeba wprowadzić w obu.

## Konwencje

- Komunikaty commitów: po polsku, w trybie rozkazującym (np. "Dodaje 3 typy jednostek...", "Poprawia sprite piechura..."), zwięzłe podsumowanie w pierwszej linii.
- Komentarze w kodzie: po polsku, tylko tam, gdzie wyjaśniają **dlaczego** (nieoczywiste ograniczenie, obejście, powód decyzji projektowej) — nie opisują tego, co kod i tak jasno pokazuje przez nazwy.
- Brak `module.exports`/CommonJS w `src/*.js` — świadoma decyzja przy refaktoryzacji na wiele plików: repo nigdy nie miało testów, więc odtwarzanie eksportu dla wielu plików wymagałoby sztucznego wzorca (UMD/namespace) bez realnej korzyści.
