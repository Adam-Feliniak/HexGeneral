# Silnik i przenośność

**Decyzja (30.07.2026, v0.6.2): gra zostaje na czystym JS + Canvas 2D.**
Nie dlatego, że tyle już w to włożono, tylko dlatego, że przy dzisiejszych celach
zmiana silnika nie kupuje **żadnej zdolności, której projekt potrzebuje** — a kosztuje
4–10 tygodni pracy solo.

Ten dokument istnieje, żeby nie prowadzić tej rozmowy po raz czwarty. Zapisuje **liczby**,
na których stoi decyzja, oraz warunki, przy których należy ją odwrócić.

## Dlaczego to pytanie wraca

Bo wraca przy każdym słowie „Steam", „multiplayer" i „animacje". I bo **moment ma
znaczenie**: sztuka i logika są już przenośne, więc port zmarnowałby dziś tylko jedną
rzecz — **netcode, który jeszcze nie istnieje**. Netcode napisany tutaj, a potem
portowany, to netcode napisany dwa razy. Dlatego decyzja zapada **przed** co-opem,
a nie po nim.

## Zmierzony bilans portu

`src/` to 4040 linii, w tym 420 generowanych (`locales-data.js`).

| Warstwa | Linie | Co się z nią dzieje przy porcie |
|---|---|---|
| Logika: `combat`, `ai`, `mapgen`, `roads`, `empire`, `turns`, `state`, `geometry`, `utils`, `config` | **1642** | **tłumaczenie** — decyzje projektowe bez zmian |
| Kodek zapisu (`save.js`) | ~200 | tłumaczenie |
| DSP i przepisy dźwięku (`audio.js` 1–255) | 255 | tłumaczenie — czysta arytmetyka na `Float32Array` |
| Render (`render.js`) | 379 | **przepisanie** — inny paradygmat |
| Menu + UI (`menu.js`, `ui.js`) | 532 | **przepisanie** |
| Input (`input.js`) | 183 | **przepisanie** |
| Odtwarzanie audio (`audio.js` 256–497) | 241 | **kasowanie** — silnik daje szyny i efekty |
| `index.html` + `style.css` | 841 | **kasowanie** |
| Harnessy `sim.js` + `stress.js` | ~1000 | **odbudowa** — wzorzec „ładuj `src/*.js` do `vm`" umiera poza JS |
| Pipeline sprite'ów (`gen-sprites.js`, `png.js`, `png-to-grid.js`) | — | **zostaje bez zmian** |

Dwa wnioski, które łatwo przeoczyć:

- **Port jest realny, nie apokaliptyczny.** Około 2100 linii tłumaczy się mechanicznie,
  przepisania wymaga ~1450. Decyzja musi więc stać na argumentach, a nie na strachu
  przed kosztem.
- **Praca nad grafiką jest bezpieczna niezależnie od wszystkiego.** Sprite'y to PNG
  w `assets/`, a generator jest zwykłym skryptem Node — każdy silnik wczyta te same pliki.
- **Najłatwiej zapomnieć o harnessach.** To `tools/stress.js` dał wynik „500 partii,
  0 naruszeń", a `tools/sim.js` stroi presety trudności. Poza JS trzeba je odbudować,
  zanim znów będzie można ufać balansowi.

## Cele, które zamykają sprawę

| Pytanie | Odpowiedź | Skutek |
|---|---|---|
| Konsole? | **Nigdy.** PC/Steam, ewentualnie mobile | Znika **jedyny twardy sufit** weba |
| Multiplayer? | Najpierw znajomi przez lobby Steam, publiczny może później | Turówka to najprostszy możliwy netcode; kodek stanu już istnieje |
| Zespół? | Solo do końca | Argument „o Godocie łatwiej znaleźć ludzi" nie ma zastosowania |

Przy takim zestawie odpowiedzi silnik z gotowym high-level multiplayerem błyszczy tam,
gdzie tej gry nie ma: przy synchronizacji stanu w czasie rzeczywistym. Tutaj wystarczy
„wyślij ruch, zwaliduj, rozgłoś".

## Co tracimy, zostając

Uczciwie, żeby decyzja nie wyglądała na jednostronną: edytor do strojenia na żywo,
gotowe drzewa animacji, cząstki, shadery, mapowanie padów z pudełka, wygodny eksport
mobilny. **Nie tracimy** natomiast efektów audio — Web Audio ma natywnie `ConvolverNode`,
`BiquadFilterNode` i `DynamicsCompressorNode` (patrz [14-Dzwiek.md](14-Dzwiek.md)).

## Mobile — jedyny kierunek, który realnie waży

Android/iOS to możliwy cel. Trzy rzeczy warto wiedzieć, zanim stanie się celem twardym:

