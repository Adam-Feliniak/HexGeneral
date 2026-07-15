# Hex Imperium

Turowa strategia heksagonalna 2D — czysty JS + Canvas, bez zależności. Otwórz `index.html` bezpośrednio w przeglądarce.

## Struktura kodu

Logika gry jest podzielona na pliki w `src/`, każdy odpowiedzialny za jedną funkcję gry (wczytywane w tej kolejności w `index.html`):

| Plik | Odpowiedzialność |
|---|---|
| `config.js` | Stałe: rozmiar mapy, gracze, nazwy miast, pozycje stolic |
| `geometry.js` | Geometria heksów (sąsiedzi, odległość, współrzędne pikseli) |
| `utils.js` | Losowość, parsowanie/mieszanie kolorów |
| `mapgen.js` | Proceduralne generowanie mapy |
| `state.js` | Stan gry, `newGame()`, odczyt pól, log |
| `combat.js` | Morale, siła bojowa, legalność ruchu, rozstrzyganie bitew |
| `roads.js` | Drogi złoże → miasto i powiązania produkcji |
| `empire.js` | Zajmowanie pól, podbój imperium, sprawdzanie końca gry |
| `turns.js` | Kolejność tur gracza i AI |
| `ai.js` | Wybór ruchów przeciwników |
| `sprites.js` | Wczytywanie grafik PNG |
| `render.js` | Rysowanie na canvasie (kafle, drogi, granice, miasta, armie) |
| `ui.js` | Panel boczny, banery, ekran końcowy |
| `input.js` | Obsługa kliknięć/najechania, tooltipy |
| `main.js` | Uruchomienie gry |
