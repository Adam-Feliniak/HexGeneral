# Changelog

Znaczące zmiany w Hex General są odnotowywane w tym pliku. Wersjonowanie: SemVer (MAJOR.MINOR.PATCH).

## [0.5.0] - 2026-07-28

- **Punkty ruchu zamiast bonusu drogowego.** Każda jednostka ma własną pulę punktów
  ruchu i płaci za **wejście na pole**: 1 na własnej drodze, 2 poza nią. Dzięki temu
  droga premiuje jazdę wzdłuż sieci, a nie samo stanie na niej — czołg przejedzie
  drogą 4 pola, ale zjeżdżając z niej w czyste pole tylko 2. Poprzedni model doliczał
  bonus na podstawie pola, na którym jednostka stała, więc dawał dodatkowy zasięg
  w każdym kierunku (aura zamiast korytarza)
- **Prędkość jednostek wreszcie się różni**: piechota 2 pkt ruchu, czołg 4, artyleria 2
  (wcześniej wszystkie miały zasięg bazowy 1 i różniły się tylko bonusem drogowym).
  Artyleria korzysta teraz z dróg jak pozostałe jednostki — zniżka jest jednolita
- **Wspólna pula tury to teraz 5 rozkazów, nie 5 heksów.** Rozkaz liczy się raz na
  jednostkę: kolejne ruchy tej samej armii w tej turze są darmowe, dopóki ma punkty
  ruchu. Zachowuje napięcie „które 5 jednostek jest teraz ważne", ale pozwala rozłożyć
  marsz na kroki. Panel boczny pokazuje „Rozkazy: n/5", a tooltip własnej jednostki
  jej punkty ruchu
- **Desant i załadunek na statek zużywają wszystkie punkty ruchu** (wystarczy 1 punkt,
  by przejście wykonać). Taki krok kończy ruch, więc w jednej turze nie da się wsiąść
  na statek i odpłynąć ani wylądować i wjechać w głąb lądu — desant zdobywa przyczółek,
  obrońca ma turę na reakcję. Załadunek nadal tylko z portu, desant nadal na dowolny brzeg
- **Na morzu każda jednostka płynie 3 pola** niezależnie od typu lądowego (spójnie
  z renderem, gdzie klasa okrętu zależy od siły armii, nie od typu)
- Balans po zmianie (seria 300 gier `normal` vs `normal`): remisy **7% → 2,7%**,
  mediana długości partii ~122 → ~109 rund, balans stron 50,7/49,3 (szum).
  Szybsze czołgi i korytarze dróg domykają partie lepiej, nie gorzej
- Zasięg ruchu liczony jest teraz algorytmem Dijkstry (koszty pól są różne, więc
  liczenie samych kroków dawałoby złe wyniki). Podświetlenie zasięgu na planszy
  odzwierciedla to wprost: wydłuża się wzdłuż drogi i skraca nad wodą, gdzie
  zaokrętowanie kończy ruch
- **`SAVE_FORMAT` 2 — zapisy z wcześniejszych wersji są niezgodne** i dostają czytelny
  komunikat zamiast błędu (świadomie bez migracji przed 1.0)

## [0.4.2] - 2026-07-28

