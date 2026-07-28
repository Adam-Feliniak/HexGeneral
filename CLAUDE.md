# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hex General is a standalone, turn-based hexagonal strategy game — plain JS + Canvas 2D, no runtime dependencies. It is an original game; it is not a clone of, nor inspired by, any existing game of a similar name, and should never be described that way.

Full design/architecture docs live in `Documents/` (Polish) — start at `Documents/00-Spis-tresci.md` for the index. Read the relevant doc before making non-trivial changes in that area:
- `01-Przeglad-projektu.md` — project overview, game modes, win condition
- `02-Architektura-i-pliki.md` — file responsibilities, state/tile shape, hex grid coords
- `03-Generowanie-mapy.md` — procedural map generation
- `04-Mechanika-rozgrywki.md` — combat, morale, unit types, movement
- `05-Gospodarka.md` — resources, roads, city production
- `06-Sztuczna-inteligencja.md` — AI difficulty/behavior
- `07-Grafika-i-sprite-y.md` — sprite palette/painting system
- `08-UI-menu-i18n.md` — menus, screens, i18n
- `09-Przewodnik-developera.md` — dev workflows, headless testing harness, known gotchas

## The "no build" constraint — read this before changing anything structural

This is the single decision that shapes the whole codebase:
- No bundler, no `npm install`, no runtime `package.json` dependencies. The game runs by opening `index.html` directly via `file://`.
- Because `file://` blocks `fetch()`, everything must be inlined as plain `<script>` tags:
  - Game logic: plain `.js` files in `src/`, **no `import`/`export`** (ES modules can also be blocked under `file://`). Every top-level `function`/`const` in a `src/*.js` file becomes globally visible to all subsequently-loaded scripts — this is the module system.
  - Translations: source of truth is `locales/*.json`, but the game actually loads `src/locales-data.js`, a generated JS copy.
  - Sprites: PNGs in `assets/`, generated once by a Node script and **committed to the repo** (no build step exists to produce them at runtime).
- Never hand-edit `src/locales-data.js` — it's generated and will be overwritten/inconsistent.
- `tools/*.js` are plain Node scripts with zero npm dependencies (including a hand-rolled PNG encoder) — run with plain `node`, no install step.

## Running / building

There is no dev server, no build, no test runner. To run the game: open `index.html` directly in a browser (or double-click it).

Two manual regeneration steps, each required after specific edits:

```
node tools/build-locales.js   # after editing any locales/*.json — regenerates src/locales-data.js
node tools/gen-sprites.js     # after editing tools/gen-sprites.js — regenerates assets/*.png
```

After `gen-sprites.js` changes, commit the regenerated `assets/*.png` files too — there's no build step to produce them otherwise.

```
node tools/gen-sounds.js      # optional — renders SFX recipes to dist/sfx/*.wav for auditioning
```

Unlike sprites, **sound is never shipped as files**: `src/audio.js` synthesizes every SFX into an `AudioBuffer` at runtime and plays music from a note table. `gen-sounds.js` exists only so you can hear a recipe in an audio editor while tuning it — its output goes to gitignored `dist/` and the game never loads it. See [14-Dzwiek.md](Documents/14-Dzwiek.md).

### Adding/changing UI text
1. Add/edit the same key in **all three** `locales/pl.json`, `locales/en.json`, `locales/de.json`.
2. Run `node tools/build-locales.js`.
3. For text that needs to appear statically in `index.html`, add `data-i18n="key"` (plain text) or `data-i18n-html="key"` (text with inline tags like `<b>`).
4. Note: tutorial screen (`#menu-tutorial`) and the sidebar help list (`#help`) duplicate the same `data-i18n-html` list in two places in `index.html` — update both.

### Adding/changing a sprite
1. Edit `tools/gen-sprites.js` — add a painting function (see `tankGrid()`/`artilleryGrid()` for examples) or modify an existing one.
2. If the sprite needs per-player recoloring, register it in the `PLAYERS.forEach(...)` loop at the end of the file, painting `b`/`B`/`h` palette characters in the player's color.
3. Run `node tools/gen-sprites.js`.
4. If it's a new sprite file/category, register it in `loadSprites()` in `src/sprites.js`.
5. Commit the changed/new `assets/*.png` alongside the generator change.

### Headless verification (no test framework exists)

