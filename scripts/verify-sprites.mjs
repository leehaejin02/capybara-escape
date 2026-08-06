/**
 * verify-sprites.mjs — public/assets/*.png 를 픽셀 판독만으로 기계 검사한다.
 *
 * 이 세션 지시(tech 태스크 "자체 검증")가 요구한 7항목만 구현한다:
 *   1. 팔레트 준수(알파 0 제외)
 *   2. 알파 이진(0 또는 255)
 *   3. 시트 크기가 ART.md §2.2와 일치
 *   4. 오버레이 투명 배경 (_00은 전부 알파 0, 나머지는 프레임마다 알파 0 픽셀 존재)
 *   5. walk 시트의 각 방향에서 frame1 === frame3 (바이트 완전 동일)
 *   6. 오버레이 bbox가 HAT_BOX/OUTFIT_BOX(+FRAME_DY 오프셋) 안
 *   7. 오버레이(비-_00)가 쓰는 색이 2개 이상 (알파 0 제외) — 이 항목의 임계값은
 *      이번 세션 지시에 "2개 이상"으로 명시됐다. ART.md §3.2 규칙4 원문은 "3개 이상
 *      (주색+보조색+ink)"이다 — 이 스크립트는 지시받은 2를 그대로 구현하고 불일치를
 *      보고서에 남긴다. 실제 생성된 오버레이는 전부 3색 이상이라 어느 임계값으로도 통과한다.
 *   8. A13 외곽선 닫힘 (§1.2 C5, 2026-08-07 추가): capy_body_N·goblin_walk·goblin_idle의
 *      모든 프레임에서, 알파≠0 픽셀 중 4-이웃 하나라도 알파 0(또는 프레임 밖)인 픽셀은
 *      전부 ink(#16121C)여야 한다. 디테일(주둥이 패치·허리띠 등)이 외곽선보다 나중에
 *      찍히면서 1px 구멍을 내는 실수를 기계로 잡는다.
 *
 * ART.md §6의 A7(좌우대칭)/A10(몸통 2색)/A11(명도)/A12(타일 이음매)는 이번 범위에
 * 없으므로 여기서 검사하지 않는다 — 구현하지 않았다는 사실을 그대로 보고한다 (하네스 14).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from './lib/png.mjs';
import { PALETTE, hexToRgb } from './lib/palette.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'public', 'assets');

const PALETTE_SET = new Set(Object.values(PALETTE).map((h) => h.toUpperCase()));

const EXPECTED_SIZE = {
  capy_body_01: [128, 128],
  capy_body_02: [128, 128],
  capy_body_03: [128, 128],
  capy_body_04: [128, 128],
  capy_outfit_00: [128, 128],
  capy_outfit_01: [128, 128],
  capy_outfit_02: [128, 128],
  capy_outfit_03: [128, 128],
  capy_outfit_04: [128, 128],
  capy_hat_00: [128, 128],
  capy_hat_01: [128, 128],
  capy_hat_02: [128, 128],
  capy_hat_03: [128, 128],
  goblin_walk: [128, 128],
  goblin_idle: [64, 128],
  tile_floor: [128, 32],
  tile_wall: [32, 32],
  tile_bush: [32, 32],
  tile_spa: [32, 32],
  marker_mission: [96, 32],
  marker_exit: [64, 32],
};

const WALK_SHEETS = ['capy_body_01', 'capy_body_02', 'capy_body_03', 'capy_body_04', 'goblin_walk'];
const OVERLAY_00 = ['capy_outfit_00', 'capy_hat_00'];
const OVERLAY_NON00 = [
  'capy_outfit_01',
  'capy_outfit_02',
  'capy_outfit_03',
  'capy_outfit_04',
  'capy_hat_01',
  'capy_hat_02',
  'capy_hat_03',
];

const FRAME_DY = [0, -1, 0, -1];
const FRAME_SIZE = 32;

// ART.md §3.2 (2026-08-07 개정) — dir index: 0 down, 1 up, 2 left, 3 right
const HAT_BOX = {
  0: { x0: 7, x1: 24, y0: 3, y1: 12 },
  1: { x0: 7, x1: 24, y0: 3, y1: 12 },
  2: { x0: 1, x1: 16, y0: 3, y1: 12 },
  3: { x0: 15, x1: 30, y0: 3, y1: 12 },
};
const OUTFIT_BOX = {
  0: { x0: 6, x1: 25, y0: 15, y1: 28 },
  1: { x0: 6, x1: 25, y0: 15, y1: 28 },
  2: { x0: 5, x1: 29, y0: 14, y1: 28 },
  3: { x0: 2, x1: 26, y0: 14, y1: 28 },
};

const failures = [];
const notes = [];

function fail(msg) {
  failures.push(msg);
}

function listPngFiles() {
  return readdirSync(ASSETS_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort();
}

function loadAll() {
  const files = listPngFiles();
  const images = {};
  for (const f of files) {
    const name = f.replace(/\.png$/, '');
    images[name] = decodePng(readFileSync(join(ASSETS_DIR, f)));
  }
  return images;
}

function getPixel(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function getFrame(img, colFrameSize, col, row) {
  const buf = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE * 4);
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const sx = col * FRAME_SIZE + x;
      const sy = row * FRAME_SIZE + y;
      const si = (sy * img.width + sx) * 4;
      const di = (y * FRAME_SIZE + x) * 4;
      buf[di] = img.data[si];
      buf[di + 1] = img.data[si + 1];
      buf[di + 2] = img.data[si + 2];
      buf[di + 3] = img.data[si + 3];
    }
  }
  return buf;
}

function framesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const images = loadAll();
const names = Object.keys(images);

if (names.length === 0) {
  console.error('verify-sprites: 치명적 오류 — public/assets/*.png 가 0개다.');
  process.exit(1);
}

// ---- 1. 팔레트 준수 + 2. 알파 이진 (한 패스로 같이 훑는다) ----
for (const name of names) {
  const img = images[name];
  let paletteViolations = 0;
  let alphaViolations = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a !== 0 && a !== 255) alphaViolations++;
    if (a !== 0) {
      const hex = `#${[img.data[i], img.data[i + 1], img.data[i + 2]]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
      if (!PALETTE_SET.has(hex)) paletteViolations++;
    }
  }
  if (paletteViolations > 0) fail(`[A1 팔레트] ${name}.png: 팔레트 밖 픽셀 ${paletteViolations}개`);
  if (alphaViolations > 0) fail(`[A2 알파] ${name}.png: 알파 ∉ {0,255} 픽셀 ${alphaViolations}개`);
}

// ---- 3. 시트 크기 ----
for (const [name, [w, h]] of Object.entries(EXPECTED_SIZE)) {
  const img = images[name];
  if (!img) {
    fail(`[A3 크기] ${name}.png: 파일 없음`);
    continue;
  }
  if (img.width !== w || img.height !== h) {
    fail(`[A3 크기] ${name}.png: 기대 ${w}x${h}, 실제 ${img.width}x${img.height}`);
  }
}
for (const name of names) {
  if (!(name in EXPECTED_SIZE)) notes.push(`[A3 참고] ${name}.png: ART.md §2.2 목록 밖 파일(검사 대상 아님)`);
}

// ---- 4. 오버레이 투명 배경 ----
for (const name of OVERLAY_00) {
  const img = images[name];
  if (!img) continue;
  let opaque = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0) opaque++;
  if (opaque > 0) fail(`[A5 _00 완전투명] ${name}.png: 알파≠0 픽셀 ${opaque}개 (0이어야 함)`);
}
for (const name of OVERLAY_NON00) {
  const img = images[name];
  if (!img) continue;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const frame = getFrame(img, FRAME_SIZE, col, row);
      let hasTransparent = false;
      for (let i = 3; i < frame.length; i += 4) {
        if (frame[i] === 0) {
          hasTransparent = true;
          break;
        }
      }
      if (!hasTransparent) fail(`[A4 투명배경] ${name}.png dir=${row} frame=${col}: 알파0 픽셀이 없다`);
    }
  }
}

// ---- 5. walk 프레임1 === 프레임3 ----
for (const name of WALK_SHEETS) {
  const img = images[name];
  if (!img) continue;
  for (let row = 0; row < 4; row++) {
    const f1 = getFrame(img, FRAME_SIZE, 1, row);
    const f3 = getFrame(img, FRAME_SIZE, 3, row);
    if (!framesEqual(f1, f3)) fail(`[A8 통과포즈] ${name}.png dir=${row}: frame1 !== frame3`);
  }
}

// ---- 6. 오버레이 bbox ----
function checkAnchor(name, box) {
  const img = images[name];
  if (!img) return;
  for (let row = 0; row < 4; row++) {
    const b = box[row]; // row === dir index (0 down/1 up/2 left/3 right)
    for (let col = 0; col < 4; col++) {
      const dy = FRAME_DY[col]; // FRAME_DY는 방향이 아니라 walk 프레임(col) 인덱스로 적용된다 (ART.md §3.1)
      const frame = getFrame(img, FRAME_SIZE, col, row);
      for (let y = 0; y < FRAME_SIZE; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
          const i = (y * FRAME_SIZE + x) * 4;
          if (frame[i + 3] === 0) continue;
          const boxY0 = b.y0 + dy;
          const boxY1 = b.y1 + dy;
          if (x < b.x0 || x > b.x1 || y < boxY0 || y > boxY1) {
            fail(
              `[A6 앵커] ${name}.png dir=${row} frame=${col}: (${x},${y}) 박스 밖 (x[${b.x0},${b.x1}] y[${boxY0},${boxY1}])`
            );
            return; // 방향당 한 번만 보고 (같은 문제 반복 보고 방지)
          }
        }
      }
    }
  }
}

for (const name of ['capy_hat_01', 'capy_hat_02', 'capy_hat_03']) checkAnchor(name, HAT_BOX);
for (const name of ['capy_outfit_01', 'capy_outfit_02', 'capy_outfit_03', 'capy_outfit_04']) checkAnchor(name, OUTFIT_BOX);

// ---- 7. 오버레이 다색 (임계값 2 — 지시 원문. ART.md §3.2 규칙4는 3) ----
for (const name of OVERLAY_NON00) {
  const img = images[name];
  if (!img) continue;
  const colors = new Set();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    colors.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
  }
  if (colors.size < 2) fail(`[A9 다색] ${name}.png: 서로 다른 색 ${colors.size}개 (2개 이상 필요)`);
}

// ---- 8. A13 외곽선 닫힘 (ART.md §6 A13 / §1.2 C5) ----
// 대상: 캐릭터 스프라이트 전부. 프레임 단위로 검사한다 — 시트 상의 이웃 프레임 픽셀이
// 경계 판정에 끼어들면 안 되기 때문이다(프레임 밖 = 캔버스 밖으로 취급).
const INK_RGB = hexToRgb(PALETTE.ink);
const A13_TARGETS = {
  capy_body_01: 4,
  capy_body_02: 4,
  capy_body_03: 4,
  capy_body_04: 4,
  goblin_walk: 4,
  goblin_idle: 2, // 64×128 — 2프레임 × 4방향
};
for (const [name, cols] of Object.entries(A13_TARGETS)) {
  const img = images[name];
  if (!img) continue;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < cols; col++) {
      const frame = getFrame(img, FRAME_SIZE, col, row);
      const alphaAt = (x, y) => {
        if (x < 0 || y < 0 || x >= FRAME_SIZE || y >= FRAME_SIZE) return 0; // 프레임 밖 = 투명
        return frame[(y * FRAME_SIZE + x) * 4 + 3];
      };
      let violations = 0;
      let firstViolation = null;
      for (let y = 0; y < FRAME_SIZE; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
          const i = (y * FRAME_SIZE + x) * 4;
          if (frame[i + 3] === 0) continue;
          const isBoundary =
            alphaAt(x - 1, y) === 0 || alphaAt(x + 1, y) === 0 || alphaAt(x, y - 1) === 0 || alphaAt(x, y + 1) === 0;
          if (!isBoundary) continue;
          const isInk = frame[i] === INK_RGB[0] && frame[i + 1] === INK_RGB[1] && frame[i + 2] === INK_RGB[2];
          if (!isInk) {
            violations++;
            if (!firstViolation) firstViolation = [x, y];
          }
        }
      }
      if (violations > 0) {
        fail(
          `[A13 외곽선] ${name}.png dir=${row} frame=${col}: 경계 픽셀 중 ink 아닌 것 ${violations}개 (첫 위반 (${firstViolation[0]},${firstViolation[1]}))`
        );
      }
    }
  }
}

// ---- 결과 ----
if (notes.length > 0) {
  console.log('verify-sprites: 참고');
  for (const n of notes) console.log(`  ${n}`);
}

if (failures.length > 0) {
  console.error(`verify-sprites: 실패 — ${failures.length}건`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`verify-sprites: OK — ${names.length}개 PNG, 8항목(A13 포함) 전부 통과`);
console.log('verify-sprites: 미구현(범위 밖, ART.md §6 참고): A7 좌우대칭, A10 몸통2색, A11 명도조건, A12 타일이음매');
process.exit(0);
