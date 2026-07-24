# Changelog

Znaczące zmiany w Hex General są odnotowywane w tym pliku. Wersjonowanie: SemVer (MAJOR.MINOR.PATCH).

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