The repo has never had a formal test suite. Instead, DOM-touching functions across `src/*.js` guard themselves with:
```js
if (typeof document === 'undefined') return;
```
This lets pure game logic run in plain Node via `vm.createContext`, without a browser — useful for verifying combat/movement/AI changes don't throw. See `Documents/09-Przewodnik-developera.md` for a full harness example (load files in `index.html` script order into a `vm` sandbox, call `newGame({ humanCount, botCount, aiDifficulty, seed, timeLimit })` — note it takes one options object and mutates the global `state`, returning nothing — then drive turns via `aiPickMove`/`executeMove`/`produce`/`resetMoved`).

For UI/CSS/canvas rendering changes, verify manually by opening `index.html` in a browser; hard-refresh (`Ctrl+F5`) since browsers aggressively cache local files.

## Architecture

### Script load order matters (`index.html`)
```
config.js → locales-data.js → i18n.js → geometry.js → utils.js → mapgen.js
→ state.js → combat.js → roads.js → empire.js → turns.js → ai.js
→ save.js → sprites.js → audio.js → render.js → ui.js → input.js → menu.js → main.js
```
Order only matters where a file executes code immediately at load time (not just defining functions): `i18n.js` calls `i18nInit()` at the end (needs `I18N_DATA` from `locales-data.js`); `main.js` (last) actually starts the game — `setupCanvas()`, `loadSprites()`, `initAudio()`, `initInput()`, `initMenu()`, initial menu-screen state, `applyScreen()`, `applyI18n()`, `requestAnimationFrame(frame)`. Otherwise, functions in any file may freely call functions in any other file — there's no enforced dependency hierarchy, just topical grouping.

| File | Responsibility | Key functions/constants |
|---|---|---|
| `config.js` | Map size, players, city names, capital positions, unit types, AI difficulty presets | `MAP_W/H`, `HEX`, `ACTIVATIONS_PER_TURN`, `MOVE_COST_ROAD/DEFAULT`, `SEA_MOVE_POINTS`, `MAX_ARMY`, `UNIT_TYPES`, `AI_DIFFICULTY_PRESETS`, `PLAYERS_DEF`, `CAPITAL_SPOTS`, `resolveDifficulty()` |
| `locales-data.js` | **Generated** — do not hand-edit | `I18N_DATA` |
| `i18n.js` | Translation lookup, language switching, `localStorage` persistence | `i18n.t()`, `i18n.setLanguage()`, `applyI18n()` |
| `geometry.js` | Hex grid geometry (odd-r offset, pointy-top) | `neighborCoords()`, `hexDist()`, `hexCenter()`, `hexCorner()` |
| `utils.js` | Seeded RNG, color mixing | `rnd()`, `irnd()`, `shuffle()`, `makeRng()`, `mixColor()` |
| `mapgen.js` | Procedural map generation: land, capitals, cities, ports, resources, connectivity | `generateMap()`, `ensureCapitalConnectivity()` |
| `state.js` | Game state, new-game setup, tile access, event log | `newGame()`, `tileAt()`, `neighborsOf()`, `addLog()` |
| `combat.js` | Morale, army power, move legality/range, battle resolution | `moraleAt()`, `armyPowerAt()`, `canStep()`, `moveCostStep()`, `maxMovePoints()`, `reachableMoves()`, `resolveBattle()`, `executeMove()` |
| `roads.js` | Player/AI-built roads (resource→city or city→city), city production | `roadCost()`, `startRoadProject()`, `completeRoadProject()`, `isRoadActive()`, `tileOnRoad()`, `produce()` |
| `empire.js` | Tile capture, whole-empire annexation, game-over check | `captureTile()`, `conquerEmpire()`, `checkGameOver()` |
| `turns.js` | Turn order (human/AI), turn timer | `startTurn()`, `endTurn()`, `requestEndTurn()`, `checkTurnTimer()` |
| `ai.js` | Bot move/target selection, production choice | `aiTargets()`, `aiPickMove()`, `aiStep()`, `aiAssignBuildType()` |
| `save.js` | Save/load: explicit state codec (JSON), autosave to `localStorage` (`hexgeneral.save`), continue, text export/import | `serializeGame()`, `deserializeGame()`, `autosave()`, `loadAutosave()`, `exportSaveText()`, `importSaveText()` |
| `sprites.js` | Loads PNGs from `assets/` into `SPR` | `loadSprites()`, `sprOk()` |
| `audio.js` | Procedurally synthesized SFX + chiptune (no audio files at all), volume settings | `SFX_RECIPES`, `playSfx()`, `initAudio()`, `setMusicTrack()`, `setAudioSetting()` |
| `render.js` | All canvas drawing | `draw()`, `frame()`, `drawTile()`, `drawArmy()`, `drawCity()`, `drawRoads()` |
| `ui.js` | Sidebar, banners, game-over screen, production panel | `updateUI()`, `updateBuildPanel()`, `showBanner()`, `showOverlay()` |
| `input.js` | Click/hover handling, tooltips, keyboard shortcuts | `onTileClick()`, `tileTooltip()`, `initInput()` |
| `menu.js` | Main menu/lobby screens, options, screen navigation | `applyScreen()`, `goToScreen()`, `renderSpSetup()`, `renderMpSetup()`, `initMenu()` |
| `main.js` | Boots the game after all files are loaded | (top-level code) |

