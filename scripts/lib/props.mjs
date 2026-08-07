/**
 * props.mjs — 소품 12종(4종 × 3구역)의 픽셀 아트. docs/SPEC_ZONES.md §4.2.
 *
 * 충돌 없는 순수 장식이다(§4). `src/sim/`은 이 파일의 존재를 모른다.
 * 좌표는 §4.2 표를 그대로 옮기되, P4(알파≠0 ≤150px)를 리터럴 사각형 채움으로는 넘기는
 * 1건(마을 index0 나무통)만 1px 단위로 다듬었다 — §9 "1px 조정은 tech 재량"의 범위이고,
 * P1~P6은 조정 대상이 아니므로 좌표 쪽을 줄였다. 각 함수 주석에 근거를 남긴다.
 *
 * 2026-08-07 tech (SPEC_ZONES.md §4.5 개정): 숲 index1 "작은 덤불"은 P7 신설(수풀색 0px)로
 * 폐기됐다 — 상호작용 없는 장식을 은신처(tile_bush_dark/_mid)와 같은 색으로 칠한 것은
 * 가독성이 아니라 설계 오류였다(§4.5 근거). 대체는 동굴 index1(버섯 무리) 프레임 재사용 —
 * 새 픽셀 0, 새 색 0.
 */

import { createCanvas, FRAME_SIZE, rectPixels, bresenhamLine } from './canvas.mjs';
import { rgba as paletteRgba } from './palette.mjs';
import { ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE } from './zones.mjs';

function px(buf, x, y, color) {
  const i = (y * FRAME_SIZE + x) * 4;
  const [r, g, b, a] = paletteRgba(color);
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function pxRect(buf, x0, y0, x1, y1, color, removeCorners = false) {
  for (const [x, y] of rectPixels(x0, y0, x1, y1, removeCorners)) px(buf, x, y, color);
}

function pxLine(buf, x0, y0, x1, y1, color, thickness = 1) {
  for (const [x, y] of bresenhamLine(x0, y0, x1, y1)) {
    for (let t = 0; t < thickness; t++) px(buf, x, y + t, color);
  }
}

// ============================================================
// 숲 (zone 0)
// ============================================================

/** index 0: 그루터기. capy_brown_dark 원기둥 + earth_dark 윗면 + ink 나이테 2줄. */
function buildStump() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 10, 14, 21, 23, 'capy_brown_dark');
  pxRect(buf, 10, 14, 21, 16, 'earth_dark');
  for (let x = 11; x <= 20; x++) px(buf, x, 15, 'ink');
  for (let x = 13; x <= 18; x++) px(buf, x, 16, 'ink');
  return buf;
}

/** index 2: 꽃 무리. 줄기 capy_brown_dark 3개(2026-08-07 개정: forest_floor_shade는 숲 바닥
 * 얼룩과 같은 색이라 안 보였다 — §4.5(2)) + 꽃 머리 2×2 ember_red×2 · accent_amber×1
 * (2026-08-07 개정: 각 2px → 2×2로 확대). amber 합계 4px ≤ 8(P3). */
function buildFlowerCluster() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  for (let y = 18; y <= 21; y++) px(buf, 12, y, 'capy_brown_dark');
  for (let y = 15; y <= 18; y++) px(buf, 16, y, 'capy_brown_dark');
  for (let y = 18; y <= 21; y++) px(buf, 20, y, 'capy_brown_dark');
  pxRect(buf, 11, 16, 12, 17, 'ember_red');
  pxRect(buf, 15, 13, 16, 14, 'accent_amber');
  pxRect(buf, 19, 16, 20, 17, 'ember_red');
  return buf;
}

/** index 3: 돌 무더기. capy_gray_dark 3덩이 + capy_gray_mid 윗면 하이라이트 1px×3. */
function buildStonePile() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 10, 20, 14, 25, 'capy_gray_dark', true);
  pxRect(buf, 14, 17, 19, 25, 'capy_gray_dark', true);
  pxRect(buf, 17, 21, 21, 25, 'capy_gray_dark', true);
  for (const [x, y] of [
    [12, 20],
    [16, 17],
    [19, 21],
  ]) {
    px(buf, x, y, 'capy_gray_mid');
  }
  return buf;
}

// ============================================================
// 마을 (zone 1)
// ============================================================

/**
 * index 0: 나무통. 원안 몸통 (10,12)-(21,25)는 12×14=168px로 P4를 넘는다 — y0를 12→13,
 * y1을 25→24로 위아래 1px씩 좁혀 144px로 맞췄다(§9 tech 재량, 색·테·외곽 좌표는 그대로).
 */
