# Dźwięk

Cały dźwięk w Hex General jest **generowany proceduralnie** — w repo nie ma ani jednego
pliku audio. Ta decyzja jest równocześnie techniczna i prawna.

## Dlaczego proceduralnie

**Powód prawny (najważniejszy).** Gra ma wyjść komercyjnie, a `LICENSE` mówi, że Utwór
„w tym jej kod źródłowy, grafika, **dźwięk**, teksty" stanowi wyłączną własność autora.
Każdy dźwięk z zewnątrz — choćby na CC-BY — czyniłby to zdanie nieprawdziwym i wymuszał
klauzulę o assetach osób trzecich plus ewidencję pochodzenia każdego pliku. Przy syntezie
własnej `LICENSE` zostaje bez zmian, nie ma czego dokumentować i nie ma ryzyka, że któraś
paczka „darmowych dźwięków do gier" okaże się CC-BY-NC (niekomercyjna) albo CC-BY-SA
(ShareAlike zaraża utwór pochodny — przy zamkniętej grze komercyjnej to realny problem).

**Powód techniczny.** Gra działa z `file://`, gdzie `fetch()`/`decodeAudioData` są
zablokowane. Natomiast `ctx.createBuffer()` plus wypełnienie próbek to czysta arytmetyka,
więc działa zawsze. To ta sama asymetria, którą projekt zna już od strony grafiki: PNG się
rysuje, ale odczyt pikseli z canvasa jest blokowany (dlatego istnieje `tools/serve.js`).

**Powód praktyczny.** 8 dźwięków to ~90 tys. próbek, czyli milisekundy przy pierwszym
kliknięciu. Te same dźwięki jako pliki WAV to **270 KB**, a 30-sekundowa pętla muzyki
**1,3 MB** — przy buildzie ważącym 204 KB byłoby to kilkukrotne powiększenie.

## Jak to jest zbudowane

| Warstwa | Gdzie | Uwagi |
|---|---|---|
| Primitywy DSP | `src/audio.js` | oscylator (kwadrat/piła/trójkąt/sinus), szum z filtrem dolnoprzepustowym, **filtr rezonansowy z przemiataniem** (`svfSweep`), **nasycenie** (`saturate`), **uderzenie o geometrycznie opadającej wysokości** (`addThump`), **pogłos Schroedera** (`reverbTail`), obwiednie, ustawienie poziomu na RMS z blokadą składowej stałej, sufitem szczytu i wygaszeniem ogona |
| Przepisy dźwięków | `SFX_RECIPES` w `src/audio.js` | jedna czysta funkcja `(rate) => Float32Array` na dźwięk |
| Partytury muzyki | `MUSIC_TRACKS` w `src/audio.js` | tabela nut `[ćwierćnuta, długość, MIDI, instrument]` |
| Synteza muzyki | `renderMusicLoop()` w `src/audio.js` | czysta funkcja `(rate) => Float32Array`; głosy FM, subtraktywne i perkusyjne, szyna z nasyceniem i pogłosem |
| Odtwarzanie | `src/audio.js` | `AudioBuffer` dla SFX **i dla muzyki** (pętla jako `BufferSource` z `loop = true`), throttling, głośności |
| Podsłuch / strojenie | `tools/gen-sounds.js` | renderuje przepisy do WAV-ów w `dist/sfx/`, a pętle muzyki do `dist/music/` (`--music`) — **gra ich nie wczytuje** |
| Pomiar / audyt | `tools/audit-sounds.js` | szczyt, RMS, crest, atak, centroida widmowa + przebiegi PNG w `dist/audit/`; `--save=`/`--diff=` porównuje stan przed i po zmianie |
| Ścieżka odtwarzania | `tools/audio-check.js` | atrapa Web Audio: leniwy render pętli, zmiana ekranu, wyścig przy szybkiej zmianie, koniec gry → nowa partia |

## Miks: dlaczego poziom jest ustawiany na RMS, a nie na szczycie

Do v0.6.2 `finishBuffer()` normalizował każdy dźwięk do zadanego **szczytu**. Dawało to
poprawną hierarchię szczytów (`click` 0,42 → `explosion` 0,95), ale ucho słyszy energię,
nie szczyt — a pomiar (`node tools/audit-sounds.js`) pokazał, że hierarchia głośności
była wtedy **odwrócona**:

