/**
 * tiles.mjs — tile_floor(4변형) / tile_wall / tile_bush / tile_spa. ART.md §3.4.
 * 전부 seamless(이음매 없음) 규칙을 지키기 위해 직접 픽셀을 찍는다 — mask-sprite의
 * 자동 외곽선 파이프라인은 캐릭터 실루엣용이라 타일에는 쓰지 않는다.
 *
 * 2026-08-07 tech: 맵 비주얼 개선(사용자 직접 요청). 팔레트 16색은 그대로 두고
 * (1) tile_floor 4변형에 저밀도 스티플 노이즈를 추가해 "벽지" 반복감을 줄이고,
 * (2) tile_wall에 벽돌 켜(course) 사이 하이라이트 줄을 추가해 바닥과의 재질 대비를 키우고,
 * (3) tile_bush 블롭을 정사각형(Chebyshev)에서 원형(유클리드 근사)으로 바꿔 덜 각지게 했다.
 * 색 배정(어느 팔레트 색이 배경/강조인지)은 ART.md §1.1 원본 그대로다 — 새 색은 만들지 않았다.
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

/**
 * 가장자리에서 최소 EDGE_MARGIN px 이상 떨어진 픽셀만 칠한다 (ART.md §3.4 seamless 규칙:
 * "타일 가장자리에 그 타일에서만 나타나는 무늬를 그리지 않는다"). 좌표 계산을 어디서
 * 하든 이 가드를 거치면 실수로 가장자리를 침범할 수 없다.
 */
const EDGE_MARGIN = 3;
function pxInset(buf, x, y, color) {
  if (x < EDGE_MARGIN || x > FRAME_SIZE - 1 - EDGE_MARGIN) return;
  if (y < EDGE_MARGIN || y > FRAME_SIZE - 1 - EDGE_MARGIN) return;
  px(buf, x, y, color);
}

/** 결정적 정수 해시 (시드 기반). Math.random 대신 — 재생성해도 항상 같은 결과가 나와야 한다. */
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2654435761) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

// ---- tile_floor: 4변형 ----
// 변형마다 작은 "조약돌" 덩어리(십자 모양, ART.md 원안의 단일 점을 확장) 5개 +
// 저밀도 스티플 노이즈(해시 기반, 격자처럼 보이지 않도록 비주기적)로 반복감을 줄인다.
// 전부 tile_floor_shade 한 톤만 쓴다 — §2.6 "가독성이 장식보다 우선"(캐릭터가 바닥보다
// 눈에 띄어야 한다) 때문에 floor는 여전히 2색(tile_floor + tile_floor_shade)으로 제한한다.
const FLOOR_VARIANT_PEBBLES = [
  [[7, 11], [19, 6], [25, 22], [12, 26], [16, 17]],
  [[5, 20], [22, 9], [11, 4], [27, 27], [18, 14]],
  [[9, 25], [16, 8], [28, 15], [4, 12], [23, 20]],
  [[14, 5], [26, 11], [6, 27], [20, 24], [9, 16]],
];
const FLOOR_STIPPLE_MODULO = 41; // ~1/41 ≈ 2.4% 밀도 — 은은하게, 캐릭터를 가리지 않을 정도

export function buildFloorVariant(variant) {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, 'tile_floor');

  // 조약돌(십자 5px) — 원안의 단일 점을 살짝 키워 눈에 띄는 얼룩으로
  for (const [cx, cy] of FLOOR_VARIANT_PEBBLES[variant]) {
    pxInset(buf, cx, cy, 'tile_floor_shade');
    pxInset(buf, cx - 1, cy, 'tile_floor_shade');
    pxInset(buf, cx + 1, cy, 'tile_floor_shade');
    pxInset(buf, cx, cy - 1, 'tile_floor_shade');
    pxInset(buf, cx, cy + 1, 'tile_floor_shade');
  }

  // 스티플 노이즈 — 해시 기반이라 32px 격자와 위상이 어긋나고, variant마다 다른 시드를 써서
  // 이웃한 서로 다른 variant끼리도 무늬가 겹쳐 보이지 않는다.
  for (let y = EDGE_MARGIN; y <= FRAME_SIZE - 1 - EDGE_MARGIN; y++) {
    for (let x = EDGE_MARGIN; x <= FRAME_SIZE - 1 - EDGE_MARGIN; x++) {
      if (hash2(x, y, variant) % FLOOR_STIPPLE_MODULO === 0) px(buf, x, y, 'tile_floor_shade');
    }
  }

  return buf;
}

// ---- tile_wall: 러닝본드 벽돌 ----
export function buildWall() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, 'tile_wall');

  // 가로 줄눈(모르타르)
  pxRect(buf, 0, 10, 31, 10, 'ink');
  pxRect(buf, 0, 21, 31, 21, 'ink');

  // 줄눈 하단 하이라이트 — 벽돌 켜(course) 경계마다 빛이 걸리는 1px 라인을 추가해
  // 벽면에 입체감을 준다. 배경색(tile_wall) 자체는 ART.md §1.1 값 그대로다 —
  // "재질감"으로 대비를 보강하는 것이지 팔레트 배정을 바꾸는 게 아니다.
  // 세로 줄눈보다 먼저 그려서, 아래서 세로 줄눈이 교차점을 ink로 다시 덮어 줄눈의
  // 연속성을 지킨다.
  pxRect(buf, 0, 11, 31, 11, 'tile_floor_shade');
  pxRect(buf, 0, 22, 31, 22, 'tile_floor_shade');

  // 세로 줄눈 (밴드별)
  for (const x of [15, 31]) pxRect(buf, x, 0, x, 9, 'ink'); // 밴드 A
  for (const x of [7, 23]) pxRect(buf, x, 11, x, 20, 'ink'); // 밴드 B
  for (const x of [15, 31]) pxRect(buf, x, 22, x, 31, 'ink'); // 밴드 C

  // 상단 하이라이트
  pxRect(buf, 0, 0, 31, 0, 'tile_floor_shade');

  return buf;
}

// ---- tile_bush ----
// r는 "반경"으로 유클리드 근사 판정(dx²+dy² ≤ r²+r)에 쓴다 — 원래(Chebyshev, 정사각형)보다
// 둥글고 유기적인 잎 덩어리로 보이게 하려는 변경. (x mod 32, y mod 32) 랩 규칙은 그대로 유지.
const BUSH_BLOBS = [
  { cx: 6, cy: 7, r: 3 },
  { cx: 20, cy: 5, r: 2 },
  { cx: 26, cy: 19, r: 3 },
  { cx: 11, cy: 24, r: 2 },
  { cx: 31, cy: 30, r: 3 },
  { cx: 16, cy: 14, r: 2 }, // 추가 — 중앙부 여백을 메워 잎이 더 촘촘해 보이게
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
        if (dx * dx + dy * dy <= r * r + r) px(buf, x, y, 'tile_bush_mid');
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
