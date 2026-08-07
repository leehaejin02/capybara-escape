/**
 * preview-tiles.mjs — 육안 판정용 미리보기 PNG를 만든다. 커밋 대상 아님(scripts/out/은 .gitignore).
 *
 * 2026-08-07 tech (SPEC_ZONES 1단계): 벽·바닥이 zone 인식형(zone,variant)으로 바뀌어
 * 호출부를 갱신했고, docs/SPEC_ZONES.md §9가 "이번 스펙 최대의 베팅"으로 지목한 두 판정용
 * 대조 PNG를 추가했다:
 *   A. contrast_wall_long_vs_short.png — 가로 긴 벽 구간(##########)과 짧은 벽 구간(#..#)을
 *      한 화면에(3구역 스택) 넣어 "벽이 서 있는 구조물로 읽히는가"를 판정한다.
 *   B. contrast_zones_room.png — 동일한 방 하나를 3구역 스킨으로 나란히 붙여
 *      "세 구역이 다른 장소로 읽히는가"를 판정한다.
 * 둘 다 upscale-preview.mjs가 자동으로 ×6 확대본도 만든다(파일명에 '_x6'가 안 붙은
 * PNG를 전부 훑으므로 별도 배선 불필요).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './lib/png.mjs';
import { createCanvas, blitFrame, FRAME_SIZE } from './lib/canvas.mjs';
import { buildFloorVariant, buildWallVariant, buildShadow, buildBushVariant, buildSpaVariant } from './lib/tiles.mjs';
import { buildPropFrame } from './lib/props.mjs';
import { buildBodyDownFrame } from './lib/capybara.mjs';
import { buildGoblinWalkDownFrame } from './lib/goblin.mjs';
import { ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE, zoneOfRow } from './lib/zones.mjs';
import { MAP_ROWS } from './lib/map-data.mjs';
import { propAt } from './lib/prop-placement.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
mkdirSync(OUT_DIR, { recursive: true });

const ZONES = [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE];
const ZONE_NAMES = { [ZONE_FOREST]: 'forest', [ZONE_VILLAGE]: 'village', [ZONE_CAVE]: 'cave' };

function save(name, w, h, buf) {
  writeFileSync(join(OUT_DIR, name), encodePng(w, h, buf));
  console.log(`wrote scripts/out/${name}`);
}

/**
 * 문자맵(rows: string[])을 실제 렌더 규칙 그대로(§3.1 남북 이웃 마스크, §5.3 floor variant)
 * 한 zone으로 구워 하나의 캔버스로 합성한다. 배열 밖은 "바닥(비-벽)"으로 취급한다 —
 * 고립된 조각을 미리보기로 뜰 때 위/아래 가장자리가 실제 방의 위·아래 테두리처럼
 * 보이게 하려는 것뿐이고(캡 라인·앞면이 자연스럽게 나온다), 판정 대상 로직(GameScene.ts의
 * frameIndex 계산)과는 무관한 미리보기 전용 편의다.
 */
function isWallAt(rows, col, row) {
  if (row < 0 || row >= rows.length) return false;
  const line = rows[row];
  if (col < 0 || col >= line.length) return false;
  return line[col] === '#';
}

/** alpha≠0 픽셀만 덮어쓰는 blit (드롭섀도 합성용 — GameScene.ts와 같은 "바닥 위에 얹는다" 순서). */
function blitFrameOver(dstBuf, dstWidth, frameBuf, col, row) {
  const ox = col * FRAME_SIZE;
  const oy = row * FRAME_SIZE;
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const fi = (y * FRAME_SIZE + x) * 4;
      if (frameBuf[fi + 3] === 0) continue;
      const di = ((oy + y) * dstWidth + (ox + x)) * 4;
      dstBuf[di] = frameBuf[fi];
      dstBuf[di + 1] = frameBuf[fi + 1];
      dstBuf[di + 2] = frameBuf[fi + 2];
      dstBuf[di + 3] = 255;
    }
  }
}

const SHADOW_FRAME = buildShadow();

/**
 * 2026-08-07 tech (재촬영 라운드): 드롭섀도를 빠뜨린 채 판정 PNG를 찍었다는 지적을 받아
 * §3.4 조건(isSolid(col,row-1)인 바닥 타일)대로 tile_shadow를 합성한다.
 * GameScene.ts:159~161과 동일한 조건 — "그 칸이 벽이 아니고, 북쪽이 벽" — 을 그대로 쓴다.
 */
