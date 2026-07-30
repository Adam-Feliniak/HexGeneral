# Hex General — dokumentacja projektu

Turowa strategia heksagonalna 2D w klimacie pixel-art *Metal Slug*, napisana w czystym JavaScript i renderowana na `<canvas>`. Zero zależności, zero buildu — gra otwiera się bezpośrednio z pliku (`file://index.html`).

Ten folder zawiera pełną, wyczerpującą dokumentację projektu, wygenerowaną na podstawie faktycznego stanu kodu (nie planów czy założeń). Każdy plik opisuje jeden obszar gry.

## Spis treści

1. [Przegląd projektu](01-Przeglad-projektu.md) — czym jest gra, filozofia "bez builda", tryby rozgrywki, jak uruchomić
2. [Architektura i pliki](02-Architektura-i-pliki.md) — jak są zorganizowane `src/*.js`, kolejność wczytywania, kształt obiektu stanu gry (`state`) i pola planszy (`tile`)
3. [Generowanie mapy](03-Generowanie-mapy.md) — algorytm proceduralnej generacji kontynentów, stolic, miast, portów, złóż i gwarancji spójności świata
4. [Mechanika rozgrywki](04-Mechanika-rozgrywki.md) — siatka heksagonalna, tury, ruch, typy jednostek, walka, morale, weterancja, żegluga, podboje i koniec gry
5. [Gospodarka](05-Gospodarka.md) — produkcja siły, wybór budowanego typu jednostki, drogi i złoża surowców
6. [Sztuczna inteligencja](06-Sztuczna-inteligencja.md) — jak boty oceniają cele, wybierają ruchy i dobierają poziom trudności
7. [Grafika i sprite'y](07-Grafika-i-sprite-y.md) — proceduralny generator pixel-artu, pipeline renderowania na canvasie
8. [UI, menu i tłumaczenia](08-UI-menu-i18n.md) — ekrany menu, panel boczny gry, system i18n (PL/EN/DE)
9. [Przewodnik developera](09-Przewodnik-developera.md) — jak uruchamiać, rozszerzać i testować projekt; konwencje i pułapki
10. [Przyszłe plany](10-Przyszle-plany.md) — lista pomysłów na rozwój gry z orientacyjnym kosztem (uwaga: propozycje, nie opis istniejącego kodu); znacznik ⭐ oznacza pozycję awansowaną do rdzenia EA, czyli bieżący priorytet
11. [Gotowość na Early Access](11-Early-Access.md) — analiza luk „rdzeń vs roadmapa", ścieżka krytyczna do wypuszczenia, sekwencja dystrybucji (web-first → Steam) oraz cel multiplayera sieciowego na Steam wraz z zapisaną decyzją o silniku
12. [Protokół smoke](12-Protokol-smoke.md) — 15-punktowa checklista ręcznych testów w przeglądarce przed każdym wydaniem (uzupełnienie headless: `tools/stress.js` + `tools/sim.js`)
13. [Testy zewnętrzne](13-Testy-zewnetrzne.md) — wydawanie buildów testerom: fale dystrybucji, co zawiera build i czego celowo nie zawiera, znakowanie (`BUILD_TAG`), zbieranie zapisów jako raportów błędów
14. [Dźwięk](14-Dzwiek.md) — dlaczego dźwięk jest generowany proceduralnie (argument licencyjny przy wydaniu komercyjnym), inwentarz dźwięków, strojenie przez `tools/gen-sounds.js`
15. [Silnik i przenośność](15-Silnik-i-przenosnosc.md) — zapisana decyzja o pozostaniu przy JS + Canvas 2D wraz ze zmierzonym bilansem ewentualnego portu, reguła „logika wolna od przeglądarki" pilnowana przez `tools/check-portability.js` i warunki powrotu do tematu

## Najważniejsze fakty w skrócie

- **Brak builda i zależności** — `src/*.js` to zwykłe skrypty wczytywane po kolei w `index.html`, bez modułów ES ani bundlera (bo strona jest otwierana wprost z dysku, gdzie `fetch()`/moduły ES bywają blokowane przez przeglądarki).
- **Grafika generowana proceduralnie** — sprite'y PNG w `assets/` nie są rysowane ręcznie, tylko wytwarzane przez `node tools/gen-sprites.js` (własny enkoder PNG, bez bibliotek) i commitowane do repo, bo nie ma etapu builda, który mógłby je wygenerować przy starcie.
- **Tłumaczenia też są "kompilowane"** — źródłem prawdy są `locales/{pl,en,de}.json`, a `src/locales-data.js` to ich wygenerowana kopia (`node tools/build-locales.js`), bo `fetch()` plików JSON nie działa z `file://`.
- **Brak testów jednostkowych** — repo nigdy ich nie miało. Pliki `src/*.js` mają osłony `typeof document === 'undefined'`, co pozwala uruchamiać samą logikę gry w headless Node (patrz [Przewodnik developera](09-Przewodnik-developera.md)).
