# Gotowość na Early Access

Ten dokument to **analiza gotowości produktu**, nie lista pomysłów. W odróżnieniu od
[10-Przyszle-plany.md](10-Przyszle-plany.md) (katalog featureów) opisuje, czego brakuje,
żeby grę dało się *wypuścić* w Early Access i nie zebrać fali refundów.

Kluczowa zasada:

> **Early Access = żelazny rdzeń + wiarygodna roadmapa, a nie kompletność.** Nikt nie
> oczekuje pełnej gry. Oczekują, że to, co jest, **działa, wciąga i się kończy** — plus
> jasnej obietnicy, co dojdzie w trakcie.

To odwraca perspektywę wobec backlogu: **`10-Przyszle-plany.md` jest w większości
„roadmapą EA"** (obietnica „co dojdzie w trakcie"), a *gotowość na start* to osobna,
mniejsza lista „utwardzania produktu" — w dużej części nieefektowna robota, której
w backlogu nie ma.

## Rdzeń EA vs roadmapa EA

Dwie różne listy, których nie wolno mylić:

- **Rdzeń EA (utwardzanie)** — to, co musi być *gotowe na start*: zamykalna rozgrywka,
  zapis, stabilność, dystrybucja, audio, onboarding, kanał feedbacku. Bez większości
  tego gra nie jest gotowa, choćby featureów było dużo.