function buildMapCanvas(zone, rows) {
  const cols = rows[0].length;
  const canvas = createCanvas(FRAME_SIZE * cols, FRAME_SIZE * rows.length);
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = rows[row][col];
      let frame;
      if (ch === '#') {
        const northSolid = isWallAt(rows, col, row - 1);
        const southSolid = isWallAt(rows, col, row + 1);
        const variant = (northSolid ? 2 : 0) + (southSolid ? 1 : 0);
        frame = buildWallVariant(zone, variant);
      } else {
        const variant = (col * 7 + row * 13) % 4;
        frame = buildFloorVariant(zone, variant);
      }
      blitFrame(canvas, FRAME_SIZE * cols, frame, col, row);
      if (ch !== '#' && isWallAt(rows, col, row - 1)) {
        blitFrameOver(canvas, FRAME_SIZE * cols, SHADOW_FRAME, col, row);
      }
    }
  }
  return canvas;
}

/** 세로로 두 캔버스(같은 폭)를 gapRows(투명)만큼 띄워 이어붙인다. */
function stackVertical(canvases, widthCols, gapRows) {
  const totalH = canvases.reduce((sum, c) => sum + c.h, 0) + gapRows * FRAME_SIZE * (canvases.length - 1);
  const w = widthCols * FRAME_SIZE;
  const out = createCanvas(w, totalH);
  let y = 0;
  for (const c of canvases) {
    for (let yy = 0; yy < c.h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const si = (yy * w + xx) * 4;
        const di = ((y + yy) * w + xx) * 4;
        out[di] = c.buf[si];
        out[di + 1] = c.buf[si + 1];
        out[di + 2] = c.buf[si + 2];
        out[di + 3] = c.buf[si + 3];
      }
    }
    y += c.h + gapRows * FRAME_SIZE;
  }
  return { buf: out, w, h: totalH };
}

/** 가로로 캔버스들을 gapCols(투명)만큼 띄워 이어붙인다. */
function stackHorizontal(canvases, heightRows, gapCols) {
  const totalW = canvases.reduce((sum, c) => sum + c.w, 0) + gapCols * FRAME_SIZE * (canvases.length - 1);
  const h = heightRows * FRAME_SIZE;
  const out = createCanvas(totalW, h);
  let x = 0;
  for (const c of canvases) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < c.w; xx++) {
        const si = (yy * c.w + xx) * 4;
        const di = (yy * totalW + (x + xx)) * 4;
        out[di] = c.buf[si];
        out[di + 1] = c.buf[si + 1];
        out[di + 2] = c.buf[si + 2];
        out[di + 3] = c.buf[si + 3];
      }
    }
    x += c.w + gapCols * FRAME_SIZE;
  }
  return { buf: out, w: totalW, h };
}

// ============================================================
// A. 가로 긴 벽 vs 짧은 벽 대조 (SPEC_ZONES.md §9 "이번 스펙 최대의 베팅")
// 3행: 바닥/벽/바닥. 벽 행에 10칸 연속 벽(##########, "긴 벽")과 2칸짜리 틈(".." → "#..#"
// 형태의 "짧은 벽")을 한 줄에 같이 넣는다. 3구역을 세로로 쌓아 한 이미지에 담는다.
// ============================================================
{
  const wallRow = '######..##########..#####'; // 6# / 2. / 10#(요구 패턴 그대로) / 2. / 5#
  const cols = wallRow.length;
  const rows3 = ['.'.repeat(cols), wallRow, '.'.repeat(cols)];
  const perZone = ZONES.map((zone) => {
    const buf = buildMapCanvas(zone, rows3);
    return { buf, w: cols * FRAME_SIZE, h: rows3.length * FRAME_SIZE };
  });
  const combined = stackVertical(perZone, cols, 1);
  save('contrast_wall_long_vs_short.png', combined.w, combined.h, combined.buf);
}

// ============================================================
// B. 세 구역 "같은 방" 나란히 대조 (SPEC_ZONES.md §9)
// 동일한 방 문자맵을 zone만 바꿔 3번 굽고 가로로 이어붙인다 — 방 모양이 같으므로
// 차이는 오직 구역 스킨(벽 색·무늬·바닥 색)뿐이다.
// ============================================================
{
  const ROOM_ROWS = [
    '############',
    '#..........#',
    '#..........#',
    '#....##....#',
    '#....##....#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '############',
  ];
  const perZone = ZONES.map((zone) => {
    const buf = buildMapCanvas(zone, ROOM_ROWS);
    return { buf, w: ROOM_ROWS[0].length * FRAME_SIZE, h: ROOM_ROWS.length * FRAME_SIZE };
  });
  const combined = stackHorizontal(perZone, ROOM_ROWS.length, 1);
  save('contrast_zones_room.png', combined.w, combined.h, combined.buf);
}

