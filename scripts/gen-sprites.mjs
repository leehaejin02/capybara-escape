/**
 * gen-sprites.mjs — docs/ART.md 명세대로 전 스프라이트를 생성한다. 무의존(node 내장 zlib만 사용).
 *
 * 실행: `node scripts/gen-sprites.mjs` (또는 `npm run gen:sprites`)
 * 산출: public/assets/*.png — Vite가 base: '/capybara-escape/' 환경에서도 그대로 서빙하는 정적 폴더.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './lib/png.mjs';
import { createCanvas, blitFrame, flipFrameX, framesEqual, FRAME_SIZE } from './lib/canvas.mjs';
import { buildBodyDownFrame, buildBodyUpFrame, buildBodyRightFrame } from './lib/capybara.mjs';
import {
  buildGoblinWalkDownFrame,
  buildGoblinWalkUpFrame,
  buildGoblinWalkRightFrame,
  buildGoblinIdleDownFrame,
  buildGoblinIdleUpFrame,
  buildGoblinIdleRightFrame,
} from './lib/goblin.mjs';
import { buildOutfitFrame, buildHatFrame } from './lib/overlays.mjs';
import { buildFloorVariant, buildWallVariant, buildShadow, buildBush, buildSpa } from './lib/tiles.mjs';
import { buildMissionFrame, buildExitFrameIndex } from './lib/markers.mjs';
import { recolorBuffer, BODY_RECOLOR_MAPS } from './lib/recolor.mjs';
import { ZONE_COUNT } from './lib/zones.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ASSETS_DIR = join(REPO_ROOT, 'public', 'assets');
const OUT_DEBUG_DIR = join(REPO_ROOT, 'scripts', 'out');

mkdirSync(ASSETS_DIR, { recursive: true });
mkdirSync(OUT_DEBUG_DIR, { recursive: true });

const written = [];

function savePng(name, width, height, rgba) {
  const buf = encodePng(width, height, rgba);
  const path = join(ASSETS_DIR, `${name}.png`);
  writeFileSync(path, buf);
  written.push({ name, width, height, bytes: buf.length });
  return buf;
}

/**
 * down/up/left/right 4방향 × 4프레임 128×128 시트를 만든다.
 * left는 flipFrameX(right)로 굽는다(런타임 플립 아님, ART.md §2.4).
 * downFn/upFn/rightFn: (frameIndex:0..3) => 32×32 RGBA 버퍼
 */
function buildDirSheet(downFn, upFn, rightFn) {
  const sheet = createCanvas(FRAME_SIZE * 4, FRAME_SIZE * 4);
  for (let f = 0; f < 4; f++) {
    blitFrame(sheet, FRAME_SIZE * 4, downFn(f), f, 0);
    blitFrame(sheet, FRAME_SIZE * 4, upFn(f), f, 1);
    blitFrame(sheet, FRAME_SIZE * 4, flipFrameX(rightFn(f)), f, 2);
    blitFrame(sheet, FRAME_SIZE * 4, rightFn(f), f, 3);
  }
  return sheet;
}

/** goblin_idle 전용: 2프레임 × 4방향, 64×128. */
function buildIdleSheet(downFn, upFn, rightFn) {
  const sheet = createCanvas(FRAME_SIZE * 2, FRAME_SIZE * 4);
  for (let f = 0; f < 2; f++) {
    blitFrame(sheet, FRAME_SIZE * 2, downFn(f), f, 0);
    blitFrame(sheet, FRAME_SIZE * 2, upFn(f), f, 1);
    blitFrame(sheet, FRAME_SIZE * 2, flipFrameX(rightFn(f)), f, 2);
    blitFrame(sheet, FRAME_SIZE * 2, rightFn(f), f, 3);
  }
  return sheet;
}

// ============ capy_body_01 (기준 스프라이트) ============
const body01Sheet = buildDirSheet(buildBodyDownFrame, buildBodyUpFrame, buildBodyRightFrame);
savePng('capy_body_01', FRAME_SIZE * 4, FRAME_SIZE * 4, body01Sheet);

// §6 A8 자체 점검(생성 스크립트 단계에서도 조기 검증): frame1 === frame3 (모든 방향)
{
  for (const [idx, fn] of [[0, buildBodyDownFrame], [1, buildBodyUpFrame], [3, buildBodyRightFrame]]) {
    const f1 = fn(1);
    const f3 = fn(3);
    if (!framesEqual(f1, f3)) {
      throw new Error(`gen-sprites: capy_body_01 dir=${idx} frame1 !== frame3 — ART.md §3.1 의도 위반`);
    }
  }
}

// ============ capy_body_02~04 (팔레트 스왑) ============
for (const [variantName, nameMap] of Object.entries(BODY_RECOLOR_MAPS)) {
  const recolored = recolorBuffer(body01Sheet, nameMap);
  savePng(variantName, FRAME_SIZE * 4, FRAME_SIZE * 4, recolored);
}

// ============ capy_outfit_00~04 ============
for (let id = 0; id <= 4; id++) {
  const sheet = buildDirSheet(
    (f) => buildOutfitFrame(id, 'down', f),
    (f) => buildOutfitFrame(id, 'up', f),
    (f) => buildOutfitFrame(id, 'right', f)
  );
  savePng(`capy_outfit_${String(id).padStart(2, '0')}`, FRAME_SIZE * 4, FRAME_SIZE * 4, sheet);
}