- Tura nie oddaje się już sama po wyczerpaniu puli ruchów — kończy ją wyłącznie
  gracz (przycisk „Zakończ turę" albo Enter). Po ostatnim ruchu zostaje okno na
  decyzje niezależne od ruchów: wybór produkcji miasta, rozpoczęcie budowy drogi,
  przypisanie złoża i samo obejrzenie planszy. W trybie multi limit czasu na turę
  działa bez zmian
- Przycisk „Zakończ turę" miga (pomarańczowy ↔ żółty, przejście co sekundę), gdy
  ruchami nie da się już nic zrobić: pula ruchów wyczerpana **albo** wszystkie
  jednostki już się w tej turze poruszyły, choć ruchy zostały. Podpowiedź, że tura
  czeka na gracza; przy włączonym systemowym ograniczeniu animacji przycisk zostaje
  żółty bez migania

## [0.4.1] - 2026-07-27

- Znacznik buildu `BUILD_TAG` (`src/config.js`): widoczny w stopce menu obok wersji
  i zapisywany w kopercie zapisu, więc z nadesłanego zapisu widać, z której kopii
  pochodzi. Pusty w repo = build deweloperski; format zapisu bez zmian (pole koperty,
  nie stan gry — stare zapisy wczytują się dalej)
- Narzędzie deweloperskie `tools/pack-build.js`: pakuje build testerski do `dist/<tag>/`
  na podstawie allowlisty (88 plików / ~196 KB — sama gra), bez `.git`, `Documents/`
  i `tools/`. Lista `src/*.js` brana z `<script src=...>` w `index.html`, żeby nie
  rozjechała się z kolejnością wczytywania
- Dokumentacja: nowy `Documents/13-Testy-zewnetrzne.md` (fale dystrybucji buildów,
  zbieranie zapisów jako raportów błędów, higiena dostępu) oraz odświeżony
  `11-Early-Access.md` — sprawdzona kolizja palety czerwony/zielony pod deuteranopię
  i zdegradowana pozycja „wydajność" po v0.2.1

## [0.4.0] - 2026-07-27

- Tryb obserwatora: w lobby single-player przełącznik „Gram / Oglądam" —
  „Oglądam" uruchamia partię samych botów, którą się podgląda
- Regulacja tempa AI (1× / 4× / 16×) w panelu bocznym gry — przyspiesza ruchy
  botów; przydatne przy obserwacji i przy grze z wieloma botami
- Narzędzia deweloperskie (nie wpływają na grę): `tools/serve.js` (statyczny
  serwer, żeby narzędzia mogły czytać piksele canvasa) i `visual-test.html`
  (regresja wizualna — renderuje wiele partii, hashuje klatki renderu i
  porównuje z zapisanym wzorcem, pokazując miniatury plansz)

## [0.3.1] - 2026-07-27

- Przebieg stabilnościowy: nowy harness `tools/stress.js` (fuzz losowych legalnych
  akcji przez prawdziwe ścieżki gry — kliknięcia, pętla tur, zapis w środku partii,
  timer multi — z inwariantami stanu; tryb soak dla sesji wielu partii). 500 partii
  fuzz + soak bez wyjątków i naruszeń
- Utwardzenie importu zapisu: odrzucanie spreparowanych zapisów z mniej niż
  2 graczami (taka partia nigdy nie mogłaby się skończyć)
- Protokół smoke przed wydaniem w przewodniku developera

## [0.3.0] - 2026-07-27

- Zapis i wczytywanie gry: autozapis (początek tury gracza + wyjście do menu),
  przycisk „Kontynuuj" w menu głównym wracający do przerwanej partii
- Nowy ekran „Zapis gry": skopiowanie zapisu jako tekst (Ctrl+C) i wczytanie
  wklejonego zapisu (Ctrl+V) — zapis można przenieść na inny komputer lub
  dołączyć do zgłoszenia błędu
- Zakończona partia usuwa autozapis; zapis z niezgodnej wersji gry dostaje
  czytelny komunikat zamiast błędu
- Format zapisu z polem `SAVE_FORMAT` — fundament pod przyszłe undo,
  scenariusze i cloud save

## [0.2.3] - 2026-07-27

- AI zbiera niczyje miasta (obserwacja z rozgrywek: bot zostawiał 3-4 wolne
  miasta na mapie przez całą grę): wartość niczyjego miasta w wycenie celów
  14 -> 23 oraz podział ról wg siły — małe armie (< 25 str) nie są kanalizowane
  na front, tylko zbierają wolne miasta i złoża (efekt: ~0,1 wolnego miasta
  na mapie już przed rundą 60)
- Efekt uboczny okazał się większy niż cel: pełna ekspansja szybciej buduje
  przewagę i napędza domykanie gier — remisy w serii referencyjnej spadły
  z 24,7% do ~7%, mediana długości partii z ~274 do ~122 rund (ablacja:
  obie zmiany konieczne, sama waga bez podziału ról daje 26,7% remisów)
- Drabinka trudności i balans stron bez zmian (mirror: nightmare ~91%
  rozstrzygniętych; 2p: 52/48)

## [0.2.2] - 2026-07-27

- AI domyka wygrane pozycje: remisy w referencyjnej serii 300 gier AI-vs-AI spadły
  z 40,0% do 24,7%, a mediana długości partii z ~348 do ~274 rund
- Nowe mechanizmy AI (tylko dla strony z przewagą materialną — słabszy gra jak
  dotąd): eskalacja progów ataku z czasem partii, koncentracja sił na najsłabszej
  stolicy wroga (z omijaniem barier wodnych), szturm falowy ze strefą zborną
  zamiast pojedynczo dowożonych armii, premia za bicie obrońców blokujących
  dojście do oblężonej stolicy
- Artyleria preferencyjnie obsadza pierścień oblężniczy (wsparcie), czołgi
  zostają do szturmu — pierwsze użycie cech typów jednostek w taktyce ruchu
- Drabinka trudności i balans stron bez zmian (zweryfikowane testem mirror)
- Bonusy obronne miast celowo nietknięte — obrona pozostaje silna, zmieniło się
  tylko zachowanie atakującego AI

## [0.2.1] - 2026-07-26

- Przyspiesza AI ~2,2× bez żadnej zmiany jego decyzji (zweryfikowane bitową
  zgodnością wyników 540 gier symulacyjnych przed/po): cache miast dla morale
  na czas oceny ruchów, siła bojowa liczona tylko dla kandydatów ataku,
  dystanse do celów liczone raz na armię, trasy ruchu bez kopiowania ścieżek
- Szybsze AI = płynniejsza rozgrywka przy wielu armiach i ponad dwukrotnie
  szybsze przebiegi balansowe `tools/sim.js`

## [0.2.0] - 2026-07-24

- Punkty produkcji miast: produkcja idzie w jednostki albo w budowę infrastruktury
- Drogi budowane świadomie przez gracza i AI (zamiast automatycznych) — panel "Zbuduj drogę", koszt w punktach produkcji, budowa przyrostowa (droga wyrasta z miasta)
- Drogi tworzą **sieć** ze wspólnymi heksami: kolejna droga do tego samego celu dobudowuje tylko brakujący odcinek i rozgałęzia się (kształt Y)
- Złoże połączone z siecią daje +1 do jednego miasta, wybieranego przez gracza (panel przy złożu; domyślnie najbliższe)
- Podświetlanie legalnych celów budowy drogi na mapie
- Koszt drogi: 3 punkty za każdy nowy heks trasy

## [0.1.1] - 2026-07-24

- Tłumaczy poziomy trudności AI (Łatwy/Normalny/Trudny/Koszmar/Własny) na PL/EN/DE — wcześniej były zahardkodowane po angielsku
- Naprawia niedobudowany `src/locales-data.js` (zmiana "Start grę" → "Start gry" w `pl.json` nie została wcześniej wygenerowana)
- Dokumentuje w README zasadę uruchamiania `build-locales.js` po edycji `locales/*.json`

## [0.1.0] - 2026-07-24

Punkt startowy wersjonowania — stan gry w momencie wprowadzenia numeracji:
- Proceduralna mapa heksagonalna, tryby single / multi (hot-seat), AI z 4 poziomami trudności + suwak custom
- 3 typy jednostek (piechota / czołg / artyleria), walka z systemem morale i wsparcia
- Gospodarka: złoża, drogi, produkcja w miastach i stolicach
- Samouczek, i18n (PL/EN/DE)
