/**
 * goblin.mjs — goblin_walk / goblin_idle 생성. ART.md §3.3.
 *
 * 카피바라와 반대로: 높고 좁고 각지고 팔다리가 길다. 모서리 제거를 쓰지 않는다(각짐 유지).
 */

import { rectPixels } from './canvas.mjs';
import { buildMaskFrame } from './mask-sprite.mjs';

const SHADING_GOBLIN = { mid: 'goblin_mid', shadow: 'goblin_dark' };
const INK = 'ink';
const EYE = 'accent_amber';

function pts(x0, y0, x1, y1, color) {
  return rectPixels(x0, y0, x1, y1, false).map(([x, y]) => ({ x, y, color }));
}

// ---- down (row 0) ----
const downShapes = [
  { type: 'points', points: [[10, 7], [9, 6], [10, 6], [10, 8]] }, // 뿔귀(왼)
  { type: 'points', points: [[21, 7], [21, 6], [22, 6], [21, 8]] }, // 뿔귀(오)
  { x0: 11, y0: 4, x1: 20, y1: 12 }, // 머리 (모서리 제거 없음)
  { x0: 12, y0: 12, x1: 19, y1: 21 }, // 몸통
  { x0: 10, y0: 13, x1: 11, y1: 23, phase: 'A' }, // 팔(왼)
  { x0: 20, y0: 13, x1: 21, y1: 23, phase: 'B' }, // 팔(오)
  { x0: 13, y0: 21, x1: 14, y1: 28, phase: 'A' }, // 다리(왼)
  { x0: 17, y0: 21, x1: 18, y1: 28, phase: 'B' }, // 다리(오)
];

const downDetails = [
  ...pts(13, 7, 13, 8, EYE),
  ...pts(18, 7, 18, 8, EYE),
  ...pts(14, 10, 17, 10, INK),
];

// ---- up (row 1) — 동일 마스크, 눈·입 없음, 뒤통수 세로선 추가 ----
const upShapes = downShapes;
const upDetails = [...pts(15, 5, 15, 11, 'goblin_dark')];

// ---- right (row 3) ----
const rightShapes = [
  { type: 'points', points: [[18, 6], [19, 5], [19, 7]] }, // 뿔귀 1개
  { x0: 14, y0: 4, x1: 22, y1: 12 }, // 머리
  { x0: 13, y0: 12, x1: 19, y1: 21 }, // 몸통
  { x0: 20, y0: 13, x1: 21, y1: 23, phase: 'B' }, // 팔(앞팔 1개)
  { x0: 13, y0: 21, x1: 14, y1: 28, phase: 'A' }, // 다리(뒤)
  { x0: 17, y0: 21, x1: 18, y1: 28, phase: 'B' }, // 다리(앞)
];

const rightDetails = [...pts(20, 7, 20, 8, EYE), ...pts(18, 10, 21, 10, INK)];

function build(shapes, details, frameIndex, variantOverride, dyOverride) {
  return buildMaskFrame({
    shapes,
    details,
    frameIndex,
    ink: INK,
    shading: SHADING_GOBLIN,
    variantOverride,
    dyOverride,
  });
}

// ---- walk (4프레임, 공유 FRAME_DY/FRAME_LEGS 그대로) ----
export function buildGoblinWalkDownFrame(f) {
  return build(downShapes, downDetails, f);
}
export function buildGoblinWalkUpFrame(f) {
  return build(upShapes, upDetails, f);
}
export function buildGoblinWalkRightFrame(f) {
  return build(rightShapes, rightDetails, f);
}

// ---- idle (2프레임, FRAME_DY=[0,-1], 다리·팔 전 프레임 N 고정) ----
const IDLE_DY = [0, -1];
export function buildGoblinIdleDownFrame(f) {
  return build(downShapes, downDetails, f, 'N', IDLE_DY[f]);
}
export function buildGoblinIdleUpFrame(f) {
  return build(upShapes, upDetails, f, 'N', IDLE_DY[f]);
}
export function buildGoblinIdleRightFrame(f) {
  return build(rightShapes, rightDetails, f, 'N', IDLE_DY[f]);
}