// ============ capy_hat_00~03 ============
for (let id = 0; id <= 3; id++) {
  const sheet = buildDirSheet(
    (f) => buildHatFrame(id, 'down', f),
    (f) => buildHatFrame(id, 'up', f),
    (f) => buildHatFrame(id, 'right', f)
  );
  savePng(`capy_hat_${String(id).padStart(2, '0')}`, FRAME_SIZE * 4, FRAME_SIZE * 4, sheet);
}

// ============ goblin_walk / goblin_idle ============
const goblinWalkSheet = buildDirSheet(buildGoblinWalkDownFrame, buildGoblinWalkUpFrame, buildGoblinWalkRightFrame);
savePng('goblin_walk', FRAME_SIZE * 4, FRAME_SIZE * 4, goblinWalkSheet);

for (const [idx, fn] of [[0, buildGoblinWalkDownFrame], [1, buildGoblinWalkUpFrame], [3, buildGoblinWalkRightFrame]]) {
  if (!framesEqual(fn(1), fn(3))) {
    throw new Error(`gen-sprites: goblin_walk dir=${idx} frame1 !== frame3 — ART.md §3.1/§3.3 의도 위반`);
  }
}

const goblinIdleSheet = buildIdleSheet(buildGoblinIdleDownFrame, buildGoblinIdleUpFrame, buildGoblinIdleRightFrame);
savePng('goblin_idle', FRAME_SIZE * 2, FRAME_SIZE * 4, goblinIdleSheet);

// ============ tiles ============
// tile_floor / tile_wall: 128×96 = 4변형(col) × 3구역(row). frameIndex = zone*4 + variant
// (SPEC_ZONES.md §2.2 "row는 방향이 아니라 구역" 규약. §5.4 수풀·§5.5 온천은 다음 호출이라
// tile_bush/tile_spa는 이번엔 기존 32×32 단일 프레임 그대로 둔다.)
{
  const sheet = createCanvas(FRAME_SIZE * 4, FRAME_SIZE * ZONE_COUNT);
  for (let zone = 0; zone < ZONE_COUNT; zone++) {
    for (let v = 0; v < 4; v++) blitFrame(sheet, FRAME_SIZE * 4, buildFloorVariant(zone, v), v, zone);
  }
  savePng('tile_floor', FRAME_SIZE * 4, FRAME_SIZE * ZONE_COUNT, sheet);
}
{
  const sheet = createCanvas(FRAME_SIZE * 4, FRAME_SIZE * ZONE_COUNT);
  for (let zone = 0; zone < ZONE_COUNT; zone++) {
    for (let v = 0; v < 4; v++) blitFrame(sheet, FRAME_SIZE * 4, buildWallVariant(zone, v), v, zone);
  }
  savePng('tile_wall', FRAME_SIZE * 4, FRAME_SIZE * ZONE_COUNT, sheet);
}
savePng('tile_shadow', FRAME_SIZE, FRAME_SIZE, buildShadow());
savePng('tile_bush', FRAME_SIZE, FRAME_SIZE, buildBush());
savePng('tile_spa', FRAME_SIZE, FRAME_SIZE, buildSpa());

// ============ markers ============
{
  const sheet = createCanvas(FRAME_SIZE * 3, FRAME_SIZE);
  for (let f = 0; f < 3; f++) blitFrame(sheet, FRAME_SIZE * 3, buildMissionFrame(f), f, 0);
  savePng('marker_mission', FRAME_SIZE * 3, FRAME_SIZE, sheet);
}
{
  const sheet = createCanvas(FRAME_SIZE * 2, FRAME_SIZE);
  for (let f = 0; f < 2; f++) blitFrame(sheet, FRAME_SIZE * 2, buildExitFrameIndex(f), f, 0);
  savePng('marker_exit', FRAME_SIZE * 2, FRAME_SIZE, sheet);
}

// ============ 대조 PNG: capy down f0 vs goblin down f0 (ART.md §7 2위 항목 판정용) ============
{
  const capyFrame = buildBodyDownFrame(0);
  const goblinFrame = buildGoblinWalkDownFrame(0);
  const gap = 4;
  const w = FRAME_SIZE * 2 + gap;
  const h = FRAME_SIZE;
  const canvas = createCanvas(w, h);
  blitFrame(canvas, w, capyFrame, 0, 0);
  // gap 열은 투명 유지(createCanvas 기본값)
  const goblinOffsetCanvas = createCanvas(w, h);
  // blitFrame은 32px 그리드 단위 col/row만 받으므로 gap을 넣기 위해 goblin은 별도 버퍼에 두고 직접 복사한다.
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const si = (y * FRAME_SIZE + x) * 4;
      const di = (y * w + (FRAME_SIZE + gap + x)) * 4;
      canvas[di] = goblinFrame[si];
      canvas[di + 1] = goblinFrame[si + 1];
      canvas[di + 2] = goblinFrame[si + 2];
      canvas[di + 3] = goblinFrame[si + 3];
    }
  }
  const png = encodePng(w, h, canvas);
  writeFileSync(join(OUT_DEBUG_DIR, 'contrast_capy_vs_goblin.png'), png);
}

console.log(`gen-sprites: OK — ${written.length}개 PNG 생성`);
for (const w of written) {
  console.log(`  ${w.name}.png  ${w.width}x${w.height}  ${w.bytes}B`);
}
console.log('gen-sprites: 대조 PNG -> scripts/out/contrast_capy_vs_goblin.png (커밋 대상 아님, 판정용)');