| | `click` | `shot` | `explosion` |
|---|---|---|---|
| przed (RMS) | −17,6 dB | −19,2 dB | −17,9 dB |
| po (RMS) | −26,0 dB | −18,0 dB | −18,2 dB |

Czyli kliknięcie w przycisk było głośniejsze od wystrzału i równe eksplozji. Dziś
`finishBuffer(buf, rate, level)` dopasowuje **RMS** do jawnego poziomu z przepisu, a te
poziomy są tabelą miksu: interfejs najniżej, ruch nad nim, walka wyżej, zdarzenia
(zdobycie, aneksja, koniec gry) najwyżej.

**Sufit szczytu jest twardy i celowo widoczny w pomiarze.** Dźwięk o dużym crest factorze
nie zmieści się w zakresie przy dopasowaniu RMS — `explosion` miał crest ~18 dB, więc to
szczyt, a nie wzmocnienie, ograniczał jego głośność (audyt pokazywał wtedy szczyt 0,98).
Wniosek brzmiał: **eksplozji nie da się podgłośnić gainem** — trzeba zmniejszyć crest
factor, czyli dodać saturację.

**Zrobione w 0.7.1 — i lekcja jest inna, niż wyglądała.** Po dodaniu `saturate()` crest
`explosion` spadł z 18,0 na 9,1 dB, a szczyt odkleił się od sufitu (0,98 → 0,57). Ale
ujawniło to rzecz, której nikt nie widział: **poziomy w tabeli miksu były życzeniami,
a nie ustawieniami**. `explosion` i `shot` prosiły o `level = 0,30` i nigdy go nie
dostawały, bo sufit szczytu ucinał wzmocnienie wcześniej. Gdy cel wreszcie stał się
osiągalny, oba skoczyły o 6-8 dB i rozpiętość miksu urosła z 10,6 na 15,6 dB — czyli
poprawka jednego dźwięku zepsuła balans wszystkich. Poziomy trzeba było przestroić do
świata, w którym działają (`explosion` 0,30 → 0,20, `shot` 0,30 → 0,16; dziś −14,0
i −15,9 dB przy rozpiętości 12,0 dB).

> **Reguła na przyszłość:** poziom w `finishBuffer` mówi, o co dźwięk *prosi*, a nie co
> *dostaje*. Zawsze sprawdzaj kolumnę `miks:RMS` w audycie — jeśli `miks:szczyt` stoi
> na −0,2 dB, poziom nie został osiągnięty i liczba w przepisie jest fikcją.

**Blokada składowej stałej** siedzi teraz na wejściu `finishBuffer()`. Filtrowanie szumu
do bardzo niskich częstotliwości zostawia powolne błądzenie wokół zera, a grzebienie
pogłosu mają przy zerze wzmocnienie `1/(1-g)` i jeszcze je podbijają — przy wybuchu dawało
to offset 0,018 zamiast 0,001. Słyszalne to nie jest, ale zjada zapas przed szczytem,
czyli wprost obniża głośność, którą da się wycisnąć.

## Wybuch: cztery warstwy i dlaczego kolejność ma znaczenie

`explosion` składa się z warstw odpowiadających za różne wrażenia, a nie z jednego gestu:

| Warstwa | Co robi | Czym jest |
|---|---|---|
| korpus | sam huk | szum przez filtr rezonansowy zjeżdżający 2200 → 85 Hz |
| sub | uderzenie w klatkę piersiową | `addThump` 115 → 30 Hz, geometrycznie |
| rumor | osypujące się szczątki, echo terenu | szum dolnoprzepustowy, długi zanik |
| trzask | „blisko", czytelność zdarzenia | krótki szum 4500 → 1500 Hz, 40 ms |

**Pogłos idzie po warstwach niskich, ale przed trzaskiem.** Fizycznie trzask dociera
bezpośrednio, a odbija się dudnienie. Odwrotna kolejność (pogłos na gotowej całości)
rozsmarowuje wysokie pasmo trzasku na cały ogon i wybuch robi się jasny. Tak samo
**saturacja idzie przed trzaskiem**: dokłada harmoniczne, więc podnosi jasność tym
mocniej, im jaśniejszy materiał dostanie.

