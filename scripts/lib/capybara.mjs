/**
 * capybara.mjs — capy_body_01 (기준 스프라이트) 생성. ART.md §3.1.
 *
 * down/up/right 세 방향만 직접 그린다. left는 flipX(right) (§2.4).
 * 02~04 리컬러는 gen-sprites.mjs가 sprite-gen recolor(또는 폴백)로 굽는다 (§1.4) — 여기서 하지 않는다.
 */

import { rectPixels } from './canvas.mjs';
import { buildMaskFrame } from './mask-sprite.mjs';

const SHADING_BODY = { mid: 'capy_brown_mid', shadow: 'capy_brown_dark' };
const INK = 'ink';

function pts(x0, y0, x1, y1, color) {
  return rectPixels(x0, y0, x1, y1, false).map(([x, y]) => ({ x, y, color }));
}

// ---- down (row 0) ----
const downShapes = [
  { x0: 9, y0: 4, x1: 10, y1: 5 }, // 귀(좌)
  { x0: 21, y0: 4, x1: 22, y1: 5 }, // 귀(우)
  { x0: 9, y0: 6, x1: 22, y1: 17, removeCorners: true }, // 머리
  { x0: 8, y0: 17, x1: 23, y1: 27, removeCorners: true }, // 몸통
  { x0: 10, y0: 27, x1: 12, y1: 28, phase: 'A' }, // 발(좌, 작은 x)
  { x0: 19, y0: 27, x1: 21, y1: 28, phase: 'B' }, // 발(우, 큰 x)
];

const downDetails = [
  ...pts(13, 13, 18, 13, INK), // 주둥이 경계
  { x: 14, y: 15, color: INK }, // 콧구멍
  { x: 17, y: 15, color: INK },
  ...pts(11, 9, 12, 10, INK), // 눈(좌)
  ...pts(19, 9, 20, 10, INK), // 눈(우)
  { x: 11, y: 9, color: 'capy_white' }, // 눈 하이라이트 (눈 위에 마지막에 덮어씀)
  { x: 19, y: 9, color: 'capy_white' },
];

// ---- up (row 1) — down과 동일 마스크 + 꼬리, 얼굴 디테일 없음 ----
const upShapes = [...downShapes, { x0: 15, y0: 28, x1: 16, y1: 29 }]; // 꼬리
const upDetails = [];

// ---- right (row 3) ----
const rightShapes = [
  { x0: 19, y0: 5, x1: 20, y1: 6 }, // 귀
  { x0: 17, y0: 7, x1: 27, y1: 17, removeCorners: true }, // 머리
  { x0: 25, y0: 12, x1: 28, y1: 16 }, // 주둥이
  { x0: 4, y0: 15, x1: 22, y1: 26, removeCorners: true }, // 몸통
  { x0: 2, y0: 18, x1: 3, y1: 19 }, // 꼬리
  { x0: 6, y0: 26, x1: 8, y1: 28, phase: 'A' }, // 발(뒤, 작은 x)
  { x0: 16, y0: 26, x1: 18, y1: 28, phase: 'B' }, // 발(앞, 큰 x)
];

const rightDetails = [
  ...pts(23, 10, 24, 11, INK), // 눈
  { x: 27, y: 13, color: INK }, // 콧구멍
  { x: 23, y: 10, color: 'capy_white' }, // 눈 하이라이트 (마지막)
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
