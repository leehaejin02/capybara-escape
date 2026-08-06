/**
 * goblin.mjs — goblin_walk / goblin_idle 생성. ART.md §3.3 (2026-08-07 개정판).
 *
 * 방향: 작고 웅크린 형태. 카피바라와의 대비축 4개 — 면적비 0.55, 팔다리 사이 빈 공간 3군데,
 * 옆으로 뾰족한 귀, 각진 모서리(모서리 제거 없음). 바닥선은 카피바라와 같은 y=27.
 */

import { rectPixels } from './canvas.mjs';
import { buildMaskFrame } from './mask-sprite.mjs';

const SHADING_GOBLIN = { mid: 'goblin_mid', shadow: 'goblin_dark' };
const INK = 'ink';
const EYE = 'accent_amber';
const BELT = 'capy_brown_dark'; // "초록 단색"을 깨는 유일한 장치 — 실루엣 안쪽에만 (§3.3, A13)

function pts(x0, y0, x1, y1, color) {
  return rectPixels(x0, y0, x1, y1, false).map(([x, y]) => ({ x, y, color }));
}

// ---- down (row 0) — 좌우 대칭축 x=15.5, 모서리 제거 없음 ----
const downShapes = [
  { x0: 10, y0: 11, x1: 21, y1: 18 }, // 머리 12×8 — 몸통보다 넓다
  { type: 'points', points: [[9, 13], [9, 14], [9, 15], [8, 13], [8, 14], [7, 13]] }, // 뾰족귀(좌)
  { type: 'points', points: [[22, 13], [22, 14], [22, 15], [23, 13], [23, 14], [24, 13]] }, // 뾰족귀(우)
  { x0: 12, y0: 18, x1: 19, y1: 23 }, // 몸통 8×6
  { x0: 9, y0: 19, x1: 10, y1: 24, phase: 'A' }, // 팔(좌) 2×6 — 몸통과 1열(x=11) 이격
  { x0: 21, y0: 19, x1: 22, y1: 24, phase: 'B' }, // 팔(우) 2×6 — x=20 이격
  { x0: 12, y0: 23, x1: 13, y1: 27, phase: 'A' }, // 다리(좌) 2×5
  { x0: 18, y0: 23, x1: 19, y1: 27, phase: 'B' }, // 다리(우) 2×5 — 가랑이 x14..17 빈 공간
];

const downDetails = [
  ...pts(12, 14, 13, 15, EYE), // 눈(좌) 2×2
  ...pts(18, 14, 19, 15, EYE), // 눈(우) 2×2
  ...pts(12, 13, 13, 13, INK), // 눈썹(좌)
  ...pts(18, 13, 19, 13, INK), // 눈썹(우)
  ...pts(14, 17, 17, 17, INK), // 입
  ...pts(13, 21, 18, 22, BELT), // 허리띠 6×2
];

// ---- up (row 1) — 동일 마스크. 눈·눈썹·입 없음, 허리띠 유지, 뒤통수 세로선 ----
const upShapes = downShapes;
const upDetails = [
  ...pts(15, 12, 15, 16, 'goblin_dark'), // 뒤통수 세로 1px
  ...pts(13, 21, 18, 22, BELT), // 허리띠 — 등에서도 보이는 장비
];

// ---- right (row 3) — 굽은 등: 등 꼭대기 y=12 > 머리 꼭대기 y=14 ----
const rightShapes = [
  { x0: 9, y0: 12, x1: 17, y1: 23 }, // 등·몸통 9×12 — top y=12 = 실루엣 최상단
  { x0: 17, y0: 14, x1: 24, y1: 22 }, // 머리 8×9 — 앞으로 처진 머리
  { type: 'points', points: [[18, 13], [19, 13], [19, 12], [20, 12], [21, 12]] }, // 뾰족귀 — 앞-위 계단(뿔처럼)
  { x0: 16, y0: 22, x1: 17, y1: 26, phase: 'B' }, // 팔(앞) 2×5 — 다리 길이에 가깝게 늘어짐
  { x0: 10, y0: 23, x1: 11, y1: 27, phase: 'A' }, // 다리(뒤) 2×5
  { x0: 13, y0: 23, x1: 14, y1: 27, phase: 'B' }, // 다리(앞) 2×5 — x12, x15 빈 공간
];

const rightDetails = [
  ...pts(21, 16, 22, 17, EYE), // 눈 2×2
  ...pts(21, 15, 22, 15, INK), // 눈썹
  ...pts(21, 19, 23, 19, INK), // 입
  ...pts(10, 19, 16, 20, BELT), // 허리띠 7×2
];

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

// ---- walk (4프레임, 공유 FRAME_DY/FRAME_LEGS 그대로 — 팔에도 같은 위상, §3.3) ----
export function buildGoblinWalkDownFrame(f) {
  return build(downShapes, downDetails, f);
}
export function buildGoblinWalkUpFrame(f) {
  return build(upShapes, upDetails, f);
}
export function buildGoblinWalkRightFrame(f) {
  return build(rightShapes, rightDetails, f);
}

// ---- idle (2프레임, FRAME_DY=[0,-1], 팔다리 전 프레임 N 고정 — 전체 이동) ----
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