- **Roadmapa EA (rozwój w trakcie)** — to, co *obiecujesz na później* i realizujesz na
  oczach graczy: morze, lotnictwo, tech-tree, mgła wojny, dyplomacja, scenariusze.
  To jest wprost `10-Przyszle-plany.md`. **Nie tykać przed startem** — to treść strony
  sklepu („co dojdzie"), nie warunek premiery.

Najczęstszy błąd solo-deva: polerować roadmapę do kompletności zamiast utwardzić rdzeń
(albo wypuścić rdzeń zbyt cienki). Cel to twardy rdzeń + jasna roadmapa, nie szerokość.

## Analiza luk

Priorytety: **P0** = bramka startu (bez tego nie ma EA), **P1** = mocno poprawia odbiór,
**P2** = miło mieć / materiał na roadmapę.

| Obszar | Teraz | Próg EA | Priorytet |
|---|---|---|---|
| Zamykalność rozgrywki | ~~40%~~ → **~7%** remisów (v0.2.2 + v0.2.3) | Gra *niezawodnie* dobiega do końca | **P0 — gate #1, zasadniczo zamknięty** |
| Zapis / wczytywanie | brak | Partia ~348 tur bez save'a to refund | **P0** |
| Stabilność (pełne partie bez crasha/softlocka) | brak testów, nieznane | Zero zawiesów w długiej grze | **P0** |
| Dystrybucja (wrapper + platforma) | brak | Musi *gdzieś* być (Steam/itch) | **P0 (launch)** |
| Strona sklepu + opis EA + roadmapa | brak | Steam wymaga „czemu EA / jak długo / co dojdzie" | **P0 (Steam)** |
| Kanał feedbacku (Discord/forum) | brak | Cały sens EA to feedback | **P0, tani** |
| Onboarding / samouczek | statyczny tekst + tooltipy | Pierwsze 10 min decyduje o refundzie | **P1** |
| Dźwięk / muzyka | **zero audio** | Cisza = „niedokończona" dla wielu graczy | **P1** |
| Wydajność (długie partie, dużo armii) | `aiPickMove` to wąskie gardło | Płynność bez zacinania | **P1** |
| QoL (ręczne kończenie tury, undo, ustawienia) | częściowo | Brak irytujących tarć | **P1/P2** |
| Dostępność (paleta pod daltonizm, toggle animacji) | 6 kolorów graczy — do sprawdzenia | Kolory rozróżnialne | **P2** |
| Treść / regrywalność | proceduralne mapy, seedy, 3 jednostki, trudność | Wystarcza na *minimalny* EA; rozmiary map = tani boost | **P2** |
| Hook / tożsamość (jednozdaniowy pitch) | niewypowiedziany | Store page potrzebuje „czemu ta gra" | **P1** |
| Legal (LICENSE, rating wiekowy) | LICENSE ✔, rating do wypełnienia | Kwestionariusz wieku na Steam | **P2** |

## Ścieżka krytyczna (P0)

1. **Zamykanie gier** (gate #1, patrz niżej) — bez tego rdzeń jest zepsuty na poziomie pętli.
2. **Zapis / wczytywanie** — odblokowuje też quit-and-resume i późniejsze cloud save na
   Steam. Wiąże się z notką o wersjonowaniu w `CLAUDE.md` (format + migracje).
3. **Przebieg stabilnościowy** — rozegrać wiele *pełnych* partii (headless + ręcznie),
   łapać softlocki/wyjątki/perf. Zamiennik testów, których nie ma.
4. **Dystrybucja + strona sklepu** — Electron/NW.js wrapper, kapsułki, screeny, opis EA,
   roadmapa. Robota ~dni, ale proces Steam to ~4–8 tygodni kalendarza (opłata $100,
   podatki, 30-dniowa karencja, recenzje). **Pierwsze realne złamanie „no build"** —
   w warstwie dystrybucji, nie w samej grze.
5. **Kanał feedbacku** — Discord + wątek. Tani, ale bez niego EA nie ma sensu.

## Gate #1: zamykanie gier (dlaczego to priorytet)

**Status: zasadniczo zamknięty (v0.2.2 + v0.2.3)** — remisy 40,0% → **~7%**, mediana
długości ~348 → ~122 rund, drabinka trudności i balans nienaruszone. Mechanizm
(eskalacja bramkowana przewagą + oblężenie falowe + ekonomia: zbieranie niczyich miast
z podziałem ról wg siły) opisany w [06-Sztuczna-inteligencja.md](06-Sztuczna-inteligencja.md);
pozostałe ~6% przypadków i ewentualne kierunki — w pozycji ✅ w
[10-Przyszle-plany.md](10-Przyszle-plany.md).
Poniższa analiza przyczyn (aktualna dla stanu sprzed poprawki) zostaje jako kontekst.

Szczegóły mechanizmu i kierunki
naprawy — patrz też pozycja „AI słabo domyka wygrane pozycje" w
[10-Przyszle-plany.md](10-Przyszle-plany.md) oraz [06-Sztuczna-inteligencja.md](06-Sztuczna-inteligencja.md).

**Co znaczy „zamknąć grę".** Gra kończy się dopiero, gdy zostaje jedno żywe imperium
(`checkGameOver` w `empire.js`). Imperium ginie tylko przez **upadek stolicy**
(`captureTile` → `conquerEmpire`). Czyli „domknięcie" = zdobycie stolicy wroga. Stalemate
= AI nie potrafi zdobyć cudzej stolicy.

**Dlaczego nie potrafi — stolica jest twierdzą nie do przełamania.** Składa się na to
kilka *mnożących się* mechanizmów (wartości z `combat.js` / `config.js`):

1. **Morale od dystansu (`moraleAt`).** Morale = `100 − 7·d`, gdzie `d` to odległość do
   najbliższego *własnego* miasta (podłoga 40, potem clamp 25–100). Atakujący w głębi
   wroga ma morale rzędu 0,4–0,65; obrońca na własnej stolicy ~1,0–1,1. To już ~2× swing
   przeciw ofensywie. `armyPowerAt = str · morale/100 · typeMult`.
2. **Skumulowane bonusy obronne stolicy.** Do przewagi morale dokłada się: bonus miasta
   `×1,25` (stolica), mnożnik obronny typu (artyleria `def 1,20`) i wsparcie sąsiadów
   (`supportFor`, artyleria `supportWeight 1,80`). Wszystko *mnożnie*.
3. **Efekt:** żeby uzyskać opłacalny stosunek sił na stolicy, atakujący potrzebuje ~2–2,5×
   realnej przewagi `str` — a przy równej produkcji obu stron i capie `MAX_ARMY = 99`
   obrońca zawsze uzupełnia pełny stos w twierdzy. Front zastyga.
4. **Przegrany atakujący ginie w całości** (`resolveBattle`: przy porażce `from.army = null`,
   obrońcy spada tylko `str`). Atak przy złym stosunku to nie „podgryzienie", tylko utrata
   całej armii — więc AI słusznie tego unika, ale w połączeniu z (1)+(2) *nigdy* nie ma
   dobrych szans na stolicę.
5. **Brak koncentracji/oblężenia.** `aiPickMove` jest zachłanne: sortuje armie po `str`
   i wybiera jeden najlepszy ruch na krok. Nie masuje kilku armii na jeden heks stolicy
   w jednej turze. `supportFor` (waga 0,12) to słaby proxy, nie realne oblężenie.
6. **Brak eskalacji.** `aggression` i `aggressionThreshold` są stałe per trudność (normal
   = 1,0). Nic nie rośnie z długością partii ani z przewagą terytorialną — zastygły front
   zostaje zastygły aż do capa 500 rund.
7. **Pułapka „ataku na wyniszczenie".** Gałąź `ratio ∈ (0,8; 1,05)` w `aiPickMove` premiuje
   `from.army.str` — czyli wysyła *największy* stos w atak przy przegranych szansach, co
   aktywnie niszczy zdolność zbudowania decydującej siły.

**Kierunki naprawy (w kolejności opłacalności), każdy mierzony odsetkiem remisów w `sim.js`:**

- 🟢 **Eskalacja / przełamanie patu** — skalować `aggressionThreshold` w dół (i/lub score
  ataku w górę) wraz z długością partii i/lub przewagą terytorialną, żeby lider był zmuszony
  zamienić przewagę na szturm stolicy. Zmiana lokalna w `aiPickMove`. Najtańsze, najsilniejszy
  sygnał — atakuje wprost 40%.
- 🟡 **Koncentracja / oblężenie** — nagradzać masowanie armii przy docelowej stolicy i
  wspólne uderzenie; podbić wkład wsparcia przy szturmie stolicy. Najwięcej dźwigni po
  stronie *zachowania* AI.
- 🟡 **Rewizja skumulowanej obrony** — zredukować mnożnikowy stos (gradient morale / bonus
  stolicy / sufit wsparcia) *tyle*, żeby przełamać stolicę wystarczała ~1,5× realna przewaga,
  a nie 2,5×. Ostrożnie — morale-od-dystansu to *rdzeń* odczucia (zaopatrzenie), więc stroić,
  nie wycinać.
- 🟢 **Naprawa gałęzi wyniszczenia** — nie wysyłać największego stosu w atak przy przegranych
  szansach.

**Dlaczego to „iteracyjne, nie kodowe" (3–10 dni).** Każda zmiana wymaga przepuszczenia
serii ~300 gier przez `tools/sim.js` i sprawdzenia dwóch metryk naraz: odsetek remisów ma
wyraźnie spaść, a bias stron zostać ~50/50. Czas zżera *pomiar i strojenie*, nie pisanie
kodu. To pętla eksperymentalna — dlatego jest gate'em, a nie „taskiem na popołudnie".

## Dystrybucja: web-first → Steam

Rekomendowana sekwencja (rozwinięcie wątku o Steam z rozmów projektowych):

1. **Zwaliduj pętlę za darmo, zanim zapłacisz Steamowi.** Zrób P0 #1–#3 (zamykalność +
   zapis + stabilność) i wypuść **darmowy playtest/demo na itch.io / web** — godziny roboty
   (statyczne pliki, `<script>`-y działają nad http tak samo jak nad `file://`, a ograniczenie
   `fetch()` z `file://` wręcz znika). Zbierz feedback o *rdzeniu*.
2. **Dopiero gdy gracze nie odbijają się od pętli — commituj się w Steam EA.** Wtedy wrapper
   (Electron/NW.js), strona sklepu, opis EA i roadmapa mają na czym stać. To zdejmuje ryzyko
   płacenia $100 + tygodni procesu pod pętlę, której nikt nie dograł.
3. **Nazwij hook przed stroną sklepu.** Kandydaci na wyróżnik: **walka oparta o morale** i
   **drogi/zaopatrzenie budowane przez gracza jako sieć** — nieoczywiste w gatunku, dobra oś pitchu.

Uwaga: itch/web zachowuje filozofię „no build" (hostujesz te same pliki). Wrapper pod Steam
to pierwszy krok, który dokłada toolchain + ~150 MB runtime — świadoma decyzja dystrybucyjna,
nie zmiana w grze.
