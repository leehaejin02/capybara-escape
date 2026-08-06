/**
 * tiles.mjs — tile_floor(4변형) / tile_wall / tile_bush / tile_spa. ART.md §3.4.
 * 전부 seamless(이음매 없음) 규칙을 지키기 위해 직접 픽셀을 찍는다 — mask-sprite의
 * 자동 외곽선 파이프라인은 캐릭터 실루엣용이라 타일에는 쓰지 않는다.
 */

import { createCanvas, FRAME_SIZE } from './canvas.mjs';
import { rgba as paletteRgba } from './palette.mjs';

function fill(buf, color) {
  const [r, g, b, a] = paletteRgba(color);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
}

function px(buf, x, y, color) {
  const i = (y * FRAME_SIZE + x) * 4;
  const [r, g, b, a] = paletteRgba(color);
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function pxRect(buf, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(buf, x, y, color);
}

// ---- tile_floor: 4변형 ----
const FLOOR_VARIANT_SPOTS = [
  [[7, 11], [19, 6], [25, 22], [12, 26], 'rect:15,17,16,18'],
  [[5, 20], [22, 9], [11, 4], [27, 27], 'rect:18,14,19,15'],
  [[9, 25], [16, 8], [28, 15], [4, 12], 'rect:23,20,24,21'],
  [[14, 5], [26, 11], [6, 27], [20, 24], 'rect:9,16,10,17'],
];

export function buildFloorVariant(variant) {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, 'tile_floor');
  for (const spot of FLOOR_VARIANT_SPOTS[variant]) {
    if (typeof spot === 'string') {
      const [x0, y0, x1, y1] = spot.replace('rect:', '').split(',').map(Number);
      pxRect(buf, x0, y0, x1, y1, 'tile_floor_shade');
    } else {
      const [x, y] = spot;
      px(buf, x, y, 'tile_floor_shade');
    }
  }
  return buf;
}

// ---- tile_wall: 러닝본드 벽돌 ----
export function buildWall() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, 'tile_wall');

  // 가로 줄눈
  pxRect(buf, 0, 10, 31, 10, 'ink');
  pxRect(buf, 0, 21, 31, 21, 'ink');

  // 세로 줄눈 (밴드별)
  for (const x of [15, 31]) pxRect(buf, x, 0, x, 9, 'ink'); // 밴드 A
  for (const x of [7, 23]) pxRect(buf, x, 11, x, 20, 'ink'); // 밴드 B
  for (const x of [15, 31]) pxRect(buf, x, 22, x, 31, 'ink'); // 밴드 C

  // 상단 하이라이트
  pxRect(buf, 0, 0, 31, 0, 'tile_floor_shade');

  return buf;
}

// ---- tile_bush ----
const BUSH_BLOBS = [
  { cx: 6, cy: 7, r: 3 },
  { cx: 20, cy: 5, r: 2 },
  { cx: 26, cy: 19, r: 3 },
  { cx: 11, cy: 24, r: 2 },
  { cx: 31, cy: 30, r: 3 },
];

function wrapDist(a, b, size) {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
}

export function buildBush() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, 'tile_bush_dark');

  for (const { cx, cy, r } of BUSH_BLOBS) {
    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const dx = wrapDist(x, cx, FRAME_SIZE);
        const dy = wrapDist(y, cy, FRAME_SIZE);
        if (Math.max(dx, dy) <= r) px(buf, x, y, 'tile_bush_mid');
      }
    }
  }
  // 잎마다 하단 1px 줄은 dark로 되돌린다 (덩어리 구분)
  for (const { cx, cy, r } of BUSH_BLOBS) {
    const rowY = (cy + r + FRAME_SIZE) % FRAME_SIZE;
    for (let dx = -r; dx <= r; dx++) {
      const x = ((cx + dx) % FRAME_SIZE + FRAME_SIZE) % FRAME_SIZE;
      px(buf, x, rowY, 'tile_bush_dark');
    }
  }
  return buf;
}

// ---- tile_spa ----
export function buildSpa() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, 'tile_spa');
  for (let x = 0; x < FRAME_SIZE; x++) {
    if (x % 8 < 4) px(buf, x, 8, 'capy_white');
    if (x % 8 >= 4) px(buf, x, 17, 'capy_white');
    if (x % 6 < 3) px(buf, x, 26, 'capy_white');
  }
  return buf;
}
