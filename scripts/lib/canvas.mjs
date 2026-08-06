/**
 * canvas.mjs — 32×32 프레임 단위 픽셀 버퍼 조작 + 시트 합성 유틸리티.
 * Phaser에 의존하지 않는다 (Node 전용 생성 스크립트).
 */

export const FRAME_SIZE = 32;

/** width×height RGBA(전 픽셀 알파 0) 버퍼를 만든다. */
export function createCanvas(width, height) {
  return new Uint8ClampedArray(width * height * 4);
}

export function setPixel(buf, width, x, y, rgba) {
  if (x < 0 || y < 0 || x >= width) return; // 캔버스 밖 쓰기는 무시(호출부가 범위를 책임진다)
  const i = (y * width + x) * 4;
  if (i < 0 || i + 3 >= buf.length) return;
  buf[i] = rgba[0];
  buf[i + 1] = rgba[1];
  buf[i + 2] = rgba[2];
  buf[i + 3] = rgba[3];
}

export function getPixel(buf, width, x, y) {
  const i = (y * width + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

/**
 * 32×32 프레임을 시트 버퍼의 (col,row) 프레임 슬롯에 복사한다.
 * sheet는 (colsTotal*32) × (rowsTotal*32) RGBA 버퍼.
 */
export function blitFrame(sheetBuf, sheetWidth, frameBuf, col, row) {
  const ox = col * FRAME_SIZE;
  const oy = row * FRAME_SIZE;
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const si = ((oy + y) * sheetWidth + (ox + x)) * 4;
      const fi = (y * FRAME_SIZE + x) * 4;
      sheetBuf[si] = frameBuf[fi];
      sheetBuf[si + 1] = frameBuf[fi + 1];
      sheetBuf[si + 2] = frameBuf[fi + 2];
      sheetBuf[si + 3] = frameBuf[fi + 3];
    }
  }
}

/** 32×32 프레임을 좌우로 뒤집은 새 버퍼를 돌려준다. flipX(x) = 31 - x (ART.md §2.4). */
export function flipFrameX(frameBuf) {
  const out = createCanvas(FRAME_SIZE, FRAME_SIZE);
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const srcI = (y * FRAME_SIZE + x) * 4;
      const dstX = FRAME_SIZE - 1 - x;
      const dstI = (y * FRAME_SIZE + dstX) * 4;
      out[dstI] = frameBuf[srcI];
      out[dstI + 1] = frameBuf[srcI + 1];
      out[dstI + 2] = frameBuf[srcI + 2];
      out[dstI + 3] = frameBuf[srcI + 3];
    }
  }
  return out;
}

/**
 * 두 32×32 버퍼가 픽셀 완전 동일한지 검사한다 (verify A8 용, 생성 스크립트 자체 점검용).
 */
export function framesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * rect(x0,y0)-(x1,y1) inclusive의 픽셀 좌표 목록. removeCorners=true면 네 모서리 1px을 뺀다
 * (ART.md §2.5/§3.1 "네 모서리 1px 제거" 관례 — 32×32 예산에서 저렴하게 둥근 느낌을 낸다).
 */
export function rectPixels(x0, y0, x1, y1, removeCorners = false) {
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (
        removeCorners &&
        ((x === x0 && y === y0) ||
          (x === x1 && y === y0) ||
          (x === x0 && y === y1) ||
          (x === x1 && y === y1))
      ) {
        continue;
      }
      out.push([x, y]);
    }
  }
  return out;
}

/**
 * rect의 위쪽 두 모서리에서만 n×n 블록을 제거한다 (헬멧 돔 "상단 모서리 2px 제거" 전용, ART.md §3.2 _03).
 */
export function rectPixelsTopCornersRemoved(x0, y0, x1, y1, n) {
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const inTopLeft = x < x0 + n && y < y0 + n;
      const inTopRight = x > x1 - n && y < y0 + n;
      if (inTopLeft || inTopRight) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/** Bresenham 1px 직선 (ART.md §3.2 outfit_04 안전선용). */
export function bresenhamLine(x0, y0, x1, y1) {
  const out = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}
