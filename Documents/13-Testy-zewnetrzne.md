# Testy zewnętrzne — wydawanie buildów testerom

Protokół dystrybucji buildów do testerów spoza projektu. Uzupełnia
[12-Protokol-smoke.md](12-Protokol-smoke.md) (testy autora przed wydaniem) — ten plik
opisuje, **co wychodzi z maszyny, do kogo i w jakiej kolejności**.

Zasada porządkująca:

> **Kompetencja decyduje, w którym pierścieniu tester jest przydatny.
> Zaufanie decyduje, czy dostaje plik.**

Oddawany jest wyłącznie kod gry — najmniej wartościowa warstwa, i tak odtwarzalna przez
kompetentną osobę. Nie wychodzi dokumentacja projektowa, harness symulacyjny ani generator
sprite'ów, bo *to* jest realne IP.

## Fale dystrybucji

| Fala | Kto | Cel | Dlaczego tak |
|---|---|---|---|
| **0** | zaufana osoba, u autora, 1–2 sesje | pierwsze 10 minut + **hot-seat, w wariancie kooperacyjnym** | najrzadszy zasób; jedyna okazja na naturalny test trybu multi i jedyny sposób na obserwację onboardingu |
| **1** | osoby zaufane | build, długie partie, balans i systemy | najwyższe zaufanie = pierwszy dostęp |
| **2** | osoby neutralne i nieprzychylne | build, **po naprawach z fali 1** | patrz niżej |
| **3** | publiczny playtest (itch/web) | crashe, onboarding, obcy gracze | naturalna data wygaśnięcia tajności |

