/**
 * preview-chars.mjs — §3 개정 스프라이트 육안 판정용 미리보기 5종. ART.md §7·§8.
 * 커밋 대상 아님 (scripts/out/은 .gitignore). 판정 후 삭제해도 무방하다.
 *
 * 1. preview1_capy_sheet_x8.png      — 카피바라 4방향×4프레임 전체 시트 (8배)
 * 2. preview2_recolors_x8.png        — body 4색 나란히 (down f0 / right f0, 8배)
 * 3. preview3_composite_x8.png       — body+outfit+hat 합성 4방향 (8배, 조합 3종)
 * 4. preview4_capy_vs_goblin_x8.png  — 카피바라 vs 고블린 나란히 (down/right, 8배)
 * 5. preview5_ingame_1x.png (+ _2x)  — 실제 크기 타일 배경 합성
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './lib/png.mjs';
import { createCanvas, blitFrame, flipFrameX, FRAME_SIZE } from './lib/canvas.mjs';
import { buildBodyDownFrame, buildBodyUpFrame, buildBodyRightFrame } from './lib/capybara.mjs';
import { buildGoblinWalkDownFrame, buildGoblinWalkRightFrame } from './lib/goblin.mjs';
import { buildOutfitFrame, buildHatFrame } from './lib/overlays.mjs';
import { buildFloorVariant, buildBush } from './lib/tiles.mjs';
import { recolorBuffer, BODY_RECOLOR_MAPS } from './lib/recolor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
mkdirSync(OUT_DIR, { recursive: true });

function upscale(buf, w, h, s) {
  const out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) {
    for (let x = 0; x < w * s; x++) {
      const si = ((y / s | 0) * w + (x / s | 0)) * 4;
      const di = (y * w * s + x) * 4;
      out[di] = buf[si];
      out[di + 1] = buf[si + 1];
      out[di + 2] = buf[si + 2];
      out[di + 3] = buf[si + 3];
    }
  }
  return out;
}

function save(name, w, h, buf, scale = 1) {
  const data = scale === 1 ? buf : upscale(buf, w, h, scale);
  writeFileSync(join(OUT_DIR, name), encodePng(w * scale, h * scale, data));
  console.log(`wrote scripts/out/${name}`);
}

/** src(32×32)를 dst의 (fx,fy) 프레임 원점에 알파 합성. */
function over(dst, dstW, src, fx, fy) {
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const si = (y * FRAME_SIZE + x) * 4;
      if (src[si + 3] === 0) continue;
      const di = ((fy + y) * dstW + (fx + x)) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = 255;
    }
  }
}

// 방향별 body/overlay 프레임 (dir: 0 down, 1 up, 2 left, 3 right)
function bodyFrame(dir, f) {
  if (dir === 0) return buildBodyDownFrame(f);
  if (dir === 1) return buildBodyUpFrame(f);
  const r = buildBodyRightFrame(f);
  return dir === 2 ? flipFrameX(r) : r;
}
function overlayFrame(kind, id, dir, f) {
  const build = kind === 'outfit' ? buildOutfitFrame : buildHatFrame;
  if (dir === 0) return build(id, 'down', f);
  if (dir === 1) return build(id, 'up', f);
  const r = build(id, 'right', f);
  return dir === 2 ? flipFrameX(r) : r;
}
function recolorFrame(frame, bodyKey) {
  if (bodyKey === 'capy_body_01') return frame;
  return recolorBuffer(frame, BODY_RECOLOR_MAPS[bodyKey]);
}

// ---- 1. 카피바라 전체 시트 (4프레임 × 4방향, 8배) ----
{
  const w = FRAME_SIZE * 4;
  const h = FRAME_SIZE * 4;
  const canvas = createCanvas(w, h);
  for (let f = 0; f < 4; f++) {
    for (let dir = 0; dir < 4; dir++) {
      blitFrame(canvas, w, bodyFrame(dir, f), f, dir);
    }
  }
  save('preview1_capy_sheet_x8.png', w, h, canvas, 8);
}

// ---- 2. body 4색 나란히 (row0: down f0, row1: right f0, 8배) ----
{
  const keys = ['capy_body_01', 'capy_body_02', 'capy_body_03', 'capy_body_04'];
  const w = FRAME_SIZE * 4;
  const h = FRAME_SIZE * 2;
  const canvas = createCanvas(w, h);
  keys.forEach((k, i) => {
    blitFrame(canvas, w, recolorFrame(buildBodyDownFrame(0), k), i, 0);
    blitFrame(canvas, w, recolorFrame(buildBodyRightFrame(0), k), i, 1);
  });
  save('preview2_recolors_x8.png', w, h, canvas, 8);
}

