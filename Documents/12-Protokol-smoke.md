# Protokół smoke przed wydaniem

Checklist ręcznych testów w przeglądarce — ścieżek DOM nie sięgnie żaden headless
harness (`tools/stress.js` pokrywa logikę, ten plik pokrywa resztę). Przechodzić
**przed każdym wydaniem** (bump `GAME_VERSION`), po zmianach UI/renderu — także
między wydaniami.

Jak używać: otwórz `index.html` z twardym odświeżeniem (**Ctrl+F5**), przejdź
punkty po kolei. Każde „zgrzytnięcie" (błąd, dziwny stan, brzydki artefakt) →
zgłoszenie/naprawa przed wydaniem. Odhaczaj w kopii roboczej — plik w repo
zostaje czysty (wzorzec, nie log konkretnego przebiegu).

## Rozgrywka — rdzeń

- [ ] **1. Pełna partia single do wygranej** (mała liczba botów, easy) — overlay
  zwycięstwa, z niego „Nowa gra" startuje czysto.
- [ ] **2. Partia single do przegranej** (oddaj stolicę) — overlay porażki.
- [ ] **3. Wybór imperium na starcie**: przed pierwszym ruchem kliknięcie cudzej
  stolicy przełącza imperium (baner + log); po pierwszym ruchu już nie.
- [ ] **4. Multi hot-seat 2 graczy z limitem czasu** — timer odlicza (czerwieni się
  ≤10 s), po upływie tura przechodzi dalej z wpisem w logu.
- [ ] **4b. Tryb obserwatora** (single → „Oglądam") — partia samych botów startuje
  sama; przełącznik tempa AI 1×/4×/16× przyspiesza ruchy; panel tempa znika w grze
  bez botów (czysty hot-seat).

## Gospodarka i panel miasta

- [ ] **5. Budowa drogi z panelu miasta**: wybór celu (podświetlenie legalnych),
  budowa przyrostowa widoczna, anulowanie w trakcie zostawia położone heksy.
- [ ] **6. Przypisanie złoża**: panel złoża pokazuje połączone miasta, zmiana
  przypisania działa (+1 widoczny w produkcji).
- [ ] **7. Zmiana typu produkcji miasta** — produkcja idzie w wybrany typ.

## Zapis gry

- [ ] **8. Quit-and-resume w środku tury**: „Menu główne" → **F5** → „Kontynuuj" —
  ta sama pozycja (zużyte ruchy, projekt drogi w toku, przypisania złóż).
- [ ] **9. Ekran „Zapis gry"**: Pokaż zapis → Ctrl+C → Ctrl+V → Wczytaj (zgodność);
  wklejenie śmieci → komunikat błędu, gra nienaruszona.
- [ ] **10. Po wygranej partii „Kontynuuj" znika z menu.**

## Odporność UI

- [ ] **11. „Nowa mapa" w trakcie ruchu AI** — nowa gra startuje czysto, bez
  „duchów" starej tury (spóźnionych ruchów/banerów).
- [ ] **12. Zmiana języka w trakcie partii** — sidebar, panele i menu w nowym
  języku (w tym etykieta „Kontynuuj" po powrocie do menu).
- [ ] **13. Tooltipy**: morze, cudze pola, złoża (z drogą i bez), armie wroga,
  podpowiedź wyboru imperium na starcie, punkty ruchu własnej jednostki.
- [ ] **13b. Produkcja w tooltipie miasta** — stolica pokazuje +3, zwykłe miasto +1,
  a po podłączeniu złoża drogą wartość rośnie o 1 za każde zaopatrujące złoże.
  Niczyje miasto nie pokazuje wiersza produkcji.
- [ ] **14. Skróty**: Enter kończy turę, Esc czyści zaznaczenie/road-pick/panele.

## Sesja

- [ ] **15. Kilka partii z rzędu bez odświeżania** — brak spadku płynności,
  brak rosnącego zużycia pamięci (menedżer zadań przeglądarki).

---

Uzupełnienie headless (uruchamiać razem z tym protokołem):

```
node tools/stress.js --games=200        # fuzz + inwarianty
node tools/sim.js --games=300 --quiet   # metryki balansu (remisy ~7%)
```
