/**
 * tiles.mjs — tile_floor(4변형×3구역) / tile_wall(4변형×3구역, 윗면·앞면·드롭섀도 3단) /
 * tile_shadow(드롭섀도, 신규) / tile_bush / tile_spa. docs/SPEC_ZONES.md §3·§5.3, ART.md §3.4.
 *
 * 전부 seamless(이음매 없음) 규칙을 지키기 위해 직접 픽셀을 찍는다 — mask-sprite의
 * 자동 외곽선 파이프라인은 캐릭터 실루엣용이라 타일에는 쓰지 않는다.
 *
 * 2026-08-07 tech (SPEC_ZONES 1단계): 벽·바닥을 구역(zone) 인식형으로 재작성했다.
 * §4(소품)·§5.4(수풀)·§5.5(온천)·§6(캐노피)은 다음 호출 — buildBush/buildSpa는 이번에 손대지 않는다.
 */

import { createCanvas, FRAME_SIZE } from './canvas.mjs';
import { rgba as paletteRgba } from './palette.mjs';
import { ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE } from './zones.mjs';

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

// ============================================================
// tile_floor — 4변형 × 3구역. SPEC_ZONES.md §5.3.
// variant 선택식(col*7+row*13)%4과 얼룩 좌표(FLOOR_VARIANT_PEBBLES)는 ART.md §3.4 그대로,
// "바꾸지 않는다"(§5.3) — 구역과 무관하게 공통이다. 구역별 색(BASE/SHADE)과 추가 장식만 얹는다.
// ============================================================

const FLOOR_VARIANT_PEBBLES = [
  [[7, 11], [19, 6], [25, 22], [12, 26], [16, 17]],
  [[5, 20], [22, 9], [11, 4], [27, 27], [18, 14]],
  [[9, 25], [16, 8], [28, 15], [4, 12], [23, 20]],
  [[14, 5], [26, 11], [6, 27], [20, 24], [9, 16]],
];
const FLOOR_STIPPLE_MODULO = 41; // ~1/41 ≈ 2.4% 밀도 — 은은하게, 캐릭터를 가리지 않을 정도

/** SPEC_ZONES.md §5.3: 숲 낙엽 5px 십자 2개 (variant별 중심 2쌍). warm_tan. */
const FOREST_LEAF_CROSSES = [
  [[10, 20], [24, 9]],
  [[20, 24], [7, 13]],
  [[13, 7], [24, 22]],
  [[18, 12], [9, 24]],
];

/** SPEC_ZONES.md §5.3: 마을 마른 흙 3×2(좌상단 기준, warm_tan) — variant별 1개. */
const VILLAGE_DRY_EARTH_TOPLEFT = [
  [18, 21],
  [7, 7],
  [22, 12],
  [11, 25],
];

/** SPEC_ZONES.md §5.3: 마을 듬성한 풀 1px 3점(tile_bush_mid) — variant별 3좌표. */
const VILLAGE_GRASS_DOTS = [
  [[8, 9], [25, 14], [12, 25]],
  [[20, 20], [26, 6], [14, 27]],
  [[6, 17], [18, 26], [27, 10]],
  [[24, 19], [9, 8], [15, 15]],
];

const FLOOR_ZONES = {
  [ZONE_FOREST]: { base: 'forest_floor', shade: 'forest_floor_shade' },
  [ZONE_VILLAGE]: { base: 'earth_mid', shade: 'earth_dark' },
  [ZONE_CAVE]: { base: 'cave_floor', shade: 'cave_floor_shade' },
};

function drawCross5(buf, cx, cy, color) {
  pxInset(buf, cx, cy, color);
  pxInset(buf, cx - 1, cy, color);
  pxInset(buf, cx + 1, cy, color);
  pxInset(buf, cx, cy - 1, color);
  pxInset(buf, cx, cy + 1, color);
}

