'use strict';
/* Łączy /locales/*.json w src/locales-data.js (stała I18N_DATA).
   Gra otwiera się bezpośrednio z file:// (bez serwera/builda) — fetch() plików
   JSON jest tam blokowany przez przeglądarki, więc dane językowe są zamiast
   tego wkompilowane w zwykły <script>, tak jak reszta src/*.js.
   Uruchomienie po każdej zmianie /locales/*.json: node tools/build-locales.js */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const OUT_FILE = path.join(__dirname, '..', 'src', 'locales-data.js');
const LANGS = ['pl', 'en', 'de'];

const data = {};
for (const lang of LANGS) {
  const file = path.join(LOCALES_DIR, `${lang}.json`);
  data[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
}

const out = `'use strict';
/* ============================================================
   DANE JĘZYKOWE — wygenerowane z /locales/*.json, NIE edytować ręcznie
   Źródło: locales/pl.json, locales/en.json, locales/de.json
   Regeneracja: node tools/build-locales.js
   ============================================================ */

const I18N_DATA = ${JSON.stringify(data, null, 2)};
`;

fs.writeFileSync(OUT_FILE, out);
console.log(`src/locales-data.js (${LANGS.map(l => `${l}: ${Object.keys(data[l]).length} kluczy`).join(', ')})`);
