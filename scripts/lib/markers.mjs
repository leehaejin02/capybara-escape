/**
 * markers.mjs — marker_mission(3프레임) / marker_exit(2프레임). ART.md §3.5.
 */

import { createCanvas, FRAME_SIZE } from './canvas.mjs';
import { rgba as paletteRgba, TRANSPARENT } from './palette.mjs';

function setPx(buf, x, y, color) {
  if (x < 0 || y < 0 || x >= FRAME_SIZE || y >= FRAME_SIZE) return;
  const i = (y * FRAME_SIZE + x) * 4;
  const [r, g, b, a] = color === null ? TRANSPARENT : paletteRgba(color);
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

// ---- marker_mission: 링. 지름 14(반경7), 두께2, 중심(16,16). 바깥 1px ink. ----
function buildMissionRing(ringColor, fillCenter) {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE); // 전 픽셀 알파 0에서 시작
  const cx = 16;
  const cy = 16;
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist > 5 && dist <= 7) setPx(buf, x, y, ringColor);
      else if (dist > 7 && dist <= 8) setPx(buf, x, y, 'ink');
    }
  }
  if (fillCenter) {
    for (let y = 15; y <= 17; y++) {
      for (let x = 15; x <= 17; x++) setPx(buf, x, y, 'accent_amber');
    }
  }
  return buf;
}

export function buildMissionFrame(frame) {
  if (frame === 0) return createCanvas(FRAME_SIZE, FRAME_SIZE); // 미활성 — 전 픽셀 알파 0
  if (frame === 1) return buildMissionRing('accent_amber', true);
  if (frame === 2) return buildMissionRing('capy_gray_mid', false);
  throw new Error(`buildMissionFrame: 알 수 없는 프레임 ${frame}`);
}

// ---- marker_exit: 문 아치. 폭20(x6..25) 높이24(y4..27). 테두리 2px + 바깥 1px ink. ----
function buildExitFrame(borderColor, insideColor) {
  const buf = createCanvas(FRAME_SIZE, FRAME_SIZE);
  const x0 = 6;
  const y0 = 4;
  const x1 = 25;
  const y1 = 27;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edgeDist = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      setPx(buf, x, y, edgeDist < 2 ? borderColor : insideColor);
    }
  }

  // 전체 바깥 1px ink — 아치 bbox 둘레 1px 바깥 사각형 테두리
  const ox0 = x0 - 1;
  const oy0 = y0 - 1;
  const ox1 = x1 + 1;
  const oy1 = y1 + 1;
  for (let x = ox0; x <= ox1; x++) {
    setPx(buf, x, oy0, 'ink');
    setPx(buf, x, oy1, 'ink');
  }
  for (let y = oy0; y <= oy1; y++) {
    setPx(buf, ox0, y, 'ink');
    setPx(buf, ox1, y, 'ink');
  }

  return buf;
}

export function buildExitFrameIndex(frame) {
  if (frame === 0) return buildExitFrame('capy_gray_dark', 'tile_wall'); // 닫힘
  if (frame === 1) return buildExitFrame('accent_amber', 'capy_white'); // 열림
  throw new Error(`buildExitFrameIndex: 알 수 없는 프레임 ${frame}`);
}