export function buildFloorVariant(zone, variant) {
  const z = FLOOR_ZONES[zone];
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, z.base);

  // 조약돌(십자 5px) — 전 구역 공통, ART.md §3.4 원안을 확장한 기존 구현 그대로.
  for (const [cx, cy] of FLOOR_VARIANT_PEBBLES[variant]) drawCross5(buf, cx, cy, z.shade);

  // 스티플 노이즈 — 해시 기반이라 32px 격자와 위상이 어긋나고, variant마다 다른 시드를 써서
  // 이웃한 서로 다른 variant끼리도 무늬가 겹쳐 보이지 않는다. 전 구역 공통(variant 시드만 사용).
  for (let y = EDGE_MARGIN; y <= FRAME_SIZE - 1 - EDGE_MARGIN; y++) {
    for (let x = EDGE_MARGIN; x <= FRAME_SIZE - 1 - EDGE_MARGIN; x++) {
      if (hash2(x, y, variant) % FLOOR_STIPPLE_MODULO === 0) px(buf, x, y, z.shade);
    }
  }

  // 구역별 추가 장식 (SPEC_ZONES.md §5.3)
  if (zone === ZONE_FOREST) {
    for (const [cx, cy] of FOREST_LEAF_CROSSES[variant]) drawCross5(buf, cx, cy, 'warm_tan');
  } else if (zone === ZONE_VILLAGE) {
    const [ex, ey] = VILLAGE_DRY_EARTH_TOPLEFT[variant];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) pxInset(buf, ex + dx, ey + dy, 'warm_tan');
    for (const [gx, gy] of VILLAGE_GRASS_DOTS[variant]) pxInset(buf, gx, gy, 'tile_bush_mid');
  }
  // ZONE_CAVE: 추가 요소 없음 (§5.3)

  return buf;
}

// ============================================================
// tile_wall — 4변형(남북 이웃 마스크) × 3구역, 윗면/앞면/드롭섀도 3단. SPEC_ZONES.md §3.
//
// variant = (isSolid(north)?2:0) + (isSolid(south)?1:0)
//   northCorner(북쪽 모서리선, y=0)  ⟺ 북쪽이 바닥(= !isSolid(north)) ⟺ variant 0·1
//   hasFace(앞면 있음)               ⟺ 남쪽이 바닥(= !isSolid(south)) ⟺ variant 0·2
//   fullTop(윗면이 y=31까지 이어짐)  ⟺ 남쪽이 벽(=  isSolid(south)) ⟺ variant 1·3
// 이 세 불리언이 §3.1 표(variant 0~3)를 그대로 재현한다.
// ============================================================

/** 숲 윗면 잎 블롭 4개(체비쇼프). (x, y mod 17) 랩 — variant 1·3의 "y=31까지 이어짐"이
 * 주기 17로 자동 반복되게 만드는 장치다(SPEC_ZONES.md §3.3 표 그대로). */
const FOREST_TOP_BLOBS = [
  { cx: 5, cy: 4, r: 3 },
  { cx: 19, cy: 3, r: 2 },
  { cx: 26, cy: 11, r: 3 },
  { cx: 12, cy: 14, r: 2 },
];

/**
 * 2026-08-07 tech (사용자 육안 판정 반영, 재촬영 라운드): SPEC_ZONES.md §3.3 원문은 "체비쇼프"
 * (정사각형) 거리로 블롭을 정의했는데, 그대로 구현하면 잎이 아니라 **정사각형 4개가 타일마다
 * 동일 위치에 그대로 반복**돼 "시장바둑판"으로 읽혔다(사용자 판정 — 원인 (a), 모양이 사각형인
 * 것이 원인이고 (b) 랩 실패는 아니다: y mod17/x 반복 자체는 마을·동굴도 똑같이 하는데 그
 * 둘은 "인공 구조물이라 규칙적이어도 자연스럽다"는 판정을 받았다).
 * `tile_bush.mjs`가 이미 같은 이유로 Chebyshev→유클리드 근사(dx²+dy² ≤ r²+r)로 바꾼 선례가
 * 있어 그 식을 그대로 재사용했다 — 중심 좌표(cx,cy)와 반경(r)은 SPEC_ZONES.md §3.3 값 그대로,
 * **색·문턱값·다른 구역 좌표는 바꾸지 않았다.** 블롭 하단 1px 그림자 선도 tile_bush.mjs와
 * 동일한 방식(원형 판정과 무관하게 전 폭에 flat line)으로 다시 그린다.
 */
