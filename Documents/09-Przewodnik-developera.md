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
      let moves = MOVES_PER_TURN, guard = 0;
      while (moves > 0 && guard++ < 50) {
        const mv = aiPickMove(p.id, diff);
        if (!mv) break;
        moves -= executeMove(mv.from, mv.to);
      }
      produce(p.id);
      resetMoved(p.id);
    }
  }
})()`);
```

## Weryfikacja UI/wizualna

Projekt jest czystym HTML/CSS/JS otwieranym z `file://` — nie ma zainstalowanego narzędzia do automatycznego sterowania przeglądarką (typu Playwright/`chromium-cli`) w standardowym środowisku roboczym tego repo. Zmiany w layoucie/CSS/renderowaniu canvasu należy sprawdzać **ręcznie**, otwierając `index.html` w przeglądarce po każdej zmianie (i robiąc **hard refresh**, `Ctrl+F5`, jeśli zmiana w `style.css` pozornie "nie działa" — przeglądarki potrafią agresywnie cache'ować lokalne pliki).

## Znane charakterystyki

- **Duża wariancja symulacji AI-vs-AI** — pojedyncza partia 300–500 tur potrafi dać rozstrzygnięcie w widełkach ~40–65% na korzyść którejkolwiek strony nawet przy identycznych ustawieniach. Pojedynczy nietypowy wynik testu balansu to zwykle wariancja, nie regresja (patrz [Sztuczna inteligencja](06-Sztuczna-inteligencja.md)).
- **Kolory graczy zduplikowane** — `PLAYERS_DEF` w `src/config.js` i `PLAYERS` w `tools/gen-sprites.js` muszą być ręcznie trzymane w synchronizacji (generator nie ma dostępu do `config.js` przez `require`, bo to nie jest moduł CommonJS).
- **Treść pomocy zduplikowana w `index.html`** — ekran samouczka (`#menu-tutorial`) i zwijana lista pomocy w sidebarze gry (`#help`) mają identyczną listę `<li data-i18n-html="...">` w dwóch miejscach pliku; każdą zmianę trzeba wprowadzić w obu.

## Konwencje

- Komunikaty commitów: po polsku, w trybie rozkazującym (np. "Dodaje 3 typy jednostek...", "Poprawia sprite piechura..."), zwięzłe podsumowanie w pierwszej linii.
- Komentarze w kodzie: po polsku, tylko tam, gdzie wyjaśniają **dlaczego** (nieoczywiste ograniczenie, obejście, powód decyzji projektowej) — nie opisują tego, co kod i tak jasno pokazuje przez nazwy.
- Brak `module.exports`/CommonJS w `src/*.js` — świadoma decyzja przy refaktoryzacji na wiele plików: repo nigdy nie miało testów, więc odtwarzanie eksportu dla wielu plików wymagałoby sztucznego wzorca (UMD/namespace) bez realnej korzyści.
