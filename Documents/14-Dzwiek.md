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
| Primitywy DSP | `src/audio.js` | oscylator (kwadrat/piła/trójkąt/sinus), szum z filtrem dolnoprzepustowym, obwiednie, normalizacja z wygaszeniem ogona |
| Przepisy dźwięków | `SFX_RECIPES` w `src/audio.js` | jedna czysta funkcja `(rate) => Float32Array` na dźwięk |
| Partytury muzyki | `MUSIC_TRACKS` w `src/audio.js` | tabela nut `[ćwierćnuta, długość, MIDI, instrument]` |
| Odtwarzanie | `src/audio.js` | `AudioBuffer` dla SFX, oscylatory dla muzyki, throttling, głośności |
| Podsłuch / strojenie | `tools/gen-sounds.js` | renderuje przepisy do WAV-ów w `dist/sfx/` — **gra ich nie wczytuje** |

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

Dźwięk startu tury (to rytm całej gry — pierwszy kandydat), osobne brzmienia per typ
jednostki, zaokrętowanie i desant, ukończenie drogi, produkcja jednostki, ostrzeżenie
timera tury w multi. Wszystkie sprowadzają się do dopisania przepisu i jednego wywołania.
