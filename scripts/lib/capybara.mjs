/**
 * capybara.mjs — capy_body_01 (기준 스프라이트) 생성. ART.md §3.1 (2026-08-07 개정판).
 *
 * 개정 핵심: (1) 어두운 주둥이 패치 (2) 낮고 넓은 비례 (폭20×높이22) (3) 밝은 아랫배 띠.
 * down/up/right 세 방향만 직접 그린다. left는 flipX(right) (§2.4).
 * 02~04 리컬러는 gen-sprites.mjs가 recolor로 굽는다 (§1.4) — 여기서 하지 않는다.
 *
 * 디테일 레이어 규칙(§3.1): 디테일은 마스크의 4-이웃 경계에서 1px 이상 안쪽에만 찍는다.
 * 아래 좌표는 전부 그 조건을 만족한다 — verify A13이 기계로 검사한다.
 */

import { rectPixels } from './canvas.mjs';
import { buildMaskFrame } from './mask-sprite.mjs';

const SHADING_BODY = { mid: 'capy_brown_mid', shadow: 'capy_brown_dark' };
const INK = 'ink';
const PATCH = 'capy_brown_dark'; // 주둥이 패치 — 리컬러 시 각 계열의 그림자색으로 따라 움직인다 (§3.1)
const BELLY = 'capy_white'; // 아랫배 띠 — 항등 매핑이라 4계열 공통 (§2.6 명확화)

function pts(x0, y0, x1, y1, color) {
  return rectPixels(x0, y0, x1, y1, false).map(([x, y]) => ({ x, y, color }));
}

// ---- down (row 0) — 좌우 대칭축 x=15.5 ----
const downShapes = [
  { x0: 9, y0: 6, x1: 11, y1: 8 }, // 귀(좌) 3×3 — 머리 좌측 끝(x9..11)에 맞물림
  { x0: 20, y0: 6, x1: 22, y1: 8 }, // 귀(우) 3×3 — 머리 우측 끝(x20..22)
  { x0: 9, y0: 8, x1: 22, y1: 17, removeCorners: true }, // 머리 14×10
  { x0: 6, y0: 17, x1: 25, y1: 26, removeCorners: true }, // 몸통 20×10
  { x0: 8, y0: 26, x1: 11, y1: 27, phase: 'A' }, // 발(좌) 4×2
  { x0: 20, y0: 26, x1: 23, y1: 27, phase: 'B' }, // 발(우) 4×2
];

// 순서: 주둥이 패치 → 주둥이 경계 → 콧구멍 → 눈 → 눈 하이라이트 → 아랫배 띠 (§3.1)
const downDetails = [
  ...pts(12, 12, 19, 15, PATCH), // 주둥이 패치 (윗덩어리 8×4)
  ...pts(13, 16, 18, 16, PATCH), // 주둥이 패치 (아랫줄 6×1)
  ...pts(13, 11, 18, 11, INK), // 주둥이 경계 — 02(연갈색) Δ37 보험 (§3.1)
  { x: 14, y: 13, color: INK }, // 콧구멍
  { x: 17, y: 13, color: INK },
  ...pts(11, 10, 12, 11, INK), // 눈(좌) 2×2
  ...pts(19, 10, 20, 11, INK), // 눈(우) 2×2
  { x: 11, y: 10, color: 'capy_white' }, // 눈 하이라이트 (마지막에 덮어씀)
  { x: 19, y: 10, color: 'capy_white' },
  ...pts(12, 24, 19, 25, BELLY), // 아랫배 띠 8×2 — §2.6 그림자 띠(y24..26) 안쪽. x12..19는 발 phase 무관 열
];

// ---- up (row 1) — down과 동일 마스크 + 꼬리, 디테일 전부 없음 ----
const upShapes = [...downShapes, { x0: 15, y0: 27, x1: 16, y1: 28 }]; // 꼬리 2×2
const upDetails = [];

// ---- right (row 3) — bbox x2..29 × y6..27 (폭28 × 높이22) ----
const rightShapes = [
  { x0: 19, y0: 6, x1: 21, y1: 8 }, // 귀 3×3
  { x0: 17, y0: 8, x1: 27, y1: 17, removeCorners: true }, // 머리 11×10
  { x0: 26, y0: 11, x1: 29, y1: 16 }, // 주둥이 4×6
  { x0: 4, y0: 16, x1: 24, y1: 26, removeCorners: true }, // 몸통 21×11 (머리와 y16,17에서 병합)
  { x0: 2, y0: 19, x1: 3, y1: 20 }, // 꼬리 2×2
  { x0: 6, y0: 26, x1: 9, y1: 27, phase: 'A' }, // 발(뒤) 4×2
  { x0: 17, y0: 26, x1: 20, y1: 27, phase: 'B' }, // 발(앞) 4×2
];

const rightDetails = [
  ...pts(25, 12, 28, 15, PATCH), // 주둥이 패치 4×4
  ...pts(24, 12, 24, 15, INK), // 주둥이 경계 세로선
  { x: 28, y: 14, color: INK }, // 콧구멍
  ...pts(22, 10, 23, 11, INK), // 눈 2×2
  { x: 22, y: 10, color: 'capy_white' }, // 눈 하이라이트 (마지막)
  ...pts(10, 24, 16, 25, BELLY), // 아랫배 띠 7×2 — x10..16은 발 phase 무관 열
];

export function buildBodyDownFrame(frameIndex) {
  return buildMaskFrame({ shapes: downShapes, details: downDetails, frameIndex, ink: INK, shading: SHADING_BODY });
}
export function buildBodyUpFrame(frameIndex) {
  return buildMaskFrame({ shapes: upShapes, details: upDetails, frameIndex, ink: INK, shading: SHADING_BODY });
}
export function buildBodyRightFrame(frameIndex) {
  return buildMaskFrame({ shapes: rightShapes, details: rightDetails, frameIndex, ink: INK, shading: SHADING_BODY });
}
