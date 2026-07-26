# Changelog

Znaczące zmiany w Hex General są odnotowywane w tym pliku. Wersjonowanie: SemVer (MAJOR.MINOR.PATCH).

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