function drawForestTopPattern(buf, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    const yy = ((y % 17) + 17) % 17;
    for (let x = 0; x < FRAME_SIZE; x++) {
      for (const b of FOREST_TOP_BLOBS) {
        const dx = x - b.cx;
        const dy = yy - b.cy;
        if (dx * dx + dy * dy <= b.r * b.r + b.r) px(buf, x, y, 'forest_floor');
      }
    }
  }
  // 블롭 하단 그림자 선 — 원형 채움과 별개로 전 폭에 평평하게 긋는다(tile_bush.mjs와 동일 스타일).
  for (let y = y0; y <= y1; y++) {
    const yy = ((y % 17) + 17) % 17;
    for (const b of FOREST_TOP_BLOBS) {
      if (yy !== b.cy + b.r) continue;
      for (let dx = -b.r; dx <= b.r; dx++) {
        const x = ((b.cx + dx) % FRAME_SIZE + FRAME_SIZE) % FRAME_SIZE;
        px(buf, x, y, 'forest_floor_shade');
      }
    }
  }
}

function drawForestFacePattern(buf) {
  for (const x of [6, 22]) for (let y = 20; y <= 29; y++) px(buf, x, y, 'forest_floor_shade');
}

/**
 * 마을 윗면: ink 세로 이음선(x∈{7,15,23,31}, 전 높이) + earth_mid 나무결 가로 파선.
 * 파선 y는 SPEC_ZONES.md §3.3에 y∈{4,9,14} 3개로 명시됐다(variant 0·2의 짧은 윗면 기준).
 * variant 1·3(윗면이 y=31까지 이어짐)에서는 "무늬가 이어져야 한다"(§3.2)는 요구를 만족시키기
 * 위해 같은 5px 주기(y=4,9,14,19,24,29)로 tech가 연장했다 — §9가 명시한 "1px 조정은 tech
 * 재량" 범위 안의 해석이고, 문턱값·색 배정은 바꾸지 않았다.
 */
function drawVillageTopPattern(buf, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    if (((y - 4) % 5 + 5) % 5 !== 0) continue;
    for (let x = 0; x < FRAME_SIZE; x++) if (x % 6 < 4) px(buf, x, y, 'earth_mid');
  }
  // 세로 이음선을 나중에 그려 파선과 교차해도 이음선이 끊기지 않게 한다.
  for (const x of [7, 15, 23, 31]) for (let y = y0; y <= y1; y++) px(buf, x, y, 'ink');
}

function drawVillageFacePattern(buf) {
  for (const [x0, x1] of [[3, 7], [13, 17], [23, 27]]) {
    for (let y = 19; y <= 31; y++) for (let x = x0; x <= x1; x++) px(buf, x, y, 'earth_dark');
  }
  for (let x = 0; x < FRAME_SIZE; x++) px(buf, x, 25, 'ink'); // 가로 지지대
}

/**
 * 동굴 윗면: 러닝본드 벽돌. 가로 줄눈 y mod17 ∈ {5,12}, 줄눈 바로 아래 1px 하이라이트
 * (y mod17 ∈ {6,13}), 세로 줄눈 밴드 A/B/C. y mod17 랩은 forest와 같은 이유(§3.2 "이어짐").
 */
function drawCaveTopPattern(buf, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    const yy = ((y % 17) + 17) % 17;
    if (yy === 5 || yy === 12) {
      for (let x = 0; x < FRAME_SIZE; x++) px(buf, x, y, 'ink');
    } else if (yy === 6 || yy === 13) {
      for (let x = 0; x < FRAME_SIZE; x++) px(buf, x, y, 'cave_floor_shade');
    }
  }
  for (let y = y0; y <= y1; y++) {
    const yy = ((y % 17) + 17) % 17;
    if (yy >= 1 && yy <= 4) for (const x of [15, 31]) px(buf, x, y, 'ink'); // 밴드 A
    else if (yy >= 6 && yy <= 11) for (const x of [7, 23]) px(buf, x, y, 'ink'); // 밴드 B
    else if (yy >= 13 && yy <= 16) for (const x of [15, 31]) px(buf, x, y, 'ink'); // 밴드 C
  }
}