1. **Electron nie działa na mobile.** Ścieżką dla tego stacku jest Capacitor
   (natywna skorupa wokół WebView) — dojrzały, a build ~226 KB offline nie jest dla niego
   żadnym wyzwaniem. Przed zobowiązaniem się do iOS trzeba **sprawdzić aktualną politykę
   App Store** wobec gier w WebView; nie zakładać z góry ani zgody, ani odmowy.
2. **Dominującym kosztem mobile jest przeprojektowanie UI i sterowania, a nie silnik.**
   Plansza 1174×616 ze stałym panelem bocznym, podpowiedzi zależne od najechania
   (`hoverTile`, `tileTooltip` w `input.js`) i prawy przycisk myszy nie mają odpowiednika
   na telefonie — **w żadnym silniku**. Godot ułatwia eksport i obsługę dotyku, ale
   redesignu nie zdejmuje. Dlatego mobile przechyla szalę tylko odrobinę.
3. **Dwie rzeczy robimy już teraz po myśli mobile, przypadkiem:**
   - kafle jednostek autorstwa 2× (bloki 2×2 zamiast detalu 1 px) znoszą dowolne
     skalowanie znacznie lepiej niż drobny detal — a na telefonie plansza **nigdy** nie
     trafi 1:1 (patrz [07-Grafika-i-sprite-y.md](07-Grafika-i-sprite-y.md));
   - `#board` ma `max-width: 100%` i `image-rendering: pixelated`, więc przy skalowaniu
     niecałkowitym przeglądarka **wyrzuca rzędy pikseli**. Dziś to defekt kosmetyczny,
     przy mobile staje się decyzją do podjęcia świadomie (snapowanie do zoomu całkowitego
     albo dopuszczenie wygładzania).

## Reguła przenośności — egzekwowana, nie deklarowana

To, co czyni port tanim, jest mierzalne: **dziewięć plików logiki nie zawiera ani jednego
odwołania do przeglądarki**, a `state.js` i `save.js` mają je wyłącznie wewnątrz funkcji
osłoniętych `typeof X === 'undefined'`.

Ta czystość nie utrzyma się sama — wystarczy jedno „tylko odświeżę panel z poziomu
`combat.js`". Dlatego reguła jest sprawdzana maszynowo:

```
node tools/check-portability.js            # kod 0 = czysto
node tools/check-portability.js --verbose  # pokaże odwołania dopuszczone przez osłonę
```

Skrypt nie pilnuje „zera odwołań", tylko dokładnie tej konwencji: **odwołanie do API
przeglądarki jest dozwolone wyłącznie w funkcji, która wcześniej sprawdza
`typeof <to samo API> === 'undefined'` i wychodzi.** Osłona na inny globals niż użycie
nie przechodzi. Nie ma listy grandfatherowanych wyjątków, która po cichu rośnie.

To ta sama konwencja, która pozwala `tools/sim.js` i `tools/stress.js` grać pełne partie
w czystym Node (patrz [09-Przewodnik-developera.md](09-Przewodnik-developera.md)) —
przenośność jest jej **skutkiem ubocznym**, nie osobnym kosztem.

## Reguła netcode — zapisana, zanim powstał kod

Wynika wprost z celu „najpierw znajomi, publiczny może później":

> **Walidacja ruchu ma być osobną warstwą, która nie wie, czy działa u hosta-gracza,
> czy na serwerze.**

Siada obok `combat.js`/`empire.js`, **nigdy** w `input.js` ani `ui.js`. Kosztuje dziś
niewiele, a daje dwie rzeczy naraz: darmową drogę do autorytatywnego serwera, gdyby
multiplayer wyszedł poza grono znajomych, oraz kod, który przeżyłby ewentualny port.
`serializeGame()`/`deserializeGame()` ([save.js](../src/save.js)) są już gotowym
prymitywem synchronizacji i wznawiania partii.

## Kiedy wrócić do tej decyzji

Nie „gdy znowu naszła ochota", tylko przy jednym z tych zdarzeń:

1. **Mobile staje się celem twardym**, a nie „może kiedyś" — wtedy przelicz redesign UI
   po obu stronach, bo dopiero wtedy jest porównywalny.
2. **Multiplayer wyrasta ponad lobby znajomych** — publiczny matchmaking z serwerem
   autorytatywnym to inny ciężar niż P2P w gronie zaproszonych.
3. **Do kodu wchodzi druga osoba** — standardowy silnik obniża próg wejścia.
4. **Canvas 2D przestaje wyrabiać** przy animowanym terenie — mierzalnie, spadkiem klatek,
   a nie przeczuciem.
5. **Konsole wracają na stół** — dziś wykluczone, ale to jedyny sufit nie do przeskoczenia.

Żaden z tych warunków nie jest dziś spełniony.