function buildBarrel() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 10, 13, 21, 24, 'earth_dark');
  for (let x = 10; x <= 21; x++) {
    px(buf, x, 15, 'warm_tan');
    px(buf, x, 21, 'warm_tan');
  }
  for (let x = 10; x <= 21; x++) {
    px(buf, x, 13, 'ink');
    px(buf, x, 24, 'ink');
  }
  for (let y = 13; y <= 24; y++) {
    px(buf, 10, y, 'ink');
    px(buf, 21, y, 'ink');
  }
  return buf;
}

/** index 1: 상자. earth_dark 사각 (10,13)-(21,24) + ink 대각선 X + ink 테두리. */
function buildCrate() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 10, 13, 21, 24, 'earth_dark');
  pxLine(buf, 10, 13, 21, 24, 'ink');
  pxLine(buf, 21, 13, 10, 24, 'ink');
  for (let x = 10; x <= 21; x++) {
    px(buf, x, 13, 'ink');
    px(buf, x, 24, 'ink');
  }
  for (let y = 13; y <= 24; y++) {
    px(buf, 10, y, 'ink');
    px(buf, 21, y, 'ink');
  }
  return buf;
}

/** index 2: 건초더미. earth_dark 바탕 (9,16)-(22,25) + warm_tan 가로 결 4줄(총 56px ≤60). */
function buildHayBale() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 9, 16, 22, 25, 'earth_dark');
  for (const y of [18, 20, 22, 24]) {
    for (let x = 9; x <= 22; x++) px(buf, x, y, 'warm_tan');
  }
  return buf;
}

/** index 3: 모닥불. capy_brown_dark 장작 X자(2px 두께) + ember_red 불꽃 + accent_amber 코어. */
function buildCampfire() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  for (const [x0, y0, x1, y1] of [
    [9, 22, 21, 18],
    [9, 18, 21, 22],
  ]) {
    for (const [x, y] of bresenhamLine(x0, y0, x1, y1)) {
      px(buf, x, y, 'capy_brown_dark');
      px(buf, x, y + 1, 'capy_brown_dark');
    }
  }
  pxRect(buf, 13, 12, 18, 18, 'ember_red', true);
  pxRect(buf, 15, 14, 16, 16, 'accent_amber');
  return buf;
}

// ============================================================
// 동굴 (zone 2)
// ============================================================

/** index 0: 횃불대. capy_brown_dark 기둥 + ember_red 불꽃(모서리 제거) + accent_amber 코어. */
function buildTorchStand() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 15, 16, 17, 26, 'capy_brown_dark');
  pxRect(buf, 13, 10, 18, 15, 'ember_red', true);
  pxRect(buf, 15, 12, 16, 13, 'accent_amber');
  return buf;
}

/** index 1: 버섯 무리. ember_red 갓 3개(모서리 제거) + capy_white 대 3점 + accent_amber 반점 3점. */
function buildMushroomCluster() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 11, 17, 14, 19, 'ember_red', true);
  pxRect(buf, 16, 15, 20, 18, 'ember_red', true);
  pxRect(buf, 21, 19, 23, 21, 'ember_red', true);
  for (const [x, y] of [
    [12, 20],
    [18, 19],
    [22, 22],
  ]) {
    px(buf, x, y, 'capy_white');
  }
  for (const [x, y] of [
    [12, 18],
    [17, 16],
    [22, 20],
  ]) {
    px(buf, x, y, 'accent_amber');
  }
  return buf;
}

/** index 2: 해골. capy_white 두개(모서리 제거) + ink 눈구멍 2개 + ink 이 파선. */
function buildSkull() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 12, 16, 19, 22, 'capy_white', true);
  pxRect(buf, 13, 18, 14, 19, 'ink');
  pxRect(buf, 17, 18, 18, 19, 'ink');
  for (let x = 13; x <= 18; x += 2) px(buf, x, 21, 'ink');
  return buf;
}

/** index 3: 물웅덩이. tile_spa 타원(모서리 제거) + capy_white 반사 파선. */
function buildPuddle() {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  pxRect(buf, 8, 18, 23, 25, 'tile_spa', true);
  for (let x = 9; x <= 19; x += 3) {
    px(buf, x, 20, 'capy_white');
    px(buf, x + 1, 20, 'capy_white');
  }
  return buf;
}

const PROP_BUILDERS = {
  // index 1: 동굴 index1(버섯 무리) 프레임 재사용 — SPEC_ZONES.md §4.5, buildSmallBush 폐기.
  [ZONE_FOREST]: [buildStump, buildMushroomCluster, buildFlowerCluster, buildStonePile],
  [ZONE_VILLAGE]: [buildBarrel, buildCrate, buildHayBale, buildCampfire],
  [ZONE_CAVE]: [buildTorchStand, buildMushroomCluster, buildSkull, buildPuddle],
};

/** frameIndex = zone*4 + index. SPEC_ZONES.md §4.2. */
export function buildPropFrame(zone, index) {
  return PROP_BUILDERS[zone][index]();
}