Wynik pomiaru, stary kontra nowy (tą samą, naprawioną miarą — patrz niżej):

| | centroida | crest | szczyt | miks:RMS |
|---|---|---|---|---|
| przed | 5058 Hz | 18,0 dB | 0,98 (przy suficie) | −18,2 dB |
| po | **1519 Hz** | 9,1 dB | 0,57 | −14,0 dB |

## Pułapka pomiaru: centroida liczyła się z samego ataku

`spectralCentroid()` w `audit-sounds.js` brał **pierwsze 4096 próbek**, czyli 186 ms przy
22 kHz — a kolumna nazywała się po prostu „centroida". Przy krótkich dźwiękach to bez
różnicy, ale przy wybuchu (1,25 s) cały ciemny ogon, sub i pogłos **nie były w ogóle
mierzone**. Skutek praktyczny: strojenie ogona pod tę liczbę nie mogło jej ruszyć, a odczyt
sugerował, że dźwięk jest jasny, choć jasny był tylko jego początek — i kusił, żeby
przytłumić coś, co wcale nie było problemem. Dziś liczy się średnia z ramek po całym
dźwięku, ważona energią ramki.

Morał ogólniejszy niż ten jeden bug: **przy strojeniu na liczby sprawdź, co liczba mierzy,
zanim zaczniesz pod nią stroić.** Inaczej optymalizujesz przyrząd, a nie dźwięk.

## Wariancja przy odtwarzaniu

Bufor jest liczony raz i odtwarzany bajt w bajt, a ucho wyłapuje dokładne powtórzenie
natychmiast — przy dźwiękach lecących dziesiątki razy na turę to główne źródło zmęczenia.
`SFX_VARY` podaje zakres losowego `playbackRate` przy każdym zagraniu (`click` ±5%,
`move` ±8%, `shot`/`explosion` ±6%).

Celowo **tylko dźwięki niemelodyczne**: `city`, `annex`, `victory` i `defeat` to frazy
nutowe, a ±6% to blisko półtonu — rozstrojenie kłóciłoby się z muzyką grającą w tle.

Przepisy są czystymi funkcjami na `Float32Array` i nie dotykają przeglądarki, dlatego
`tools/gen-sounds.js` może je wczytać do sandboxa `vm` (tym samym wzorcem co `tools/sim.js`
i `tools/stress.js`) i wyrenderować do plików. **Nie ma drugiej kopii syntezy**, która
mogłaby rozejść się z brzmieniem w grze.

## Strojenie dźwięku

1. Zmień funkcję w `SFX_RECIPES` (`src/audio.js`).
2. `node tools/gen-sounds.js --only=explosion` — odsłuchaj `dist/sfx/explosion.wav`
   w edytorze audio, obejrzyj przebieg.
3. Powtarzaj. Gra nie wymaga regeneracji niczego — syntezuje ten sam przepis przy starcie.

Przydatne flagi: `--rate=44100` (podgląd w wyższej jakości), `--out=ścieżka`.

`dist/` jest w `.gitignore`, więc pliki podglądowe nie trafiają do repo. To odwrotnie niż
przy sprite'ach, gdzie PNG-i **są** commitowane — bo tam runtime ich potrzebuje.

## Muzyka: silnik i architektura

**Muzyka jest renderowana do bufora, nie grana na żywo.** To zmiana z 0.7.1 i ma dwa
niezależne powody.

Pierwszy jest architektoniczny. Dopóki pętlę grał graf węzłów Web Audio,
`tools/gen-sounds.js` musiał zawierać **drugą implementację syntezy**, żeby dało się
jej posłuchać poza przeglądarką — a dwie implementacje rozjeżdżają się po cichu.
Dziś muzyka to `renderMusicLoop()`: czysta funkcja `(rate) => Float32Array`, tak samo
jak przepisy SFX. Gra odtwarza jej wynik jako `AudioBufferSourceNode` z `loop = true`,
a narzędzie zapisuje ten sam wynik do WAV-a. **Nie ma czego synchronizować.**

