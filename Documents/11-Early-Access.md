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

**Stan dokumentu: aktualny na v0.6.2.** Od pierwszej wersji tej analizy doszły: tryb
obserwatora i regulacja tempa AI (v0.4.0 — przydatne przy pokazywaniu gry i przy zdalnej
krytyce partii botów), narzędzie regresji wizualnej `visual-test.html` oraz infrastruktura
buildów testerskich (v0.4.1), punkty ruchu (v0.5.0), dźwięk i muzyka (v0.6.0 — zamyka P1
„gra nie jest niema") oraz czytelna produkcja w tooltipie i panelu (v0.6.1–v0.6.2).

**Zmiana w tej wersji dokumentu:** **tryb kooperacyjny (drużyny) jest zrobiony** (v0.7.0)
razem z trybem bossa, więc bramka fali 0 testów zewnętrznych jest zdjęta — została sama
**realizacja przebiegu** (punkt 5 ścieżki krytycznej). Uzasadnienie, po co co-op był
warunkiem testów, zostaje w [nocie o co-opie](#nota-co-op-awansuje-z-roadmapy-do-rdzenia-bramka-fali-0)
niżej; teraz czyta się ją jako zapis decyzji, nie jako plan.

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
| Zapis / wczytywanie | ✅ **zrobione** (v0.3.0: autozapis + Kontynuuj + eksport/import tekstowy) | Partia bez save'a to refund | **P0 — zamknięte** |
| Stabilność (pełne partie bez crasha/softlocka) | ✅ **przebieg wykonany** (`tools/stress.js`: 500 partii fuzz z inwariantami + soak — 0 naruszeń; protokół smoke w `09`) | Zero zawiesów w długiej grze | **P0 — zamknięte** |
| Dystrybucja (wrapper + platforma) | brak | Musi *gdzieś* być (Steam/itch) | **P0 (launch)** |
| Strona sklepu + opis EA + roadmapa | brak | Steam wymaga „czemu EA / jak długo / co dojdzie" | **P0 (Steam)** |
| Kanał feedbacku (Discord/forum) | brak | Cały sens EA to feedback | **P0, tani** |
| Tryb kooperacyjny (drużyny) | ✅ **zrobione** (v0.7.0): tabela slotów w lobby (obsada + drużyna), co-op przeciw botom oraz tryb bossa | Dwoje ludzi musi móc zagrać **po tej samej stronie** przeciw botom | **P0 — zamknięte** |
| Multiplayer sieciowy (Steam) | brak — tryb multi to hot-seat przy jednym komputerze | **Nie jest progiem EA**: na start wystarcza hot-seat + co-op przeciw botom | **Po EA — cel potwierdzony, patrz [sekcja niżej](#cel-potwierdzony-multiplayer-sieciowy-na-steam)** |
| Testy zewnętrzne (przed publicznym playtestem) | ✅ **infrastruktura gotowa** (v0.4.1: `tools/pack-build.js`, `BUILD_TAG`, protokół w [13](13-Testy-zewnetrzne.md)) | Ktoś poza autorem musi zagrać przed EA | **P0 — narzędzia zamknięte, przebieg do wykonania** |
| Onboarding / samouczek | statyczny tekst + tooltipy | Pierwsze 10 min decyduje o refundzie | **P1 — patrz nota niżej** |
| Dźwięk / muzyka | ✅ **iteracja 1 zrobiona** (v0.6.0: 8 dźwięków + dwie pętle chiptune, wszystko syntezowane proceduralnie — patrz [14-Dzwiek.md](14-Dzwiek.md)) | Cisza = „niedokończona" dla wielu graczy | **P1 — zamknięte na poziomie „gra nie jest niema"** |
| Wydajność (długie partie, dużo armii) | ~~`aiPickMove` wąskie gardło~~ → znacznie mniej pilne (v0.2.1: ~2,2× szybsze AI przy bitowo identycznych decyzjach; v0.4.0: suwak tempa 1×/4×/16×) | Płynność bez zacinania | **P2** (zdegradowane z P1) |
| QoL (ręczne kończenie tury, undo, ustawienia) | częściowo — ręczne kończenie tury ✔ (przycisk + Enter), undo brak, ekran Opcje bardzo cienki (tylko seed + trudność) | Brak irytujących tarć | **P1/P2** |
| Dostępność (paleta pod daltonizm, toggle animacji) | ⚠️ **sprawdzone — realna kolizja**: `PLAYERS_DEF` ma `#d64550` (czerwony, gracz ludzki) i `#3fae62` (zielony, gracz 3), czyli klasyczny konflikt przy deuteranopii | Kolory rozróżnialne | **P2, tani** (kształt/symbol obok koloru albo przesunięcie palety) |
| Treść / regrywalność | proceduralne mapy, seedy, 3 jednostki, trudność | Wystarcza na *minimalny* EA; rozmiary map = tani boost | **P2** |
| Hook / tożsamość (jednozdaniowy pitch) | niewypowiedziany | Store page potrzebuje „czemu ta gra" | **P1** |
| Legal (LICENSE, rating wiekowy) | LICENSE ✔, rating do wypełnienia | Kwestionariusz wieku na Steam | **P2** |

## Ścieżka krytyczna (P0)

1. **Zamykanie gier** (gate #1, patrz niżej) — bez tego rdzeń jest zepsuty na poziomie pętli.
2. ✅ **Zapis / wczytywanie** — **zrobione** (v0.3.0): autozapis + „Kontynuuj" +
   eksport/import tekstowy; format z bramką `SAVE_FORMAT` (migracje po 1.0).
3. ✅ **Przebieg stabilnościowy** — **wykonany**: `tools/stress.js` (fuzz losowych
   legalnych akcji przez prawdziwe ścieżki gry + inwarianty stanu + soak sesyjny) —
   500 partii bez wyjątków i naruszeń; do powtarzania przed każdym wydaniem razem
   z protokołem smoke z `09-Przewodnik-developera.md`.
4. ✅ **Tryb kooperacyjny (drużyny)** — **zrobione** (v0.7.0). Nie był to feature z roadmapy
   wciśnięty przed premierę, tylko **narzędzie testowe**: bez niego punkt 5 (fala 0) nie miał
   jak się odbyć w realnych warunkach domowych — uzasadnienie w nocie niżej. Weszło:
   drużyna w stanie gracza, brak friendly-fire i zajmowania pól sojusznika, warunek
   zwycięstwa liczony na drużyny zamiast pojedynczych imperiów, AI traktujące sojuszników
   jak swoich, tabela slotów w lobby (obsada + drużyna).

   **Zmiana wobec wcześniejszej wersji tego dokumentu: super-wróg NIE został w roadmapie** —
   wszedł razem ze szkieletem, bo okazał się tani. Powód: boss to nie osobny tryb gry, tylko
   **obsada slotu** w tej samej tabeli, więc doszły do niego wyłącznie mnożniki `BOSS_MULT`
   i siódmy zestaw sprite'ów, a nie osobny ekran ani osobna gałąź logiki. Do samych testów
   fali 0 dalej nie jest potrzebny — jest bonusem, nie warunkiem.
5. **Testy zewnętrzne** — infrastruktura gotowa (v0.4.1): `node tools/pack-build.js --tag=...`
   produkuje czysty build (88 plików / ~196 KB, bez `.git`, `Documents/` i `tools/`), fale
   dystrybucji i protokół w [13-Testy-zewnetrzne.md](13-Testy-zewnetrzne.md). Do wykonania
   został sam **przebieg**: ktoś poza autorem musi dograć partie, zanim cokolwiek pójdzie
   publicznie.
6. **Dystrybucja + strona sklepu** — Electron/NW.js wrapper, kapsułki, screeny, opis EA,
   roadmapa. Robota ~dni, ale proces Steam to ~4–8 tygodni kalendarza (opłata $100,
   podatki, 30-dniowa karencja, recenzje). **Pierwsze realne złamanie „no build"** —
   w warstwie dystrybucji, nie w samej grze.
7. **Kanał feedbacku** — Discord + wątek. Tani, ale bez niego EA nie ma sensu.

### Nota: co-op awansuje z roadmapy do rdzenia (bramka fali 0)

**Status: zrealizowane w v0.7.0.** Nota zostaje jako zapis decyzji — dlaczego pozycja
z roadmapy weszła przed premierą.

To był **świadomy wyjątek** od zasady „roadmapy nie tykamy przed startem" z początku tego
dokumentu. Wyjątek jest uzasadniony tym, że pozycja trafia tu **nie jako treść gry, tylko
jako warunek wykonania innego P0**:

- **Fala 0 to jedyny P0, który wymaga drugiego człowieka**, a dostępny człowiek to zwykle
  domownik, nie fan gatunku. Przed v0.7.0 jedyny tryb dla dwóch osób przy jednym komputerze
  to był hot-seat FFA, czyli **pojedynek z autorem gry** — układ, w którym mniej wprawiona
  osoba przegrywa szybko i sesja kończy się, zanim wyprodukuje jakiekolwiek dane.
- **Co-op odwraca ten układ:** dwoje ludzi gra razem przeciw botom, a przeciwnikiem jest
  trudność do wyregulowania suwakiem, nie druga osoba przy stole. To format, w którym
  sesja trwa długo i sama z siebie generuje protokół „myśl na głos" — bo gracze *muszą*
  rozmawiać o planie. Dokładnie ten materiał, po który się siada do fali 0.
- **Nic nie tracimy z pierwotnego celu.** Checklista fali 0 wymagała hot-seatu po to, żeby
  tryb wieloosobowy przeszedł test w naturalnych warunkach — a co-op jedzie **tą samą
  ścieżką kodu** (kolejka tur hot-seat, timer tury, banery „twoja tura", panel boczny).
  Test trybu multi zostaje wykonany, tylko w wariancie, w który da się realnie grać w domu.
- **Efekt uboczny wart odnotowania:** pierwsza obserwacja, jak drabinka trudności zachowuje
  się przy dwóch ludziach naraz (dziś presety są strojone `sim.js`-em wyłącznie 1v1/FFA).

**Argument za „teraz, nie później" (zrealizowany):** szkielet drużyn dokłada pola do gracza,
więc wymagał podbicia `SAVE_FORMAT` (2 → 3) — a to unieważnia istniejące zapisy. Przed EA
było to bezkosztowe (świadomie brak migracji przed 1.0); po wypuszczeniu buildów testerskich
każde takie podbicie kasowałoby partie testerów w trakcie ich sesji.

### Nota: audio i onboarding awansują przez testy zewnętrzne

Formalnie oba są P1, ale w praktyce mają **twardy deadline wcześniejszy niż premiera**: to
dokładnie ta amunicja, po którą sięga niechętny krytyk („grałem, drewno bez dźwięku, nie
wiedziałem co robić"). Ponieważ ryzyko ze strony testerów jest **narracyjne, nie własnościowe**
(patrz [13-Testy-zewnetrzne.md](13-Testy-zewnetrzne.md)), obroną nie jest tajność ani NDA,
tylko wersja, której się nie wstydzisz. Praktyczny wniosek: **audio i onboarding przed falą 2
testerów**, nie przed samym EA.

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

## Cel potwierdzony: multiplayer sieciowy na Steam

Docelowo gra ma mieć **multiplayer sieciowy na Steam**. Zapisane tutaj, bo wcześniej
dokumenty tego nie odzwierciedlały: co-op jest zaplanowany jako **hot-seat** (patrz
[nota o co-opie](#nota-co-op-awansuje-z-roadmapy-do-rdzenia-bramka-fali-0)), a MP sieciowy
figurował w backlogu jako jedna pozycja 🔴. Opis techniczny pozycji stoi
w [10-Przyszle-plany.md](10-Przyszle-plany.md#narzędzia-i-meta); tutaj — konsekwencje
dla sekwencji i dla wyboru silnika.

**Sekwencja: po EA, nie przed.** Sens EA to zwalidowanie pętli na graczach, a do tego MP
sieciowy nie jest potrzebny — bramką fali 0 jest co-op hot-seat, a P0 to zamykalność,
zapis, stabilność i dystrybucja. Odwrotna kolejność (MP jako warunek premiery) oznaczałaby
przesunięcie startu o duży, nieprzetestowany system.

**Dwie rzeczy, nie jedna.** Warto je wyceniać osobno, bo mają różny ciężar:

| Warstwa | Stan | Uwaga |
|---|---|---|
| Netcode (transport + autorytatywna walidacja ruchu + lobby) | do napisania | Gra turowa to najłatwiejszy przypadek: wyślij ruch, zwaliduj, rozgłoś. Kodek stanu (`serializeGame`) już jest. |
| Integracja Steamworks (lobby, zaproszenia, P2P/SDR, osiągnięcia) | do napisania | Z wrappera Electron przez wiązania Node (`steamworks.js`) — czyli w tym samym kroku, który i tak jest w planie dystrybucji wyżej. |

**Decyzja o silniku jest zapisana osobno.** Pytanie „czy nie przenieść gry na Godota"
wraca naturalnie przy słowach „Steam" i „multiplayer", więc odpowiedź — wraz ze zmierzonym
bilansem portu i warunkami jej odwrócenia — mieszka w
[15-Silnik-i-przenosnosc.md](15-Silnik-i-przenosnosc.md). Skrót: **zostajemy na obecnym
stacku**, bo przy celach „PC/Steam, bez konsol, solo, MP w gronie znajomych" port nie
kupuje żadnej potrzebnej zdolności.

Dla tego dokumentu istotny jest jeden skutek: **walidacja ruchu ma być osobną warstwą,
która nie wie, czy działa u hosta-gracza, czy na serwerze** — siada obok `combat.js`
i `empire.js`, nigdy w `input.js` ani `ui.js`. To daje darmową drogę do autorytatywnego
serwera, gdyby multiplayer wyszedł poza grono zaproszonych. Reguła jest pilnowana
maszynowo przez `node tools/check-portability.js`.
