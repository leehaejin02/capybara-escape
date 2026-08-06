/**
 * preview-tiles.mjs — 이번 세션 완료 기준 6·7번 판정용 미리보기 PNG를 만든다.
 * 커밋 대상 아님 (scripts/out/은 .gitignore). 검증 후 삭제해도 무방하다.
 *
 * 6. 타일 이음매: 각 타일을 4×4로 반복 배치 — 격자가 도드라지는지 육안 판정용.
 * 7. 캐릭터 가독성: 새 floor 위에 카피바라(down f0)·고블린(down f0)을 얹어 묻히는지 판정용.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './lib/png.mjs';
import { createCanvas, blitFrame, FRAME_SIZE } from './lib/canvas.mjs';
import { buildFloorVariant, buildWall, buildBush, buildSpa } from './lib/tiles.mjs';
import { buildBodyDownFrame } from './lib/capybara.mjs';
import { buildGoblinWalkDownFrame } from './lib/goblin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
mkdirSync(OUT_DIR, { recursive: true });

function save(name, w, h, buf) {
  writeFileSync(join(OUT_DIR, name), encodePng(w, h, buf));
  console.log(`wrote scripts/out/${name}`);
}

// ---- 6. 4x4 타일 반복 미리보기 ----
function tileRepeat4x4(buildFn, label) {
  const N = 4;
  const canvas = createCanvas(FRAME_SIZE * N, FRAME_SIZE * N);
  const frame = buildFn();
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      blitFrame(canvas, FRAME_SIZE * N, frame, col, row);
    }
  }
  save(`tilerepeat_${label}.png`, FRAME_SIZE * N, FRAME_SIZE * N, canvas);
}

// tile_floor: 4변형을 체스판처럼 섞어 배치 — GameScene.ts가 쓰는 실제 공식
// `variant = (col * 7 + row * 13) % 4`을 그대로 재현한다.
{
  const N = 8; // 8x8이면 4변형이 충분히 섞여 보인다
  const canvas = createCanvas(FRAME_SIZE * N, FRAME_SIZE * N);
  const variants = [0, 1, 2, 3].map(buildFloorVariant);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const v = (col * 7 + row * 13) % 4;
      blitFrame(canvas, FRAME_SIZE * N, variants[v], col, row);
    }
  }
  save('tilerepeat_floor_mixed.png', FRAME_SIZE * N, FRAME_SIZE * N, canvas);
}

tileRepeat4x4(buildWall, 'wall');
tileRepeat4x4(buildBush, 'bush');
tileRepeat4x4(buildSpa, 'spa');

// ---- 7. 캐릭터 가독성: floor variant 위에 카피바라/고블린 배치 ----
{
  const cols = 4;
  const rows = 2;
  const canvas = createCanvas(FRAME_SIZE * cols, FRAME_SIZE * rows);
  const variants = [0, 1, 2, 3].map(buildFloorVariant);
  // 1행: floor variant 0~3 단독
  for (let c = 0; c < 4; c++) blitFrame(canvas, FRAME_SIZE * cols, variants[c], c, 0);
  // 2행: floor variant 위에 카피바라/고블린을 겹쳐 합성
  const capy = buildBodyDownFrame(0);
  const goblin = buildGoblinWalkDownFrame(0);
  function compositeOnto(dstCanvas, dstWidth, floorFrame, charFrame, col, row) {
    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const fi = (y * FRAME_SIZE + x) * 4;
        const di = ((row * FRAME_SIZE + y) * dstWidth + (col * FRAME_SIZE + x)) * 4;
        const srcA = charFrame[fi + 3];
        if (srcA !== 0) {
          dstCanvas[di] = charFrame[fi];
          dstCanvas[di + 1] = charFrame[fi + 1];
          dstCanvas[di + 2] = charFrame[fi + 2];
          dstCanvas[di + 3] = 255;
        } else {
          dstCanvas[di] = floorFrame[fi];
          dstCanvas[di + 1] = floorFrame[fi + 1];
          dstCanvas[di + 2] = floorFrame[fi + 2];
          dstCanvas[di + 3] = 255;
        }
      }
    }
  }
  compositeOnto(canvas, FRAME_SIZE * cols, variants[0], capy, 0, 1);
  compositeOnto(canvas, FRAME_SIZE * cols, variants[1], goblin, 1, 1);
  compositeOnto(canvas, FRAME_SIZE * cols, variants[2], capy, 2, 1);
  compositeOnto(canvas, FRAME_SIZE * cols, variants[3], goblin, 3, 1);
  save('readability_char_on_floor.png', FRAME_SIZE * cols, FRAME_SIZE * rows, canvas);
}

// 벽 위에서도 확인 (충돌 경계 근처에 캐릭터가 서는 경우가 실제로 많다)
{
  const cols = 2;
  const rows = 1;
  const canvas = createCanvas(FRAME_SIZE * cols, FRAME_SIZE * rows);
  const wall = buildWall();
  const capy = buildBodyDownFrame(0);
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const fi = (y * FRAME_SIZE + x) * 4;
      for (const col of [0, 1]) {
        const di = (y * FRAME_SIZE * cols + (col * FRAME_SIZE + x)) * 4;
        const useChar = col === 1 && capy[fi + 3] !== 0;
        const src = useChar ? capy : wall;
        canvas[di] = src[fi];
        canvas[di + 1] = src[fi + 1];
        canvas[di + 2] = src[fi + 2];
        canvas[di + 3] = 255;
      }
    }
  }
  save('readability_char_on_wall.png', FRAME_SIZE * cols, FRAME_SIZE * rows, canvas);
}

console.log('preview-tiles: done');