**Dlaczego osoba nieprzychylna dostaje build, tylko później.** W małej, zgranej grupie
wykluczenie jednej osoby ma wyższy koszt społeczny niż ryzyko IP — i samo generuje narrację
(„nie zaufał mi"), której chcesz uniknąć. Zazdrość wyraża się niskonakładową złośliwością,
nie wielomiesięcznym klonowaniem gry strategicznej. Realne ryzyko jest więc **narracyjne,
nie własnościowe**, a obroną przed nim nie jest tajność, tylko **wersja, której się nie
wstydzisz**: krytyk z surową alfą napisze recenzję, której się boisz, ten sam człowiek
z dopracowanym buildem ma znacznie mniej materiału.

Wniosek praktyczny: **audio i onboarding (P1 z [11-Early-Access.md](11-Early-Access.md))
powinny wylądować przed falą 2.** To skuteczniejsza obrona niż jakikolwiek NDA.

## Wydanie buildu

```
node tools/pack-build.js --tag=kt-1      # -> dist/kt-1/
```

Znacznik nadawaj **per tester** (`kt-1`, `kt-2`, …) i zapisz u siebie, komu odpowiada.
Potem spakuj `dist/kt-1/` do zipa i wyślij. **Nigdy nie pakuj katalogu projektu.**

Build to 88 plików / ~196 KB: `index.html`, `style.css`, `LICENSE`, 19 plików `src/*.js`
(kolejność brana z `<script src=...>` w `index.html`) i 66 `assets/*.png`. Uruchamia się
dwuklikiem na `index.html`, bez instalacji — jak zwykła gra z filozofii „bez builda".

Czego w buildzie celowo **nie ma** i dlaczego:

- `.git/` — 2,1 MB historii, a w niej **każda wersja `Documents/`**. To jest ta pułapka:
  usunięcie `Documents/` z kopii nic nie daje, dopóki `.git` jedzie razem. Skrypt pakujący
  istnieje głównie po to, żeby tego błędu nie dało się powtórzyć.
- `Documents/` — dokumentacja projektowa, w tym metodologia strojenia AI (to, co realnie
  przyspieszyłoby naśladowcę — nie kod).
- `tools/` — `sim.js`, `stress.js`, `gen-sprites.js` (własny enkoder PNG).
- `CLAUDE.md`, `CHANGELOG.md` (metryki balansu), `README.md`, `visual-test.html`.

Skrypt używa **allowlisty, nie blacklisty** — nowy plik dodany do repo nie wycieknie do
buildu, bo nie ma go na liście, i sam weryfikuje wynik przed zakończeniem.

### Higiena dostępu

- [ ] **Żaden tester nie dostaje dostępu do repo jako collaborator.** Dostałby całą historię
      i `Documents/` — czyli dokładnie to jedno, czego build nie zawiera.
- [ ] Znacznik nadany i zanotowany (kto = jaki tag).
- [ ] Zip zawiera *zawartość* `dist/<tag>/`, nie katalog projektu.

**O znaczniku:** `BUILD_TAG` z `src/config.js` pokazuje się w stopce menu i trafia do koperty
zapisu, więc z nadesłanego zapisu widać, z czyjego builda pochodzi. W czystym JS każdy usunie
go w minutę — to **próg, nie zamek**, dopasowany do realnego scenariusza (przypadkowe podanie
dalej), nie do determinacji. Dlatego wartość jest w **poinformowaniu testerów, że buildy są
znakowane**, a nie w kryminalistyce po fakcie.

## List wstępny (szablon)

Wyślij razem z buildem. Trzy rzeczy, które musi zawierać:

1. **Na czym się skupić** — jedno, dwa pytania na falę, nie „powiedz co myślisz".
2. **Lista znanych braków.** Uprzedzenie zarzutu odbiera mu siłę i wartość informacyjną:
   zamienia „znalazłem wadę" w „tak, to jest na liście". Stan na **v0.6.2**:
   *samouczek to statyczny tekst, nie interaktywny; dźwięk i muzyka w wersji minimalnej
   (8 efektów + dwie pętle chiptune); brak trybu multiplayer online (multi jest hot-seat,
   na jednym komputerze); brak cofania ruchu; rozmiar mapy na stałe; kolory graczy jeszcze
   nie sprawdzone pod daltonizm.*

   Listę **aktualizuj przy każdym wydaniu** i trzymaj przy niej numer wersji (stąd „stan na"
   wyżej). Nieaktualna lista działa przeciw tobie w obie strony: wymienia braki, których już
   nie ma (wygląda na nieuwagę), i milczy o tych, które doszły — czyli traci dokładnie tę
   funkcję, dla której powstała.
3. **Prośba o niepublikowanie** do ustalonego momentu + informacja, że buildy są znakowane.
   Nieegzekwowalne wobec hobbysty, ale ustawia normę — i od razu wiadomo, kto ją zignorował.
   To jest cała rola „NDA" w tym projekcie; nie ma sensu inwestować w nic więcej.

## Zbieranie feedbacku

**Najcenniejszy artefakt od zdalnego testera to zapis z momentu, w którym coś było nie tak.**
Poproś wprost, żeby przy każdym zgrzycie zrobili:

> menu → **Zapis gry** → **Pokaż zapis** → Ctrl+C → wklej do zgłoszenia

Przy deterministycznych seedach odtwarzasz u siebie **dokładnie tę pozycję** — to różnica
między „coś było dziwne w okolicy tury 80" a reprodukowalnym błędem. Koperta zapisu zawiera
`version` i `build`, więc od razu wiadomo, z której wersji i czyjej kopii pochodzi.

Do tego krótki, ustrukturyzowany formularz — nie otwarte pole. Minimum: co robiłeś, czego
oczekiwałeś, co się stało, ile tur zagrałeś, czy dograłeś do końca.

## Fala 0 — sesja u autora

Twój najrzadszy zasób, więc nie marnuj go na to, co dostaniesz zdalnie. Dwie rzeczy,
których **nie da się** wyciągnąć z raportów:

> **Prerekwizyt: tryb kooperacyjny — ✅ gotowy (v0.7.0).** Fala 0 czekała na szkielet
> drużyn. Powód był praktyczny: w hot-seacie FFA jedyny układ dla dwóch osób to **gra
> przeciw autorowi**, a mniej wprawiony tester odpada z partii, zanim zdąży cokolwiek
> pokazać. Sesja co-op (dwoje ludzi w drużynie przeciw botom) trwa długo, poziom
> przeciwnika reguluje suwak trudności, a wspólne planowanie samo wymusza protokół
> „myśl na głos" z ostatniego punktu tej listy. W lobby ustawia się to przyciskiem
> szybkiego układu **„Ludzie kontra boty"**; jest też **„Tryb bossa"**, jeśli sesja ma
> sprawdzić wariant przeciw jednemu, mocniejszemu wrogowi.

- [ ] **Pierwsze 10 minut, bez podpowiedzi.** Siadasz obok, **nic nie tłumaczysz**, tylko
      notujesz, gdzie tester się gubi i o co pyta. To główne ryzyko refundowe (P1 onboarding)
      i jedyny sposób, żeby je zmierzyć.
- [ ] **Hot-seat na dwóch graczy — sesja kooperacyjna.** Jedyna okazja, żeby tryb multi
      przeszedł test w naturalnych warunkach (zdalna grupa nie może go sprawdzić w ogóle),
      a przy okazji pierwsza obserwacja, czy drabinka trudności ma sens przy dwóch ludziach
      naraz — dziś presety są strojone `sim.js`-em wyłącznie na partie bez sojuszy.
- [ ] **Partia FFA na dwóch graczy — krótko, na koniec.** Co-op nie sprawdzi jednej rzeczy:
      czy hot-seat *przeciw sobie* nie ma zgrzytów (kolejność tur, limit czasu, zasłanianie
      informacji między turami). Wystarczy kilkanaście tur, ale nie pomijaj tego całkiem.
- [ ] Protokół **„myśl na głos"** — poproś, żeby komentował decyzje; z tego wychodzi, czy
      morale i drogi są czytelne.
- [ ] **Nie obronaj projektu w trakcie sesji.** Notuj, dyskutuj po. Tłumaczenie „to działa tak,
      bo…" niszczy dane, po które usiadłeś.

## Fale 1 i 2 — build zdalny

- [ ] Build otagowany, list wstępny wysłany, znacznik zanotowany.
- [ ] Fala 1: pytanie wiodące o **balans i systemy** (czy któraś strategia dominuje, czy
      decyzje w turze są ciekawe, czy AI popełnia widoczne błędy).
- [ ] Naprawy z fali 1 wdrożone **przed** wysłaniem czegokolwiek do fali 2.
- [ ] Fala 2: ten sam build dla neutralnych i nieprzychylnych, w tym samym momencie.
- [ ] Pierwsze *publiczne* wrażenia mają pochodzić z fali 3 (obcy z itch), nie z kręgu
      znajomych — sekwencjonuj ujawnienie tak, żeby tak wyszło.