// ---- 타일 이음매 4x4 반복 미리보기 (구역별) ----
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
// `variant = (col * 7 + row * 13) % 4`을 그대로 재현한다. 구역별로 1장씩.
for (const zone of ZONES) {
  const N = 8; // 8x8이면 4변형이 충분히 섞여 보인다
  const canvas = createCanvas(FRAME_SIZE * N, FRAME_SIZE * N);
  const variants = [0, 1, 2, 3].map((v) => buildFloorVariant(zone, v));
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const v = (col * 7 + row * 13) % 4;
      blitFrame(canvas, FRAME_SIZE * N, variants[v], col, row);
    }
  }
  save(`tilerepeat_floor_mixed_${ZONE_NAMES[zone]}.png`, FRAME_SIZE * N, FRAME_SIZE * N, canvas);
}

// bush/spa는 이제 구역별로 다르다(SPEC_ZONES.md §5.4·§5.5) — 구역별 1장씩, layer 0(바탕)만.
for (const zone of ZONES) {
  tileRepeat4x4(() => buildBushVariant(zone, 0), `bush_${ZONE_NAMES[zone]}`);
  tileRepeat4x4(() => buildSpaVariant(zone), `spa_${ZONE_NAMES[zone]}`);
}

// ---- 캐릭터 가독성: floor variant 위에 카피바라/고블린 배치 (구역별) ----
for (const zone of ZONES) {
  const cols = 4;
  const rows = 2;
  const canvas = createCanvas(FRAME_SIZE * cols, FRAME_SIZE * rows);
  const variants = [0, 1, 2, 3].map((v) => buildFloorVariant(zone, v));
  for (let c = 0; c < 4; c++) blitFrame(canvas, FRAME_SIZE * cols, variants[c], c, 0);
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
  save(`readability_char_on_floor_${ZONE_NAMES[zone]}.png`, FRAME_SIZE * cols, FRAME_SIZE * rows, canvas);
}

// 벽 위에서도 확인 (충돌 경계 근처에 캐릭터가 서는 경우가 실제로 많다) — 구역별, variant0(윗면+앞면)
for (const zone of ZONES) {
  const cols = 2;
  const rows = 1;
  const canvas = createCanvas(FRAME_SIZE * cols, FRAME_SIZE * rows);
  const wall = buildWallVariant(zone, 0);
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
  save(`readability_char_on_wall_${ZONE_NAMES[zone]}.png`, FRAME_SIZE * cols, FRAME_SIZE * rows, canvas);
}

// ============================================================
// C. 소품이 배치된 실제 맵 구간 — 구역별 1장씩, 바닥+드롭섀도+소품 전부 합성.
// SPEC_ZONES.md §9 "소품 밀도 6%가 적절한가 미확인" — 밀도 판정용. 1단계에서 드롭섀도를
// 빠뜨렸던 실수를 반복하지 않기 위해 GameScene.ts와 같은 레이어(바닥<드롭섀도<소품<벽)를
// 전부 합성한다. 실제 MAP_ROWS·zoneOfRow·propAt을 그대로 써서 "구역별 1장"이 실제 게임에서
// 보일 화면과 동일하다 — 합성 전용 문자맵을 새로 짜지 않았다.
// ============================================================
{
  const ZONE_ROW_RANGE = {
    [ZONE_FOREST]: [0, 13],
    [ZONE_VILLAGE]: [13, 25],
    [ZONE_CAVE]: [25, 37],
  };
  const COL_START = 0;
  const COL_END = 25; // "화면(25×18타일)" 기준 폭(§4.1 근거 문단)과 맞춘 절반 구간

  for (const zone of ZONES) {
    const [rowStart, rowEnd] = ZONE_ROW_RANGE[zone];
    const cols = COL_END - COL_START;
    const rowsN = rowEnd - rowStart;
    const canvas = createCanvas(FRAME_SIZE * cols, FRAME_SIZE * rowsN);
    for (let row = rowStart; row < rowEnd; row++) {
      const line = MAP_ROWS[row];
      const z = zoneOfRow(row); // 항상 zone과 같다(ZONE_ROW_RANGE가 §5.1 그대로) — 방어적으로 다시 계산
      for (let col = COL_START; col < COL_END; col++) {
        const ch = line[col];
        const dstCol = col - COL_START;
        const dstRow = row - rowStart;
        let frame;
        if (ch === '#') {
          const northSolid = isWallAt(MAP_ROWS, col, row - 1);
          const southSolid = isWallAt(MAP_ROWS, col, row + 1);
          const variant = (northSolid ? 2 : 0) + (southSolid ? 1 : 0);
          frame = buildWallVariant(z, variant);
        } else if (ch === 'B') {
          frame = buildBushVariant(z, 0);
        } else if (ch === 'S') {
          frame = buildSpaVariant(z);
        } else {
          const variant = (col * 7 + row * 13) % 4;
          frame = buildFloorVariant(z, variant);
        }
        blitFrame(canvas, FRAME_SIZE * cols, frame, dstCol, dstRow);

        if (ch !== '#' && isWallAt(MAP_ROWS, col, row - 1)) {
          blitFrameOver(canvas, FRAME_SIZE * cols, SHADOW_FRAME, dstCol, dstRow);
        }

        if (ch === '.') {
          const prop = propAt(col, row);
          if (prop) {
            const propFrame = buildPropFrame(prop.zone, prop.index);
            blitFrameOver(canvas, FRAME_SIZE * cols, propFrame, dstCol, dstRow);
          }
        }

        if (ch === 'B') {
          // 캐노피(layer 1)까지 합성 — 실제 게임에서도 항상 그려진다(§6). 밀도 판정에는
          // 필요 없지만 "실제 화면과 동일"을 지키려면 뺄 이유가 없다.
          blitFrameOver(canvas, FRAME_SIZE * cols, buildBushVariant(z, 1), dstCol, dstRow);
        }
      }
    }
    save(`realmap_props_${ZONE_NAMES[zone]}.png`, FRAME_SIZE * cols, FRAME_SIZE * rowsN, canvas);
  }
}

