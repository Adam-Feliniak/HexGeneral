'use strict';
/* ============================================================
   RYSOWANIE — canvas, kafle, drogi, granice, miasta, armie, efekty
   ============================================================ */

const canvas = typeof document !== 'undefined' ? document.getElementById('board') : null;
const ctx = canvas ? canvas.getContext('2d') : null;

const BOARD_PX_W = Math.ceil(HEX_W * (MAP_W + 1.2));
const BOARD_PX_H = Math.ceil(1.5 * HEX * (MAP_H - 1) + HEX * 2.5);

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = BOARD_PX_W * dpr;
  canvas.height = BOARD_PX_H * dpr;
  canvas.style.aspectRatio = `${BOARD_PX_W} / ${BOARD_PX_H}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; // pixel-art bez rozmycia
}

function hexPath(cx, cy, scale = 1) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = Math.PI / 180 * (60 * i - 30);
    const x = cx + HEX * scale * Math.cos(ang);
    const y = cy + HEX * scale * Math.sin(ang);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawTile(t) {
  const { x, y } = hexCenter(t.c, t.r);
  // pixel-artowe kafle terenu (3 warianty na typ, wybór deterministyczny per heks)
  const hsh = (t.c * 73 + t.r * 151) % 97;
  const grass = t.shade > 0.15;
  let spr;
  if (!t.land) spr = t.shallow ? SPR.hexShallow : SPR.hexWater[hsh % 3];
  else spr = grass ? SPR.hexGrass[hsh % 3] : SPR.hexSand[hsh % 3];
  if (sprOk(spr)) {
    ctx.drawImage(spr, Math.round(x - 25), Math.round(y - 29), 50, 58);
  } else {
    // zapasowe płaskie wypełnienie, nim wczytają się PNG
    hexPath(x, y);
    ctx.fillStyle = !t.land ? '#2a6aa8' : grass ? '#8f9c4a' : '#c9b06a';
    ctx.fill();
  }
  // barwa właściciela jako półprzezroczysta kalka na teksturze
  if (t.land && t.owner >= 0) {
    const [r, g, b] = parseColor(state.players[t.owner].color);
    hexPath(x, y);
    ctx.fillStyle = `rgba(${r},${g},${b},0.30)`;
    ctx.fill();
  }
  hexPath(x, y);
  ctx.strokeStyle = t.land ? 'rgba(90,70,30,0.35)' : 'rgba(20,40,70,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // piana na linii wybrzeża
  if (t.land && t.coast && t.coast.length) {
    ctx.strokeStyle = 'rgba(244,232,180,0.75)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const d of t.coast) {
      const [x1, y1] = hexCorner(x, y, d);
      const [x2, y2] = hexCorner(x, y, (d + 1) % 6);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
}

function drawDecor(t) {
  if (!t.land || t.city) return;
  const { x, y } = hexCenter(t.c, t.r);
  // złoże rysuje się też pod stojącą armią
  if (t.resource) {
    const spr = SPR.res[t.resource];
    if (sprOk(spr)) ctx.drawImage(spr, Math.round(x - 15), Math.round(y - 16), 30, 28);
    return;
  }
  if (t.army) return;
  const v = (t.c * 5 + t.r * 11) % 2; // wariant dekoracji per heks
  if (t.shade > 0.55 && sprOk(SPR.trees[v])) {
    ctx.drawImage(SPR.trees[v], Math.round(x - 13), Math.round(y - 17), 26, 28);
  } else if (t.shade < -0.65 && sprOk(SPR.rocks[v])) {
    ctx.drawImage(SPR.rocks[v], Math.round(x - 11), Math.round(y - 2), 22, 13);
  }
}

// asfaltowa sieć dróg (patrz roads.js): każdy heks drogi łączymy odcinkiem z
// sąsiednimi heksami drogi tego samego właściciela. Rysujemy warstwami przez całą
// sieć (najpierw ciemny brzeg wszystkich odcinków, potem asfalt, potem oś), żeby
// rozgałęzienia nakładały się gładko bez widocznych szwów na styku odcinków
function drawRoads() {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // zbierz krawędzie sieci: heks drogi ↔ sąsiedni heks drogi (każda para raz) oraz
  // heks drogi → sąsiednie własne miasto (dojście do miasta — miasto nie jest heksem
  // drogi, więc rysujemy je zawsze od strony drogi, bez ryzyka duplikatu)
  const edges = [];
  for (const row of state.tiles) for (const t of row) {
    if (!t.road) continue;
    for (const n of neighborsOf(t)) {
      if (n.road && n.road.owner === t.road.owner) {
        if (n.r < t.r || (n.r === t.r && n.c < t.c)) continue; // każda para raz
        edges.push([hexCenter(t.c, t.r), hexCenter(n.c, n.r)]);
      } else if (n.city && n.owner === t.road.owner) {
        edges.push([hexCenter(t.c, t.r), hexCenter(n.c, n.r)]);
      }
    }
  }
  if (!edges.length) return;
  const strokeAll = (style, width, dash) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    for (const [a, b] of edges) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  strokeAll('#23211a', 8);            // ciemny brzeg nawierzchni
  strokeAll('#45423a', 5);            // asfalt
  strokeAll('#cfc79a', 1.5, [4, 6]);  // przerywana linia środkowa
}

function drawBorders() {
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const row of state.tiles) for (const t of row) {
    if (t.owner < 0 || !t.land) continue;
    const { x, y } = hexCenter(t.c, t.r);
    const dirs = (t.r % 2 === 0) ? DIRS_EVEN : DIRS_ODD;
    for (let d = 0; d < 6; d++) {
      const n = tileAt(t.c + dirs[d][0], t.r + dirs[d][1]);
      if (n && n.land && n.owner === t.owner) continue;
      const [x1, y1] = hexCorner(x, y, d);
      const [x2, y2] = hexCorner(x, y, (d + 1) % 6);
      ctx.strokeStyle = state.players[t.owner].dark;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
}

// zestaw sprite'ów imperium: NIE jest tym samym co id gracza. Zamknięty slot w lobby
// nie tworzy imperium (id są ciągłe), a boss ma własny, siódmy zestaw — patrz state.js
function playerSkin(id) {
  const p = id >= 0 ? state.players[id] : null;
  return p ? p.skin : 0;
}

function drawCity(t) {
  const { x, y } = hexCenter(t.c, t.r);
  const cap = t.city.capitalOf >= 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (cap) {
    // stolica: kwatera główna z flagą w kolorze właściciela (+ żuraw, gdy port)
    const spr = SPR.capitals[playerSkin(t.owner >= 0 ? t.owner : t.city.capitalOf)];
    if (sprOk(spr)) ctx.drawImage(spr, -24, -22, 48, 34);
    if (t.city.port && sprOk(SPR.crane)) ctx.drawImage(SPR.crane, 5, -14, 20, 26);
  } else if (t.city.port) {
    // port: magazyn z żurawiem, keja i kontenery
    if (sprOk(SPR.cityPort)) ctx.drawImage(SPR.cityPort, -23, -26, 46, 38);
  } else {
    // miasto: jeden z 3 wariantów zabudowy
    const spr = SPR.cities[t.city.variant || 0];
    if (sprOk(spr)) ctx.drawImage(spr, -23, -26, 46, 38);
  }
  ctx.restore();
}

// Pozycja rysowania armii: środek heksa albo punkt tweenu, gdy jednostka jest w ruchu.
// Wydzielone, bo sprite i HUD jednostki rysują się w DWÓCH osobnych przebiegach
// (patrz kolejność w draw()) i muszą trafić w to samo miejsce
function armyDrawPos(t) {
  let { x, y } = hexCenter(t.c, t.r);
  const anim = anims.find(a => a.tile === t);
  if (anim) {
    const k = Math.min(1, anim.t / 0.18);
    x = anim.x0 + (anim.x1 - anim.x0) * k;
    y = anim.y0 + (anim.y1 - anim.y0) * k;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

// przygaszenie jednostki, która w tej turze już nic nie zrobi — dotyczy tak samo
// sprite'a, jak i jego HUD-u, więc liczone raz dla obu przebiegów
function armyDimmed(t) {
  return !armyCanMove(t) && t.army.player === state.currentPlayerIndex &&
    state.phase !== 'over' && currentPlayer().isHuman;
}

// pudełko sprite'a — używane przy rysowaniu okrętu i przez ramkę zaznaczenia, która
// idzie już w przebiegu HUD-u; na morzu klasa okrętu wynika z siły, nie z army.type
function armyBox(t, x, y) {
  const army = t.army;
  if (!t.land) {
    const tier = army.str < 20 ? 0 : army.str < 70 ? 1 : 2;
    return tier === 0 ? [x - 18, y - 10, 36, 18]
      : tier === 1 ? [x - 24, y - 13, 48, 24]
      : [x - 25, y - 12, 50, 22];
  }
  if (army.type === 'infantry') return [x - 13, y - 18, 26, 32];
  if (army.type === 'tank') return [x - 25, y - 16, 50, 30];
  return [x - 23, y - 15, 46, 28];
}

function drawArmySprite(t, now) {
  const army = t.army;
  const { x, y } = armyDrawPos(t);
  ctx.save();
  ctx.globalAlpha = armyDimmed(t) ? 0.55 : 1;
  // typ jednostki lądowej wybierany w panelu budowy (army.type);
  // na morzu armia płynie okrętem wg siły: barka / pancernik / lotniskowiec
  if (!t.land) {
    const tier = army.str < 20 ? 0 : army.str < 70 ? 1 : 2;
    const spr = SPR.ships[playerSkin(army.player)][tier];
    const box = armyBox(t, x, y);
    if (sprOk(spr)) ctx.drawImage(spr, box[0], box[1], box[2], box[3]);
  } else if (army.type === 'infantry') {
    const spr = SPR.soldiers[playerSkin(army.player)];
    if (sprOk(spr)) {
      // animacja marszu (4 klatki) tylko dla jednostki aktualnie zaznaczonej przez
      // gracza — reszta piechoty stoi (statyczna klatka 0), żeby plansza się nie "migotała"
      const fr = state.selected === t ? Math.floor(now / 150) % 4 : 0;
      ctx.drawImage(spr, fr * 24, 0, 24, 30, x - 12, y - 17, 24, 30);
    }
  } else if (army.type === 'tank') {
    const spr = SPR.tanks[playerSkin(army.player)];
    if (sprOk(spr)) {
      // Animacja jazdy (4 klatki). W trakcie przejazdu między heksami klatka idzie
      // z POSTĘPU tweenu, nie z zegara — dzięki temu na jeden krok przypada dokładnie
      // jeden pełny obrót gąsienicy, niezależnie od tempa gry. Poza przejazdem
      // animuje się tylko jednostka zaznaczona, tak samo jak marsz piechura: gdyby
      // kręciły się wszystkie, plansza migotałaby od stojących czołgów.
      const anim = anims.find(a => a.tile === t);
      const fr = anim ? Math.floor((anim.t / 0.18) * 4) % 4
        : state.selected === t ? Math.floor(now / 120) % 4 : 0;
      ctx.drawImage(spr, fr * 48, 0, 48, 28, x - 24, y - 15, 48, 28);
    }
  } else { // artillery
    const spr = SPR.artillery[playerSkin(army.player)];
    if (sprOk(spr)) ctx.drawImage(spr, x - 22, y - 14, 44, 26);
  }
  ctx.restore();
}

// HUD jednostki: liczba siły, pasek morale, odznaka weterana i puls zaznaczenia.
// Rysowany PO znacznikach miast/złóż — znacznik ma prawo przykryć sprite (o to w nim
// chodzi), ale nie liczbę siły ani morale, bo to są dane, bez których nie da się grać
function drawArmyHud(t, now) {
  const army = t.army;
  const { x, y } = armyDrawPos(t);
  ctx.save();
  ctx.globalAlpha = armyDimmed(t) ? 0.55 : 1;
  // puls zaznaczenia
  if (state.selected === t) {
    const selBox = armyBox(t, x, y);
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(now / 140)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(selBox[0] - 1, selBox[1] - 1, selBox[2] + 2, selBox[3] + 2);
  }
  // arcade'owa liczba siły (żółta z czarnym konturem)
  ctx.font = 'bold 12px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#16140c';
  ctx.strokeText(army.str, x + 9, y + 19);
  ctx.fillStyle = '#ffd91c';
  ctx.fillText(army.str, x + 9, y + 19);
  // pasek morale (amunicyjny)
  const m = Math.min(110, moraleAt(army.player, t) + army.vet) / 100;
  ctx.fillStyle = '#16140c';
  ctx.fillRect(x - 17, y + 15, 16, 4);
  ctx.fillStyle = m > 0.75 ? '#7be05a' : m > 0.5 ? '#ffd91c' : '#e05a2a';
  ctx.fillRect(x - 16, y + 16, 14 * Math.min(1, m), 2);
  // odznaka weterana: krokiewka co 4 pkt vet (4/8/12), gwiazdka na maksie (15)
  drawVetBadge(ctx, x, y, army.vet);
  ctx.restore();
}

/* Znaczniki miasta i złoża — rysowane PO sprite'ach armii, bo na tym polega cały problem:
   czołg (48×28) jest szerszy niż miasto (46×38) i zjada mu dolną połowę, a heks
   z miastem i jednostką wyglądał dokładnie jak pusty heks z jednostką. Autor tego nie
   widzi, bo pamięta mapę — zgłosiła to dopiero osoba grająca pierwszy raz.

   ...ale PRZED HUD-em jednostki (liczba siły, morale, weteran). Pierwsza wersja szła
   na samym wierzchu i zjadała liczbę siły — dolna krawędź heksa to jedyne miejsce
   czytelne dla znacznika, ale siedzą tam też liczba (x+9, y+19) i pasek morale
   (x-17..x-1, y+15..y+19). Zasłonić sprite wolno, zasłonić danych nie.

   Trzy decyzje, każdą wymusza to, co na heksie już jest:
   - łuk przy KRAWĘDZI, nie ikona w środku: środek należy do sprite'a jednostki,
     a krawędzi nie dosięga bounding box żadnego z nich (także przyszłego);
   - promień 0,88 zamiast 1,0: na samej krawędzi siedzą już obrys heksa, piana
     wybrzeża i granica imperium;
   - rozróżnianie KSZTAŁTEM I POŁOŻENIEM, nie barwą. Prawie każdy odcień jest już
     kolorem któregoś imperium (PLAYERS_DEF), a z rzeczy rysowanych na krawędzi:
     biały pełny obrys to zaznaczenie (0,92), biały przerywany to zasięg ruchu (0,86),
     złoty to wybór celu drogi. Stąd: miasto = łuk u dołu, złoże = łuk u góry,
     stolica = drugi łuk wewnątrz. Linia zawsze ciągła — przerywana czytałaby się
     jako zasięg ruchu; a stolicy NIE wydłużamy obrysu, bo łuk przez 4 krawędzie
     zlałby się z ramką zaznaczenia i hoveru (0,95). */
const MARK_CITY = '#f2ead2';
const MARK_RES = '#cfc79a';
const MARK_CASE = '#16140c';   // czarny kontur jak przy reszcie HUD-u (patrz 07-Grafika)

// łuk po `count` krawędziach heksa, licząc od rogu `from`; hexCorner() ma promień na
// sztywno, więc skalowaną wersję liczymy tutaj
function hexArcPath(cx, cy, from, count, scale) {
  ctx.beginPath();
  for (let k = 0; k <= count; k++) {
    const ang = Math.PI / 180 * (60 * ((from + k) % 6) - 30);
    const x = cx + HEX * scale * Math.cos(ang);
    const y = cy + HEX * scale * Math.sin(ang);
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function strokeMark(cx, cy, from, count, scale, color, width) {
  // stan pędzla ustawiamy jawnie: drawRoads/drawBorders zostawiają po sobie lineCap
  // i lineJoin, a gałęzie podświetleń bywają pominięte, więc dziedziczenie różniłoby
  // się między klatkami
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  hexArcPath(cx, cy, from, count, scale);
  ctx.strokeStyle = MARK_CASE;
  ctx.lineWidth = width + 2;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawTileMarks(t) {
  if (!t.land) return;
  const { x, y } = hexCenter(t.c, t.r);
  if (t.city) {
    strokeMark(x, y, 1, 2, 0.88, MARK_CITY, 3);          // dwie dolne krawędzie
    if (t.city.capitalOf >= 0) strokeMark(x, y, 1, 2, 0.74, MARK_CITY, 2.5);
  } else if (t.resource) {
    // miasto i złoże nie trafiają się na jednym heksie (mapgen sadzi złoża tylko na
    // polach bez miasta i min. 2 heksy od każdego), więc gałęzie mogą się wykluczać
    strokeMark(x, y, 4, 2, 0.88, MARK_RES, 2.5);          // dwie górne krawędzie
  }
}

function drawVetBadge(ctx, x, y, vet) {
  if (vet < 4) return;
  const bx = x - 16, by = y - 20;
  ctx.strokeStyle = '#16140c';
  ctx.fillStyle = '#ffd91c';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (vet >= 15) {
    drawStarPath(ctx, bx, by + 3, 5);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const chevrons = vet >= 12 ? 3 : vet >= 8 ? 2 : 1;
  for (let i = 0; i < chevrons; i++) {
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + i * 5 + 2.5);
    ctx.lineTo(bx, by + i * 5 - 1.5);
    ctx.lineTo(bx + 4, by + i * 5 + 2.5);
    ctx.strokeStyle = '#16140c';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = '#ffd91c';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawStarPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a1 = -Math.PI / 2 + i * (2 * Math.PI / 5);
    const a2 = a1 + Math.PI / 5;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * 0.45 * Math.cos(a2), y2 = cy + r * 0.45 * Math.sin(a2);
    if (i === 0) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.closePath();
}

function draw(now) {
  if (!state || state.screen !== 'game') return;
  const humanTurn = state.phase !== 'over' && currentPlayer().isHuman;
  ctx.fillStyle = '#0f0e08';
  ctx.fillRect(0, 0, BOARD_PX_W, BOARD_PX_H);

  for (const row of state.tiles) for (const t of row) drawTile(t);
  drawRoads();
  drawBorders();

  // podświetlenia
  if (state.selected && humanTurn) {
    const sel = state.selected;
    const { x, y } = hexCenter(sel.c, sel.r);
    hexPath(x, y, 0.92);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    for (const n of validMoves(sel)) {
      const c = hexCenter(n.c, n.r);
      hexPath(c.x, c.y, 0.86);
      const hostile = n.army && n.army.player !== state.currentPlayerIndex;
      ctx.fillStyle = hostile ? 'rgba(255,80,80,0.3)' : 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = hostile ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // wybór celu budowy drogi — podświetlenie legalnych celów w kolorze HUD-u
  // (złoto), żeby odróżnić od białego zasięgu ruchu jednostek
  if (state.roadPickFrom && humanTurn) {
    const from = state.roadPickFrom;
    const fc = hexCenter(from.c, from.r);
    hexPath(fc.x, fc.y, 0.92);
    ctx.strokeStyle = '#ffd91c';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    for (const tgt of roadTargets(from)) {
      const c = hexCenter(tgt.c, tgt.r);
      hexPath(c.x, c.y, 0.86);
      ctx.fillStyle = 'rgba(255,217,28,0.25)';
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,217,28,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (hoverTile && humanTurn) {
    const { x, y } = hexCenter(hoverTile.c, hoverTile.r);
    hexPath(x, y, 0.95);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (const row of state.tiles) for (const t of row) {
    if (t.city) drawCity(t); else drawDecor(t);
  }
  // trzy przebiegi zamiast jednego: sprite'y jednostek, na nich znaczniki miast i złóż
  // (inaczej nie rozwiązywałyby problemu, dla którego powstały), a na samej górze HUD
  // jednostek — liczby siły i morale muszą zostać czytelne (patrz drawTileMarks)
  for (const row of state.tiles) for (const t of row) if (t.army) drawArmySprite(t, now);
  for (const row of state.tiles) for (const t of row) drawTileMarks(t);
  for (const row of state.tiles) for (const t of row) if (t.army) drawArmyHud(t, now);

  // eksplozje (sprite-sheet 6 klatek)
  if (sprOk(SPR.explosion)) {
    for (const e of effects) {
      const fi = Math.min(5, Math.floor(e.t / 0.08));
      ctx.drawImage(SPR.explosion, fi * 48, 0, 48, 48,
        Math.round(e.x - 28), Math.round(e.y - 34), 56, 56);
    }
  }

  // floatery — arcade'owe napisy strat
  ctx.font = 'bold 15px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    ctx.strokeStyle = '#16140c';
    ctx.strokeText(f.text, f.x, f.y - 14 - f.t * 26);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 14 - f.t * 26);
  }
  ctx.globalAlpha = 1;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  for (const a of anims) a.t += dt;
  anims = anims.filter(a => a.t < 0.18);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1.2);
  for (const e of effects) e.t += dt;
  effects = effects.filter(e => e.t < 0.48);
  checkTurnTimer(now);
  updateTimerDisplay(now);
  draw(now);
  requestAnimationFrame(frame);
}