### Key data shapes

`state` (global, created by `newGame()`): `screen`, `gameId` (guards against stale AI/end-of-turn `setTimeout`s across game sessions), `mode` ('single'|'multi'), `tiles` (MAP_H × MAP_W grid), `mapSeed`, `turn`, `phase`, `human` (single-player only), `players[]`, `aiPlayers`, `activationsLeft`, `selected`, `selectedCity`, `log`. Separate module-level arrays outside `state` (in `state.js`): `anims`, `floaters`, `effects`, `hoverTile`, `lastFrame`.

Tile (`state.tiles[r][c]`): `{ c, r, land, city: null|{name, capitalOf, port, buildType, variant?, roadProject?}, resource: null|'oil'|'farm'|'mine' (+ optional supplyCity), road: null|{owner}, owner: -1|playerId, army: null|{player, str, vet, type, mp, activated}, shade, coast[], shallow }`. `city.capitalOf` records the *original* capital owner from map generation and stays put even after conquest, except `captureTile()` sets it to `-1` at the moment a capital is actually captured (it becomes a regular city). `army.type` is `'infantry'|'tank'|'artillery'`. Roads are a player/AI-built **network** (not automatic) — `road` is just a per-hex marker `{owner}`; the network is the set of adjacent same-owner road hexes. See [05-Gospodarka.md](Documents/05-Gospodarka.md): building spends city production points (`city.roadProject = { target, segment, cost, progress, built }`, laid incrementally over the missing hexes, sharing existing ones), a resource hex on the network gives +1 to one player-chosen connected city (`resource.supplyCity`, default nearest), and entering any own road hex costs 1 movement point instead of 2 (so roads reward *travelling along* the network, not standing on it).

Hex grid: odd-r offset, pointy-top (`geometry.js`) — even/odd rows use different neighbor direction sets (`DIRS_EVEN`/`DIRS_ODD`); distance is computed via cube-coordinate conversion.

### Duplication to keep in sync manually
- `PLAYERS_DEF` in `src/config.js` and `PLAYERS` in `tools/gen-sprites.js` (the sprite generator can't `require()` config.js since it isn't a CommonJS module).
- Tutorial screen (`#menu-tutorial`) and sidebar help (`#help`) in `index.html` — duplicated help text lists.

### Why no `module.exports`
Deliberate: the repo has never had tests, so faking exports across files for a multi-file split would need an artificial UMD/namespace pattern with no real benefit. Globals + script order is the whole module system.

## Versioning

`GAME_VERSION` in `src/config.js` is the single source of truth (shown in the corner of the main menu via `#version-tag`, set in `main.js`). SemVer (`MAJOR.MINOR.PATCH`), currently pre-1.0:
- **MAJOR** — first full release (`1.0.0`) and later breaking changes (e.g. to a future save/seed format).
- **MINOR** — new player-facing functionality (unit type, game mode, mechanic).
- **PATCH** — fixes, balance tweaks, small changes.

When bumping: update `GAME_VERSION` and add an entry to `CHANGELOG.md` in the same commit, then tag `git tag vX.Y.Z` locally (push only when explicitly asked).

Since 0.3.0 the game has a save format (`SAVE_FORMAT` in `src/save.js`, autosave in `localStorage`). **Any change to the shape of game state** (new tile/state field that affects gameplay) requires adding the field to the explicit codec in `save.js` AND bumping `SAVE_FORMAT` — old saves then get a clear incompatibility message (no migrations before 1.0; post-1.0 breaking save changes are MAJOR).

## Conventions

- Commit messages: Polish, imperative mood, concise first-line summary (e.g. "Dodaje 3 typy jednostek...", "Poprawia sprite piechura...").
- Code comments: Polish, only where they explain **why** (non-obvious constraint, workaround, design rationale) — never restate what the code already shows via naming.
- AI-vs-AI simulation has high variance — a single 300–500 turn game can land anywhere in ~40–65% either direction with identical settings. One odd balance-test result is usually variance, not regression (see `Documents/06-Sztuczna-inteligencja.md`).