// ============================================================
// D. 수풀 캐노피 — 캐릭터가 들어간 상태 vs 안 들어간 상태 비교. SPEC_ZONES.md §6의 유일한
// 판정 방법("잎이 카피바라를 덮어 숨었다가 화면에 보인다"). 실제 맵의 2×2 수풀 패치(숲,
// (9,2)-(10,3))를 그대로 쓴다 — layer 0(바탕) 4타일 → 캐릭터(있는 쪽만) → layer 1(캐노피)
// 4타일, GameScene.ts와 같은 깊이 순서(캐릭터 < 캐노피)로 합성한다.
// ============================================================
{
  const zone = ZONE_FOREST;
  const patchCols = 2;
  const patchRows = 2;
  const w = FRAME_SIZE * patchCols;
  const h = FRAME_SIZE * patchRows;

  // ox/oy=null이면 캐릭터를 그리지 않는다("들어가기 전"). 캐릭터가 있을 때는 두 스냅샷을 보여준다:
  // (가운데 정렬) 두 타일 경계에 걸친 "패치 중앙" 위치와, (타일0 정렬) 한 타일의 위쪽 절반
  // 캐노피가 그대로 겹치는 위치 — 실제 걷기 애니메이션이라면 플레이어가 이 사이 모든 위치를
  // 지나가므로 어느 한쪽만 보여주면 "골라 찍었다"는 인상을 줄 수 있어 둘 다 낸다.
  function buildPatch(charOffset) {
    const canvas = createCanvas(w, h);
    const base = buildBushVariant(zone, 0);
    for (let r = 0; r < patchRows; r++) for (let c = 0; c < patchCols; c++) blitFrame(canvas, w, base, c, r);
    if (charOffset) {
      const capy = buildBodyDownFrame(0);
      const { ox, oy } = charOffset;
      for (let y = 0; y < FRAME_SIZE; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
          const fi = (y * FRAME_SIZE + x) * 4;
          if (capy[fi + 3] === 0) continue;
          const di = ((oy + y) * w + (ox + x)) * 4;
          canvas[di] = capy[fi];
          canvas[di + 1] = capy[fi + 1];
          canvas[di + 2] = capy[fi + 2];
          canvas[di + 3] = 255;
        }
      }
    }
    const canopy = buildBushVariant(zone, 1);
    for (let r = 0; r < patchRows; r++) for (let c = 0; c < patchCols; c++) blitFrameOver(canvas, w, canopy, c, r);
    return canvas;
  }

  const before = { buf: buildPatch(null), w, h };
  const afterMid = { buf: buildPatch({ ox: (w - FRAME_SIZE) / 2, oy: (h - FRAME_SIZE) / 2 }), w, h };
  const afterAligned = { buf: buildPatch({ ox: 0, oy: 0 }), w, h };
  // 왼쪽부터: 안 들어감 / 패치 중앙(두 타일 경계에 걸침) / 타일0 정렬(캐노피 겹침 최대).
  const combined = stackHorizontal([before, afterMid, afterAligned], patchRows, 1);
  save('canopy_hide_before_after.png', combined.w, combined.h, combined.buf);
}

console.log('preview-tiles: done');