Drugi powód jest brzmieniowy i ważniejszy. Granie na żywo ogranicza syntezę do tego,
co da się policzyć w czasie rzeczywistym grafem węzłów — czyli w praktyce do kilku
oscylatorów. Offline sufit znika: pętla liczy się raz, kilkaset milisekund, i może
zawierać dowolnie kosztowną syntezę.

### Co gra zamiast trzech fal

Do 0.6.x wszystkie partie grały na `triangle`, `square` i `noise` z jedną obwiednią —
czyli na zestawie NES-a, i to on odpowiadał za odbiór „muzyka 8-bitowa", a nie
kompozycja. Dziś:

| Instrument | Synteza | Po co |
|---|---|---|
| `lead` | FM, dwa operatory, głębokość modulacji opadająca w czasie | brzmienie Neo Geo: ostre wejście, miękkie podtrzymanie — filtrem się tego nie uzyska |
| `bass`, `pad` | subtraktywna: rozstrojone piły przez filtr rezonansowy z obwiednią | rozstrojenie daje grubość, obwiednia filtra daje „ruch" |
| `kick`, `snare`, `hat` | osobne przepisy perkusyjne | stary silnik miał JEDEN dźwięk perkusyjny na każde uderzenie, czyli metronom, nie rytm |

Tonacja **została ta sama** — E frygijska. Diagnoza z fali 0 („brzmi jak dla dzieci")
dotyczyła syntezy i rytmu, nie materiału wysokościowego: półton E-F na początku skali
to najciemniejszy interwał dostępny bez wychodzenia poza diatonikę. Zmieniło się to,
co faktycznie odpowiadało za wrażenie: barwa, rejestr i rozbicie rytmu oom-pah
(bas i perkusja na zmianę co bit, przez całą pętlę, bez ani jednej pauzy).

### Bezszwowość: jedyna rzecz, którą łatwo tu zepsuć

Bufor ma długość **dokładnie jednej pętli**, więc ogon nuty zaczętej pod koniec musi
wrócić na początek — `renderMusicLoop` dopisuje głosy modulo długość bufora. Bez tego
w miejscu szwu powstaje dziura i pętla klika przy każdym obiegu.

Dwie pułapki, obie wykryte pomiarem, nie słuchem:

- **Efekt ze stanem (pogłos) puszczony wprost na bufor pętli łamie szew** — zaczyna od
  ciszy i urywa się na końcu. Rozwiązanie w `musicLoopReverb()`: przepuścić sygnał dwa
  razy pod rząd i wziąć drugi przebieg, czyli stan ustalony.
- **Nie wolno wygaszać ogona** tak, jak robi to `finishBuffer()` dla SFX — tam wygaszenie
  usuwa trzask na końcu bufora, tu zrobiłoby dziurę przy każdym obiegu. Dlatego pętla ma
  własną normalizację (`musicNormalize`) bez fade-outu.

Jest jeszcze subtelność, która potrafi zmylić przy każdym porównaniu z modelem: bufor
musi mieć **całkowitą liczbę próbek**, a 32 bity przy 132 bpm nie wypadają równo.
Zaokrąglenie znaczy, że pętla gra o ułamek promila wolniej niż nominalne bpm —
niesłyszalne, ale każdy model liczący pozycje nut z czasu (a nie z długości bufora)
będzie się z nią rozjeżdżał o ułamek próbki na obieg.

`node tools/gen-sounds.js --selftest` sprawdza szew liczbowo: porównuje skok na styku
z rozkładem skoków wewnątrz pętli. Przy obecnej partyturze szew to ~30% największego
skoku w utworze i jest **statystycznie nieodróżnialny od każdego innego wejścia stopy** —
czyli transjent perkusji, a nie nieciągłość.

### Ścieżka odtwarzania ma własny test i to nie jest nadgorliwość

Synteza jest czysta i sprawdza ją `--selftest`, ale **odtwarzanie** (leniwy render, zmiana
pętli, zatrzymanie na końcu gry) dotyka Web Audio, więc nie łapie go żaden headless
harness. `node tools/audio-check.js` uruchamia je na atrapie kontekstu.

Test powstał, bo wersja pierwsza miała realny błąd: przy szybkiej zmianie ekranu
(menu → gra, zanim odłożony render menu zdążył ruszyć) flaga „render w toku" blokowała
zlecenie renderu nowej pętli, a zadanie startowe porzucało ją, bo `musicWanted` już się
zmienił. Efekt: **muzyka nie startowała w ogóle** — i to w scenariuszu, który gracz robi
przy każdym wejściu do partii.

### Pula utworów partii

Partia nie ma jednej ścieżki dźwiękowej, tylko losuje ją z `MUSIC_GAME_POOL`
(`game`, `marchHeavy`, `marchTight`, `bright`, `ambient`). Menu ma własną, stałą pętlę
i do puli nie należy.

**Losowanie idzie z `mapSeed`, a nie z `Math.random()`, i to jest decyzja o zapisie
gry, nie o dźwięku.** Wybór wyprowadzony z ziarna jest funkcją stanu, który już istnieje
i już przechodzi przez kodek w `save.js` — więc wczytana partia wraca z tą samą muzyką,
a `SAVE_FORMAT` zostaje bez zmian. Losowanie w locie wymagałoby zapamiętania wyniku,
czyli nowego pola stanu i bumpa formatu, za coś, co da się policzyć.

Dwie pułapki w samym losowaniu, obie wyłapane dopiero pomiarem rozkładu na 400 partiach:
`audioRng()` zwraca **[-1, 1)**, bo powstał do szumu (indeks wychodzi ujemny, a `%` w JS
tego nie naprawia), a pierwsze wyjście generatora liniowego jest niemal liniowe w ziarnie
— przy ziarnach po kolei dawałoby utwory po kolei. Stąd dwa odrzucone wyjścia i mapowanie
na [0, 1).

`MUSIC_GAME_POOL` jest **jawną listą**, a nie `Object.keys(MUSIC_TRACKS)` bez `menu`:
przyszły utwór na ekran zwycięstwa nie ma prawa wpaść do losowania sam z siebie.

### Poziom pętli: ta sama pułapka co przy SFX

`level` w partyturze mówi, o jaki RMS pętla *prosi*. Jeśli crest jest wysoki, wcześniej
zadziała sufit szczytu i zadany poziom pozostanie fikcją — dokładnie tak, jak było
z `explosion`. Sprawdzian jest ten sam: jeśli szczyt stoi równo na 0,95, to poziom
**nie** został osiągnięty.

**Przy puli ta pułapka zmienia charakter: poziom przestaje być sprawą jednego utworu.**
Skoro utwór losuje się z ziarna, dwie partie nie mogą różnić się głośnością — inaczej
gracz słyszy „ta mapa ma cichszą muzykę". Dlatego cała pula stoi na jednym
`MUSIC_POOL_LEVEL`, a jego wartość wyznacza utwór o **najwyższym creście**, bo tylko do
jego sufitu (0,95 / crest) sięgają wszystkie. Zmierzone maksima: `game` 0,218,
`marchTight` 0,208, `ambient` 0,167, `marchHeavy` 0,161, `bright` 0,137 — pulę wiąże
`bright`, stąd 0,135.

Podbicie `drive`, żeby zbić crest i podnieść sufit, odrzucono świadomie: `bright` dobija
do 0,163 dopiero przy `drive: 2.2`, a w utworze spokojnym saturację słychać wprost.
Konsekwencja, o której trzeba wiedzieć: `game` grał do 0.7.2 na `level: 0.20`, więc
**muzyka partii jest o 3,4 dB cichsza niż wcześniej**. `menu` zostaje na 0,11, przez co
wejście do gry to skok o 1,8 dB zamiast dawnych 5,2 dB.

### Koszt i kiedy się liczy

| | czas renderu | pamięć |
|---|---|---|
| pętla `menu` (30 nut, 32 bity, 48 kHz) | ~300 ms | 3,8 MB |
| pętla `game` (178 nut, 32 bity) | ~450 ms | 2,8 MB |
| pętla `bright` (203 nuty, 64 bity) | ~960 ms | 7,2 MB |
| pętla `marchHeavy` (249 nut, 64 bity) | ~1120 ms | 7,5 MB |
| pętla `marchTight` (304 nuty, 64 bity) | ~1310 ms | 6,1 MB |
| pętla `ambient` (77 nut, 64 bity) | ~840 ms | 9,5 MB |

Render idzie **raz na sesję i jest odłożony poza obsługę kliknięcia** (`setTimeout` 0
w `musicPlaybackStart`): pierwszy gest użytkownika i tak uruchamia syntezę wszystkich
SFX, a doliczenie do tego pętli zamroziłoby reakcję na przycisk na pół sekundy.

Dwie liczby, które zmieniła pula. Po pierwsze, pętle 64-bitowe liczą się **2–3× dłużej**
niż 32-bitowe — opóźnienie startu muzyki rośnie z ~0,45 s do ~1,3 s (patrz „Do rozważenia:
prerender…" niżej). Po drugie, `musicBuffers` **nie ma eksmisji**: sesja, w której gracz
rozegra pięć partii z różnymi ziarnami, dojdzie do ~34 MB buforów muzyki plus menu.
Na desktopie to nieistotne, ale jest to liczba, która wcześniej nie mogła przekroczyć
6,6 MB.

Dwie optymalizacje, bez których to nie miałoby sensu (zmierzone: 2650 ms → 440 ms):

- **tablice falowe na pasmo oktawowe, nie na wysokość** — inaczej koszt rośnie z liczbą
  różnych nut w utworze, czyli dokładnie tam, gdzie gęsta aranżacja uderza najmocniej;
- **rekurencje zamiast funkcji przestępnych w pętli próbek** — `Math.exp` na obwiednię
  i `Math.tan` na współczynniki filtra były głównym kosztem. Obwiednia liczy się raz na
  nutę i jest współdzielona przez oscylator i filtr, a współczynniki filtra przeliczają
  się co 32 próbki (obwiednia zmienia się o rzędy wielkości wolniej).

### Do rozważenia: prerender zamiast liczenia w locie

Render pętli kosztuje dziś ~440 ms, ale to liczba dla utworu 32-bitowego. Kandydaci
na nową ścieżkę mają 64 bity i gęstszą aranżację — zmierzone **1,14–1,30 s**. Dopóki
render jest odłożony `setTimeout`-em, nic się nie zacina, ale muzyka wchodzi z opóźnieniem,
i to **dokładnie w najgorszym momencie**: `updateMusicForScreen()` liczy pętlę bieżącego
ekranu, więc wejście do gry zamawia render `game` w chwili, w której gracz właśnie patrzy
na świeżą mapę. Stąd pomysł, żeby muzykę dostarczać gotową.

Są dwie drogi i dzieli je to, czy łamią zasadę „zero plików audio".

**Tania i bez konsekwencji: rozgrzewanie przed czasem.** Pętla gry nie musi czekać na
wejście do gry — nic nie stoi na przeszkodzie, żeby policzyć ją w tle, gdy gracz siedzi
w menu albo układa skład w lobby. `musicBufferFor()` cache'uje po nazwie, więc wystarczy
zawołać go wcześniej — a gdy utwór jest losowany z puli na partię, wiadomo którą pętlę
liczyć, zanim mapa się w ogóle pokaże. Kosztuje zero bajtów w repo i nie rusza żadnej
zasady — to jest pierwsza rzecz do sprawdzenia, jeśli opóźnienie zacznie przeszkadzać.

**Droga i z konsekwencjami: dołączenie policzonego dźwięku do buildu.** Tu prerender
przestaje być optymalizacją, a staje się zmianą architektury:

- `fetch()` na `file://` jest zablokowany, więc plik nie może być `.wav` obok `index.html`
  — musiałby wejść jako **base64 w pliku `.js`**, tak jak rozważane próbki perkusji;
- rozmiar: 40-sekundowa pętla jako 16-bit mono to ~1,7 MB przy 22 kHz i ~3,8 MB przy
  48 kHz, a base64 dokłada jedną trzecią. Przy buildzie ważącym ~204 KB to nie jest
  „trochę większy build", tylko inny rząd wielkości — i to **na każdy utwór w puli**;
- **pułapka, która nie jest oczywista: prerender zamraża częstotliwość próbkowania.**
  Gra liczy pętlę w częstotliwości `AudioContextu`, a tablice falowe są obcinane do
  Nyquista *dla tej częstotliwości* (patrz `musicWavetable`). Plik wyrenderowany w 22 kHz
  i przepróbkowany przez przeglądarkę do 48 kHz nie jest tym samym sygnałem, który
  strojono na słuch — czyli traci się dokładnie tę własność, dla której `renderMusicLoop()`
  jest czystą funkcją wspólną z narzędziem;
- zostaje też powód prawny z początku tego dokumentu: plik audio w repo to plik, którego
  pochodzenie trzeba udokumentować. Przy własnym renderze własnej partytury jest to
  formalność, ale przestaje być automatyczne.

Wniosek roboczy: **najpierw rozgrzewanie**, plik dopiero gdyby okazało się, że i to nie
wystarcza — ta sama kolejność, co przy próbkach perkusji (najpierw synteza, pliki tylko
jeśli synteza nie da rady).

### Porównywanie wariantów bez ruszania gry

```
node tools/gen-sounds.js --music --tracks=<plik.js>
```

Plik jest zwykłym modułem CommonJS eksportującym `MUSIC_TRACKS` (opcjonalnie też
`MUSIC_INSTRUMENTS`) — **tymi samymi nazwami co w grze**, więc zwycięski wariant
przenosi się do `src/audio.js` kopiuj-wklej.

## Inwentarz dźwięków

| Dźwięk | Kiedy | Gdzie wpięty |
|---|---|---|
| `click` | każde kliknięcie przycisku | listener delegowany w `initAudio()` |
| `move` | ruch armii bez bitwy | `executeMove` (`combat.js`) |
| `shot` + `explosion` | bitwa | `resolveBattle` (`combat.js`) |
| `city` | zdobycie lub zajęcie miasta | `captureTile` (`empire.js`) |
| `annex` | aneksja imperium | `conquerEmpire` (`empire.js`) |
| `victory` / `defeat` | ekran końcowy | `checkGameOver` (`empire.js`) |
| muzyka `menu` | menu i wszystkie ekrany poza grą | `updateMusicForScreen()` z `applyScreen()` |
| muzyka z `MUSIC_GAME_POOL` | partia; utwór losowany z `mapSeed` | `musicTrackForGame()` |

**Pułapka `captureTile`:** funkcja odpala się przy **każdym** zajętym polu, nie tylko przy
mieście — dlatego dźwięk `city` jest bramkowany warunkiem na `t.city`. Bez tego grałby przy
każdym kroku armii na cudzym terytorium.

## Dwie rzeczy, które łatwo zepsuć

**Throttling to wymóg, nie polerka.** Tempo AI 1×/4×/16× dzieli `thinkDelay` (`ai.js`),
a tryb obserwatora to sama gra botów. Bez ograniczenia dźwięki zamieniłyby się w karabin
maszynowy. `sfxAllowed()` pilnuje trzech rzeczy: minimalnego odstępu między powtórzeniami
tego samego dźwięku (`SFX_MIN_GAP`), limitu jednocześnie brzmiących głosów, oraz tego, że
przy `aiSpeed > 1` w turze bota przechodzą **tylko ważne zdarzenia** (`SFX_ALWAYS`).

**Osłony `typeof` są konieczne, nie kosmetyczne.** `tools/stress.js` i `tools/sim.js`
ładują `combat.js`, `empire.js`, `menu.js` i `input.js` **bez** `audio.js`, więc każde
wywołanie musi iść przez `if (typeof playSfx === 'function')`. Ten sam idiom, którym
`turns.js` woła `autosave()` i `empire.js` woła `clearAutosave()`. Bez osłony harnessy
wywalą się na `ReferenceError`.

## Ustawienia gracza

Ekran „Opcje" ma wyciszenie i trzy suwaki (ogólna / muzyka / efekty). Wartości idą do
`localStorage` pod kluczem **`hexgeneral.audio`**, wzorem języka (`hexgeneral.lang`
w `i18n.js`), z `try/catch` na tryb prywatny przeglądarki.

**Nie są częścią zapisu gry** i nie dotykają `SAVE_FORMAT` — to preferencja użytkownika,
dokładnie jak `aiSpeed`. Uwaga na niespójność: `defaultSeed`/`defaultDifficulty` na tym samym
ekranie **nie są** utrwalane (żyją w `state.options` tylko na czas sesji), więc głośność
przeżywa odświeżenie strony, a domyślny seed nie. Do wyrównania przy okazji.

## Polityka autoplay

`AudioContext` startuje w stanie `suspended`, dopóki użytkownik nie wykona gestu — dlatego
kontekst tworzy się leniwie przy pierwszym `pointerdown`/`keydown`, a nie w `initAudio()`.
Menu zawsze poprzedza rozgrywkę, więc gest jest zagwarantowany. Pętla muzyki zamówiona
przed gestem jest uruchamiana po odblokowaniu (`syncMusic()`).

## Iteracja 2 (jeszcze nie ma)

**Nowe dźwięki.** Dźwięk startu tury (to rytm całej gry — pierwszy kandydat), osobne
brzmienia per typ jednostki, zaokrętowanie i desant, ukończenie drogi, produkcja jednostki,
ostrzeżenie timera tury w multi. Wszystkie sprowadzają się do dopisania przepisu i jednego
wywołania.

**Jakość brzmienia dźwięków bojowych — ZROBIONE w 0.7.1.** Cztery pozycje wskazane
pomiarem zostały zamknięte: filtr rezonansowy zamiast jednobiegunowego (`svfSweep`),
saturacja (`saturate`), pogłos (`reverbTail`) i wypełniony ogon wybuchu. Wyniki i trzy
pułapki, które przy okazji wyszły, opisuje sekcja *Wybuch: cztery warstwy* wyżej.

> **Jedna rada z pierwotnej listy była pułapką i została wycofana:** „nie trzeba pisać
> pogłosu ręcznie, Web Audio ma `ConvolverNode`, `BiquadFilterNode`
> i `DynamicsCompressorNode". Ma — ale przepisy w `SFX_RECIPES` są **czystymi funkcjami
> `(rate) => Float32Array`** i na tym stoją zarówno `gen-sounds.js`, jak i `audit-sounds.js`.
> Przejście na graf węzłów zabrałoby możliwość wyrenderowania i zmierzenia dźwięku poza
> przeglądarką, czyli cały aparat, który pozwolił znaleźć te problemy liczbami. Filtry
> i pogłos są więc napisane jako arytmetyka — to kilkadziesiąt linii i zachowuje czystość.

**Muzyka — w większości ZROBIONE w 0.7.1.** Z pierwotnej listy zamknięte zostały: rozdział
perkusji na stopę, werbel i hi-hat (był jeden timbre na równym rastrze, czyli metronom),
trzeci głos między basem a leadem (`pad`) i proporcje głośności (bas przykrywał melodię).
Sam silnik przeszedł z trzech fal na FM plus syntezę subtraktywną — opis w sekcji
*Muzyka: silnik i architektura*.

Co zostaje:

- **Sekcja B.** Dalej jest jeden 32-bitowy wzór powtarzany identycznie; druga sekcja
  podwoiłaby odczuwalną długość niemal za darmo, bo renderer i tak liczy pętlę raz.
- **Głos lektora** („mission start" i pokrewne). To jedyna pozycja, której **nie da się
  domknąć syntezą** — mowa formantowa brzmi jak robot, a nie jak lektor z automatu.
  Wymaga decyzji, czy wchodzą próbki (base64 w pliku `.js`, ~70 KB), czy robotyczny
  komunikat zostaje świadomym stylem. Patrz `TODO-0.7.1.md`.
- **Nadpróbkowanie stopni nieliniowych.** FM przy dużym indeksie modulacji i nasycenie
  generują składowe powyżej Nyquista, które zawijają się w pasmo. Dziś indeksy są
  na tyle małe, że nie jest to słyszalne — ale przy jaśniejszych barwach będzie,
  i wtedy trzeba liczyć te stopnie w 2× i decymować.
