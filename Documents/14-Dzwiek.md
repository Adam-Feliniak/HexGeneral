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
| Primitywy DSP | `src/audio.js` | oscylator (kwadrat/piła/trójkąt/sinus), szum z filtrem dolnoprzepustowym, obwiednie, ustawienie poziomu na RMS z sufitem szczytu i wygaszeniem ogona |
| Przepisy dźwięków | `SFX_RECIPES` w `src/audio.js` | jedna czysta funkcja `(rate) => Float32Array` na dźwięk |
| Partytury muzyki | `MUSIC_TRACKS` w `src/audio.js` | tabela nut `[ćwierćnuta, długość, MIDI, instrument]` |
| Odtwarzanie | `src/audio.js` | `AudioBuffer` dla SFX, oscylatory dla muzyki, throttling, głośności |
| Podsłuch / strojenie | `tools/gen-sounds.js` | renderuje przepisy do WAV-ów w `dist/sfx/` — **gra ich nie wczytuje** |
| Pomiar / audyt | `tools/audit-sounds.js` | szczyt, RMS, crest, atak, centroida widmowa + przebiegi PNG w `dist/audit/`; `--save=`/`--diff=` porównuje stan przed i po zmianie |

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
nie zmieści się w zakresie przy dopasowaniu RMS — `explosion` ma crest ~18 dB, więc to
szczyt, a nie wzmocnienie, ogranicza jego głośność (audyt pokazuje wtedy szczyt 0,98).
Wniosek na przyszłość: **eksplozji nie da się podgłośnić gainem** — trzeba zmniejszyć
crest factor, czyli dodać saturację. To pierwsza pozycja iteracji 2, nie polerka.

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

## Inwentarz dźwięków

| Dźwięk | Kiedy | Gdzie wpięty |
|---|---|---|
| `click` | każde kliknięcie przycisku | listener delegowany w `initAudio()` |
| `move` | ruch armii bez bitwy | `executeMove` (`combat.js`) |
| `shot` + `explosion` | bitwa | `resolveBattle` (`combat.js`) |
| `city` | zdobycie lub zajęcie miasta | `captureTile` (`empire.js`) |
| `annex` | aneksja imperium | `conquerEmpire` (`empire.js`) |
| `victory` / `defeat` | ekran końcowy | `checkGameOver` (`empire.js`) |
| muzyka `menu` / `game` | zmiana ekranu | `updateMusicForScreen()` z `applyScreen()` |

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

**Jakość brzmienia — pozycje wskazane przez pomiar, nie przez wrażenie.** Odczyty
z `tools/audit-sounds.js`, każda z konkretną liczbą:

- **Filtr jest za łagodny — stąd syk zamiast dudnienia.** `addNoise()` używa filtru
  jednobiegunowego (6 dB/okt), więc szum zostaje jasny mimo przemiatania w dół.
  Centroida widmowa `explosion` to **5150 Hz**, a `move` (rumor silnika) **3886 Hz** —
  obie o rząd za wysoko jak na dźwięki, które mają „buchać". Kaskada dwóch biegunów
  albo filtr rezonansowy to kilka linii w jednym primitywie.
- **Saturacja dla eksplozji.** Jak wyżej: przy creście ~18 dB głośność jest ograniczona
  szczytem, więc gain nic nie da.
- **Pogłos.** Wszystko jest całkowicie suche. **Uwaga: nie trzeba go pisać ręcznie** —
  Web Audio ma natywnie `ConvolverNode`, `BiquadFilterNode` i `DynamicsCompressorNode`,
  a impuls do pogłosu da się zsyntetyzować (szum z wykładniczym zanikiem). Zero plików,
  zero problemu licencyjnego, działa na `file://`.
- **Ogon `explosion` jest pusty.** Bufor ma 0,7 s, a sygnał wygasa praktycznie po ~0,45 s
  (widać na `dist/audit/explosion.png`).

**Muzyka.** `perc` to jeden timbre na równym rastrze co pół taktu — czyli metronom, nie
rytm (brak rozdziału stopa/werbel/hat). Między basem a leadem nie ma trzeciego głosu,
a `bass` ma gain 0,5 przy `lead` 0,16, więc bas przykrywa melodię. Jeden 32-beatowy wzór
powtarzany identycznie — sekcja B podwoiłaby odczuwalną długość niemal za darmo.
