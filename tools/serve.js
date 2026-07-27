'use strict';
/* ============================================================
   serve.js — statyczny serwer deweloperski (czysty Node http, zero zależności)

   Po co: gra działa z file://, ale narzędzie regresji wizualnej
   (visual-test.html) musi czytać piksele canvasa przez getImageData — a na
   file:// canvas jest "skażony" (tainted) przez sprite'y ładowane z dysku
   i przeglądarka blokuje odczyt. Serwowanie przez http://localhost znosi to
   ograniczenie (same-origin).

   Sama gra NIE wymaga serwera — to tylko wygoda dla narzędzi deweloperskich.

   Użycie:
     node tools/serve.js            # http://localhost:8080
     node tools/serve.js --port=9000
   Potem otwórz np. http://localhost:8080/visual-test.html
   albo http://localhost:8080/index.html
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.slice(7), 10) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // tylko ścieżka, bez query; dekodowanie %20 itp.
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // twarda ochrona przed wyjściem poza ROOT (path traversal)
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end('403 Forbidden'); return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // narzędzia deweloperskie mają zawsze widzieć świeże pliki
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('Serwer deweloperski Hex General:');
  console.log('  http://localhost:' + PORT + '/index.html        (gra)');
  console.log('  http://localhost:' + PORT + '/visual-test.html  (regresja wizualna)');
  console.log('Ctrl+C aby zatrzymać.');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('Port ' + PORT + ' zajęty — użyj --port=<inny>.');
  else console.error('Błąd serwera: ' + e.message);
  process.exit(1);
});
