'use strict';
/* ============================================================
   png.js — enkoder i dekoder PNG dla skryptów w tools/ (czysty Node, zero zależności)

   Enkoder był wcześniej wpisany w tools/gen-sprites.js; wyciągnięty tutaj, bo
   potrzebują go teraz trzy narzędzia (generator sprite'ów, audyt dźwięku, import
   PNG -> siatka znaków). Jedna kopia zamiast trzech — repo i tak ma już dość
   ręcznie synchronizowanych duplikatów (patrz CLAUDE.md).

   To moduł CommonJS, nie plik z src/: skrypty w tools/ są zwykłymi programami
   Node, więc `require` jest tu w porządku. Zasada „bez modułów" dotyczy wyłącznie
   src/*.js, które przeglądarka wczytuje przez <script> z file://.
   ============================================================ */

const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// pixels: Uint8Array RGBA (w*h*4)
function encodePNG(w, h, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filtr: none
    pixels.subarray(y * w * 4, (y + 1) * w * 4)
      .forEach((v, i) => { raw[y * (1 + w * 4) + 1 + i] = v; });
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------- dekoder ---------------------------- */
/* Obsługuje to, co realnie wychodzi z edytorów pixel-artu i z encodePNG powyżej:
   głębia 8 bitów, typy koloru 0/2/3/4/6, wszystkie pięć filtrów, wiele chunków
   IDAT, PLTE + tRNS dla trybu indeksowanego. Przeplot Adam7 i głębie inne niż
   8 bitów są odrzucane z jasnym komunikatem — nie zgadujemy po cichu. */

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}

function unfilter(raw, h, bytesPerRow, bpp) {
  const out = Buffer.alloc(h * bytesPerRow);
  let src = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[src++];
    const row = y * bytesPerRow;
    const prev = row - bytesPerRow;
    for (let i = 0; i < bytesPerRow; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[row + i - bpp] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = (i >= bpp && y > 0) ? out[prev + i - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error('nieznany typ filtra PNG: ' + filter + ' (wiersz ' + y + ')');
      }
      out[row + i] = v & 0xff;
    }
    src += bytesPerRow;
  }
  return out;
}

// zwraca { w, h, px } gdzie px to Uint8Array RGBA (w*h*4)
function decodePNG(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error('to nie jest plik PNG (zła sygnatura)');
  }
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len; // długość + typ + dane + CRC
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('PNG z przeplotem Adam7 nie jest obsługiwany — zapisz bez przeplotu');
      if (bitDepth !== 8) {
        throw new Error('obsługiwana jest tylko głębia 8 bitów (plik ma ' + bitDepth +
          '); w Aseprite: Export As -> PNG, 8 bit');
      }
      if (!CHANNELS[colorType]) throw new Error('nieznany typ koloru PNG: ' + colorType);
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!w || !h) throw new Error('brak chunku IHDR');
  if (!idat.length) throw new Error('brak danych obrazu (IDAT)');

  const ch = CHANNELS[colorType];
  const bytesPerRow = w * ch;
  const rows = unfilter(zlib.inflateSync(Buffer.concat(idat)), h, bytesPerRow, ch);

  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = y * bytesPerRow + x * ch;
      const d = (y * w + x) * 4;
      let r, g, b, a = 255;
      if (colorType === 6) { r = rows[s]; g = rows[s + 1]; b = rows[s + 2]; a = rows[s + 3]; }
      else if (colorType === 2) { r = rows[s]; g = rows[s + 1]; b = rows[s + 2]; }
      else if (colorType === 0) { r = g = b = rows[s]; }
      else if (colorType === 4) { r = g = b = rows[s]; a = rows[s + 1]; }
      else { // 3 — indeksowany
        if (!palette) throw new Error('PNG indeksowany bez chunku PLTE');
        const idx = rows[s];
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
        if (trns && idx < trns.length) a = trns[idx];
      }
      px[d] = r; px[d + 1] = g; px[d + 2] = b; px[d + 3] = a;
    }
  }
  return { w, h, px };
}

module.exports = { encodePNG, decodePNG, crc32, chunk };