function drawCaveFacePattern(buf) {
  for (const x of [15, 31]) for (let y = 19; y <= 24; y++) px(buf, x, y, 'ink');
  for (const x of [7, 23]) for (let y = 26; y <= 31; y++) px(buf, x, y, 'ink');
  for (let x = 0; x < FRAME_SIZE; x++) px(buf, x, 25, 'ink');
}

const WALL_ZONES = {
  [ZONE_FOREST]: {
    top: 'forest_wall_top',
    face: 'forest_wall',
    faceLight: 'forest_floor_shade',
    drawTop: drawForestTopPattern,
    drawFace: drawForestFacePattern,
  },
  [ZONE_VILLAGE]: {
    top: 'village_wall_top',
    face: 'capy_brown_dark',
    faceLight: 'earth_dark',
    drawTop: drawVillageTopPattern,
    drawFace: drawVillageFacePattern,
  },
  [ZONE_CAVE]: {
    top: 'cave_wall_top',
    face: 'cave_wall_face',
    faceLight: 'cave_floor_shade',
    drawTop: drawCaveTopPattern,
    drawFace: drawCaveFacePattern,
  },
};

export function buildWallVariant(zone, variant) {
  const z = WALL_ZONES[zone];
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  fill(buf, z.top);

  const northSolid = (variant & 2) !== 0;
  const southSolid = (variant & 1) !== 0;
  const northCorner = !northSolid; // variant 0·1
  const hasFace = !southSolid; // variant 0·2
  const topStartY = northCorner ? 1 : 0;
  const topEndY = hasFace ? 16 : 31; // variant 1·3은 fullTop이라 31까지

  z.drawTop(buf, topStartY, topEndY);

  if (northCorner) pxRect(buf, 0, 0, 31, 0, 'ink');

  if (hasFace) {
    pxRect(buf, 0, 17, 31, 17, 'ink'); // 경계선
    pxRect(buf, 0, 18, 31, 18, z.faceLight); // 앞면 상단 광
    pxRect(buf, 0, 19, 31, 31, z.face); // 앞면 채움
    z.drawFace(buf);
  }

  return buf;
}

// ============================================================
// tile_shadow — 벽 드롭섀도, 32×32 1프레임, 전 구역 공통. SPEC_ZONES.md §3.4.
// ============================================================

export function buildShadow() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE); // 알파 0에서 시작
  for (let y = 0; y <= 3; y++) for (let x = 0; x < FRAME_SIZE; x++) px(buf, x, y, 'ink');
  for (let y = 4; y <= 5; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      if ((x + y) % 2 === 0) px(buf, x, y, 'ink');
    }
  }
  // y 6..31: 알파 0 유지 (createCanvas 기본값)
  return buf;
}

// ============================================================
// tile_bush / tile_spa — 이번 호출(SPEC_ZONES 1단계) 범위 밖. ART.md §3.4 그대로 유지.
// (SPEC_ZONES.md §5.4 수풀·§5.5 온천은 다음 호출)
// ============================================================

const BUSH_BLOBS = [
  { cx: 6, cy: 7, r: 3 },
  { cx: 20, cy: 5, r: 2 },
  { cx: 26, cy: 19, r: 3 },
  { cx: 11, cy: 24, r: 2 },
  { cx: 31, cy: 30, r: 3 },
  { cx: 16, cy: 14, r: 2 },
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
  for (const { cx, cy, r } of BUSH_BLOBS) {
    const rowY = (cy + r + FRAME_SIZE) % FRAME_SIZE;
    for (let dx = -r; dx <= r; dx++) {
      const x = ((cx + dx) % FRAME_SIZE + FRAME_SIZE) % FRAME_SIZE;
      px(buf, x, rowY, 'tile_bush_dark');
    }
  }
  return buf;
}

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
