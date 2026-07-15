'use strict';
/* ============================================================
   GEOMETRIA HEKSÓW — siatka odd-r, pointy-top
   ============================================================ */

// kierunki: E, SE, SW, W, NW, NE (kolejność zgodna z krawędziami rogów)
const DIRS_EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const DIRS_ODD  = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];

function inBounds(c, r) { return c >= 0 && c < MAP_W && r >= 0 && r < MAP_H; }

function neighborCoords(c, r) {
  const dirs = (r % 2 === 0) ? DIRS_EVEN : DIRS_ODD;
  const out = [];
  for (const [dc, dr] of dirs) out.push([c + dc, r + dr]);
  return out;
}

function hexDist(c1, r1, c2, r2) {
  // offset odd-r -> cube
  const q1 = c1 - ((r1 - (r1 & 1)) >> 1), q2 = c2 - ((r2 - (r2 & 1)) >> 1);
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function hexCenter(c, r) {
  return {
    x: HEX_W * (c + 0.5 * (r & 1)) + HEX_W * 0.6,
    y: 1.5 * HEX * r + HEX * 1.2,
  };
}

function hexCorner(cx, cy, i) {
  const ang = Math.PI / 180 * (60 * i - 30);
  return [cx + HEX * Math.cos(ang), cy + HEX * Math.sin(ang)];
}