// ---- 3. body+outfit+hat 합성 4방향 (조합 3종, 8배) ----
{
  const combos = [
    { body: 'capy_body_01', outfit: 1, hat: 1 }, // 기본갈색 + 멜빵바지 + 밀짚모자
    { body: 'capy_body_02', outfit: 3, hat: 2 }, // 연갈색 + 우비 + 유자
    { body: 'capy_body_04', outfit: 2, hat: 3 }, // 흰색 + 수건 + 헬멧
    { body: 'capy_body_03', outfit: 4, hat: 0 }, // 회색 + 작업복 + 모자 없음
  ];
  const w = FRAME_SIZE * 4;
  const h = FRAME_SIZE * combos.length;
  const canvas = createCanvas(w, h);
  combos.forEach((c, row) => {
    for (let dir = 0; dir < 4; dir++) {
      const fx = dir * FRAME_SIZE;
      const fy = row * FRAME_SIZE;
      over(canvas, w, recolorFrame(bodyFrame(dir, 0), c.body), fx, fy);
      over(canvas, w, overlayFrame('outfit', c.outfit, dir, 0), fx, fy);
      over(canvas, w, overlayFrame('hat', c.hat, dir, 0), fx, fy);
    }
  });
  save('preview3_composite_x8.png', w, h, canvas, 8);
}

// ---- 4. 카피바라 vs 고블린 나란히 (row0: down, row1: right, 8배) ----
{
  const w = FRAME_SIZE * 2;
  const h = FRAME_SIZE * 2;
  const canvas = createCanvas(w, h);
  blitFrame(canvas, w, buildBodyDownFrame(0), 0, 0);
  blitFrame(canvas, w, buildGoblinWalkDownFrame(0), 1, 0);
  blitFrame(canvas, w, buildBodyRightFrame(0), 0, 1);
  blitFrame(canvas, w, buildGoblinWalkRightFrame(0), 1, 1);
  save('preview4_capy_vs_goblin_x8.png', w, h, canvas, 8);
}

// ---- 5. 게임 실제 크기: 타일 배경 위 (1배 + 참고용 2배) ----
{
  const cols = 6;
  const rows = 3;
  const w = FRAME_SIZE * cols;
  const h = FRAME_SIZE * rows;
  const canvas = createCanvas(w, h);
  const variants = [0, 1, 2, 3].map(buildFloorVariant);
  const bush = buildBush();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBush = r === 2 && (c === 1 || c === 4);
      const tile = isBush ? bush : variants[(c * 7 + r * 13) % 4];
      blitFrame(canvas, w, tile, c, r);
    }
  }
  // 1행: 카피바라(기본) down/right, 고블린 down/right
  over(canvas, w, buildBodyDownFrame(0), FRAME_SIZE * 0, FRAME_SIZE * 1);
  over(canvas, w, buildBodyRightFrame(0), FRAME_SIZE * 1, FRAME_SIZE * 1);
  over(canvas, w, buildGoblinWalkDownFrame(0), FRAME_SIZE * 3, FRAME_SIZE * 1);
  over(canvas, w, buildGoblinWalkRightFrame(0), FRAME_SIZE * 4, FRAME_SIZE * 1);
  // 0행: 커스터마이즈 합성(밀짚+멜빵) down / 연갈색 우비 right
  over(canvas, w, buildBodyDownFrame(0), 0, 0);
  over(canvas, w, buildOutfitFrame(1, 'down', 0), 0, 0);
  over(canvas, w, buildHatFrame(1, 'down', 0), 0, 0);
  const capy02right = recolorFrame(buildBodyRightFrame(0), 'capy_body_02');
  over(canvas, w, capy02right, FRAME_SIZE * 2, 0);
  over(canvas, w, buildOutfitFrame(3, 'right', 0), FRAME_SIZE * 2, 0);
  over(canvas, w, buildHatFrame(2, 'right', 0), FRAME_SIZE * 2, 0);
  // 2행: 수풀 옆에 기본 카피바라 (Δ17 약한 쌍 확인)
  over(canvas, w, buildBodyDownFrame(0), FRAME_SIZE * 1, FRAME_SIZE * 2);
  over(canvas, w, buildGoblinWalkDownFrame(0), FRAME_SIZE * 4, FRAME_SIZE * 2);
  save('preview5_ingame_1x.png', w, h, canvas, 1);
  save('preview5_ingame_2x.png', w, h, canvas, 2);
}

console.log('preview-chars: done');
