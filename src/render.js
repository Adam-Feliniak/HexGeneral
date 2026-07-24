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

// asfaltowe drogi zbudowane przez gracza/AI (złoże->miasto albo miasto->miasto,
// patrz roads.js); tu tylko odczytujemy gotową trasę i rysujemy — bez ponownego
// liczenia BFS. Przerwane drogi (wróg na trasie) rysują się przygaszone.
function drawRoadPath(path, active) {
  const pts = path.map(t => hexCenter(t.c, t.r));
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  };
  if (active) {
    ctx.strokeStyle = '#23211a';   // ciemny brzeg nawierzchni
    ctx.lineWidth = 8;
    trace(); ctx.stroke();
    ctx.strokeStyle = '#45423a';   // asfalt
    ctx.lineWidth = 5;
    trace(); ctx.stroke();
    ctx.strokeStyle = '#cfc79a';   // przerywana linia środkowa
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    trace(); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // droga przerwana przez wroga — widoczna, ale wygaszona i kreskowana na czerwono
    ctx.strokeStyle = 'rgba(80,20,20,0.5)';
    ctx.lineWidth = 4;
    ctx.setLineDash([3, 5]);
    trace(); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawRoads() {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const row of state.tiles) for (const t of row) {
    if (!t.road) continue;
    drawRoadPath(t.road.path, isRoadActive(t));
  }
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

function drawCity(t) {
  const { x, y } = hexCenter(t.c, t.r);
  const cap = t.city.capitalOf >= 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (cap) {
    // stolica: kwatera główna z flagą w kolorze właściciela (+ żuraw, gdy port)
    const spr = SPR.capitals[t.owner >= 0 ? t.owner : t.city.capitalOf];
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

function drawArmy(t, now) {
  const army = t.army;
  let { x, y } = hexCenter(t.c, t.r);
  const anim = anims.find(a => a.tile === t);
  if (anim) {
    const k = Math.min(1, anim.t / 0.18);
    x = anim.x0 + (anim.x1 - anim.x0) * k;
    y = anim.y0 + (anim.y1 - anim.y0) * k;
  }
  const dim = army.movesUsed >= moveCap(t) && army.player === state.currentPlayerIndex &&
    state.phase !== 'over' && currentPlayer().isHuman;
  ctx.save();
  ctx.globalAlpha = dim ? 0.55 : 1;
  x = Math.round(x); y = Math.round(y);
  // typ jednostki lądowej wybierany w panelu budowy (army.type);
  // na morzu armia płynie okrętem wg siły: barka / pancernik / lotniskowiec
  let selBox;
  if (!t.land) {
    const tier = army.str < 20 ? 0 : army.str < 70 ? 1 : 2;
    const spr = SPR.ships[army.player][tier];
    selBox = tier === 0 ? [x - 18, y - 10, 36, 18]
      : tier === 1 ? [x - 24, y - 13, 48, 24]
      : [x - 25, y - 12, 50, 22];
    if (sprOk(spr)) ctx.drawImage(spr, selBox[0], selBox[1], selBox[2], selBox[3]);
  } else if (army.type === 'infantry') {
    const spr = SPR.soldiers[army.player];
    if (sprOk(spr)) {
      // animacja marszu (4 klatki) tylko dla jednostki aktualnie zaznaczonej przez
      // gracza — reszta piechoty stoi (statyczna klatka 0), żeby plansza się nie "migotała"
      const fr = state.selected === t ? Math.floor(now / 150) % 4 : 0;
      ctx.drawImage(spr, fr * 24, 0, 24, 30, x - 12, y - 17, 24, 30);
    }
    selBox = [x - 13, y - 18, 26, 32];
  } else if (army.type === 'tank') {
    const spr = SPR.tanks[army.player];
    if (sprOk(spr)) ctx.drawImage(spr, x - 24, y - 15, 48, 28);
    selBox = [x - 25, y - 16, 50, 30];
  } else { // artillery
    const spr = SPR.artillery[army.player];
    if (sprOk(spr)) ctx.drawImage(spr, x - 22, y - 14, 44, 26);
    selBox = [x - 23, y - 15, 46, 28];
  }
  // puls zaznaczenia
  if (state.selected === t) {
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
  for (const row of state.tiles) for (const t of row) if (t.army) drawArmy(t, now);

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
