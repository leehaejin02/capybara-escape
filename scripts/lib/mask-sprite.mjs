/**
 * mask-sprite.mjs — 채움 마스크 → 음영(§2.6) → 외곽선(§2.5) → 디테일 오버레이 파이프라인.
 *
 * capy_body_*, goblin_*(자동 2톤 음영), capy_outfit_* 및 capy_hat_*(per-shape 색, 음영 없음)
 * 양쪽이 이 한 함수를 공유한다. FRAME_DY는 body 생성기와 오버레이 생성기가
 * "같은 상수 하나"를 공유해야 한다는 ART.md §3.2 규칙 2의 요구사항이 이 모듈 export로 충족된다.
 */

import { createCanvas, rectPixels, rectPixelsTopCornersRemoved, FRAME_SIZE } from './canvas.mjs';
import { rgba as paletteRgba } from './palette.mjs';

/** 모든 방향 공통. 스프라이트(마스크+디테일) 전체를 y축으로 이동한다. ART.md §3.1. */
export const FRAME_DY = [0, -1, 0, -1];
/** A=왼쪽(작은 x) 다리/팔 전진, N=중립(frame0 정의 그대로), B=오른쪽(큰 x) 전진. */
export const FRAME_LEGS = ['A', 'N', 'B', 'N'];

function shapePixels(shape) {
  if (shape.type === 'points') return shape.points;
  if (shape.type === 'rectTopCorners') {
    return rectPixelsTopCornersRemoved(shape.x0, shape.y0, shape.x1, shape.y1, shape.n);
  }
  return rectPixels(shape.x0, shape.y0, shape.x1, shape.y1, !!shape.removeCorners);
}

/**
 * shapes: [{x0,y0,x1,y1,removeCorners?, type?, points?, n?, phase?: 'A'|'B', color?: paletteName}]
 * details: [{x,y,color}] — 마스크 완성 후 마지막에 덮어쓰는 픽셀(얼굴 디테일 등).
 * frameIndex: 0..3
 * ink: 외곽선 색 이름
 * shading: null | {mid, shadow} — 지정하면 §2.6 열 단위 음영을 적용하고 shape.color는 무시한다.
 *          지정하지 않으면 shape.color를 그대로 쓴다(오버레이용).
 */
export function buildMaskFrame({
  shapes,
  details = [],
  frameIndex,
  ink,
  shading = null,
  variantOverride,
  dyOverride,
}) {
  // goblin_idle은 FRAME_DY=[0,-1] 2프레임이고 다리를 전 프레임 N(중립) 고정한다 (ART.md §3.3) —
  // frameIndex 기반 공유 FRAME_LEGS/FRAME_DY 인덱싱과 다른 배열이므로 override로 우회한다.
  const variant = variantOverride ?? FRAME_LEGS[frameIndex];
  const dy = dyOverride ?? FRAME_DY[frameIndex];

  // 1) 원본 좌표계(dy 이전)에서 shape별 phase 적용 + 색 배정
  // recolorOnly: 새 마스크 픽셀을 추가하지 않고, 이미 앞선 shape가 채운 좌표의 색만 덮어쓴다.
  // (모자 챙/크라운의 "아랫줄만 다른 색" 같은 오버레이가 removeCorners로 제외된 모서리를
  // 실수로 되살리지 않게 하기 위한 안전장치 — ART.md §3.2 "실제 사례" 참고)
  const colorMap = new Map(); // "x,y" -> colorName (셰이딩 모드에선 우선 'mid'로 채웠다가 재계산)
  for (const shape of shapes) {
    const shift = shape.phase && shape.phase === variant ? 1 : 0;
    for (const [x, y] of shapePixels(shape)) {
      const key = `${x},${y + shift}`;
      if (shape.recolorOnly && !colorMap.has(key)) continue;
      colorMap.set(key, shading ? 'mid' : shape.color);
    }
  }

  // 2) §2.6 음영: 열(x)마다 최하단부터 위로 3px을 shadow로.
  if (shading) {
    const columnMaxY = new Map();
    for (const key of colorMap.keys()) {
      const [x, y] = key.split(',').map(Number);
      const cur = columnMaxY.get(x);
      if (cur === undefined || y > cur) columnMaxY.set(x, y);
    }
    for (const key of colorMap.keys()) {
      const [x, y] = key.split(',').map(Number);
      const maxY = columnMaxY.get(x);
      colorMap.set(key, y >= maxY - 2 ? shading.shadow : shading.mid);
    }
  }

  // 3) 전체를 dy만큼 이동 (§3.1 FRAME_DY — 마스크와 디테일 모두)
  const shifted = new Map();
  for (const [key, color] of colorMap) {
    const [x, y] = key.split(',').map(Number);
    shifted.set(`${x},${y + dy}`, color);
  }

  // 4) §2.5 외곽선: 4-이웃 중 하나라도 마스크 밖(또는 캔버스 밖)이면 ink로 덮는다.
  for (const key of Array.from(shifted.keys())) {
    const [x, y] = key.split(',').map(Number);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    const isEdge = neighbors.some(([nx, ny]) => {
      if (nx < 0 || ny < 0 || nx >= FRAME_SIZE || ny >= FRAME_SIZE) return true;
      return !shifted.has(`${nx},${ny}`);
    });
    if (isEdge) shifted.set(key, ink);
  }

  // 5) 렌더
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  for (const [key, colorName] of shifted) {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || y < 0 || x >= FRAME_SIZE || y >= FRAME_SIZE) continue; // 캔버스 밖은 그리지 않음
    const i = (y * FRAME_SIZE + x) * 4;
    const [r, g, b, a] = paletteRgba(colorName);
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }

  // 6) 디테일 오버레이 — 마지막에 덮어쓴다 (마스크 소속 여부 무관)
  for (const d of details) {
    const x = d.x;
    const y = d.y + dy;
    if (x < 0 || y < 0 || x >= FRAME_SIZE || y >= FRAME_SIZE) continue;
    const i = (y * FRAME_SIZE + x) * 4;
    const [r, g, b, a] = paletteRgba(d.color);
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }

  return buf;
}
