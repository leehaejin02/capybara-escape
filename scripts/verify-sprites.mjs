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
 *
 * 2026-08-07 tech (SPEC_ZONES 1단계): W1~W5(docs/SPEC_ZONES.md §3.5)를 PNG 실측으로 추가했다.
 *   W1 크기는 EXPECTED_SIZE 갱신 + A3가 이미 검사한다(별도 재구현 없음).
 *   W2(C1-W)/W3(C2a~d)/W4/W5는 아래 새 섹션에서 tile_wall.png·tile_floor.png·tile_shadow.png를
 *   직접 픽셀 판독해 검사한다. W6(프레임 선택식)·W7(드롭섀도 배치 조건)은 **렌더 코드
 *   (GameScene.ts)의 로직 검사라 PNG 픽셀만으로 확인할 수 없다** — 이 스크립트는 정적 확인으로
 *   대신했다고 아래 콘솔 출력에 명시한다(하네스 14, 실측 아님을 숨기지 않는다).
 *
 * 2026-08-07 tech (SPEC_ZONES 2단계): R1~R5·Z-B1·C11/C12(docs/SPEC_ZONES.md §4.4·§5.4·§2.5)를
 * PNG 실측 + 실제 맵(scripts/lib/map-data.mjs) 기반으로 추가했다.
 *   R1(크기)은 EXPECTED_SIZE 갱신(props 128×96) + A3가 검사한다.
 *   R2(P1~P4)는 props.png 12프레임을 픽셀 판독해 검사한다. P5(무-애니메이션)·P6(지배색 C1)은
 *   이번 세션 지시가 명시한 R1/R2 범위 밖이라 여기서 검사하지 않는다(§4.4 R2 원문도 P1~P4만
 *   요구한다) — 미구현임을 콘솔에 남긴다.
 *   R3(배치 결정성)은 scripts/lib/prop-placement.mjs의 propAt()을 맵 전체에 대해 두 번(서로
 *   다른 시점에 재계산) 돌려 완전 동일한지 비교한다.
 *   R4(앵커·격자 회피)는 propAt()이 실제로 놓은 모든 소품에 대해 그 자리가 규칙을 어기지
 *   않는지 재검사한다.
 *   R5(sim 클리어율 불변)는 이 스크립트가 아니라 `npm run sim`을 별도 실행해 확인한다 —
 *   PNG 판독 스크립트가 sim CLI를 구동하는 것은 관심사 밖이라 여기 넣지 않는다(콘솔에 안내만).
 *   Z-B1(수풀 layer 0 조성비)·C11/C12(은신처 판별)는 tile_bush.png·tile_floor.png·
 *   tile_wall.png를 픽셀 판독해 면적(가중) 비율·평균 RGB로 실측한다 — docs/SPEC_ZONES.md §9가
 *   "면적 비율을 gd가 손으로 추정했다"고 명시한 값을 여기서 처음 실측으로 검증한다.
 *
 * 2026-08-07 tech (SPEC_ZONES §2.6 개정 — 숲 벽 재질 변경 라운드):
 *   C12의 wall̄ 정의를 WALL_FACE만(y19..31)에서 **variant0 프레임 전체(y0..31)**로 고쳤다
 *   (gd 확정, §2.6-a — 이전 판은 tech가 정의 공백에서 판단을 되돌려 보낸 것이었다).
 *   A22(신설) — 숲 벽(tile_wall zone=forest 4프레임)에 최대 RGB 채널이 G인 픽셀 0개
 *   ("숲에서 초록은 전부 통과 가능하다", §2.6-c / C13 / W8).
 *   A23(신설) — props.png 12프레임 전부에 tile_bush_dark·tile_bush_mid 0px (§4.3 P7).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from './lib/png.mjs';
import { PALETTE, PALETTE_PNG_EXEMPT_NAMES, hexToRgb } from './lib/palette.mjs';
import { ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE } from './lib/zones.mjs';
import { MAP_ROWS } from './lib/map-data.mjs';
import { propAt, ANCHORS, LATTICE_COLS, LATTICE_ROWS, ANCHOR_AVOID_TILES } from './lib/prop-placement.mjs';

const ZONE_LABELS = { [ZONE_FOREST]: '숲', [ZONE_VILLAGE]: '마을', [ZONE_CAVE]: '동굴' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'public', 'assets');

// A1(팔레트 준수) 대조 집합 = PNG 허용 28색 (ART.md §1.1). sky_soft·sky_pink는
// PNG에 0픽셀이어야 하므로("PNG 열 ✗") 이 대조 집합에서 제외한다 — 포함시키면
// 그 두 색이 실수로 PNG에 섞여도 A1이 통과시켜 버린다.
const PALETTE_SET = new Set(
  Object.entries(PALETTE)
    .filter(([name]) => !PALETTE_PNG_EXEMPT_NAMES.includes(name))
    .map(([, h]) => h.toUpperCase())
);

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
  // tile_floor/tile_wall: SPEC_ZONES.md §2.2 개정 — 128×32(4변형) → 128×96(4변형×3구역).
  tile_floor: [128, 96],
  tile_wall: [128, 96],
  tile_shadow: [32, 32], // 신규(SPEC_ZONES.md §3.4)
  tile_bush: [64, 96], // SPEC_ZONES.md §5.4 — 2 layer(바탕/캐노피) × 3구역
  tile_spa: [32, 96], // SPEC_ZONES.md §5.5 — 1 × 3구역(행 0·2가 행 1과 픽셀 동일)
  props: [128, 96], // SPEC_ZONES.md §4 — 4종 × 3구역 (R1)
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

/**
 * 팔레트 검사(A1)에서 제외되는 파일.
 *
 * 이 목록은 **코드로 생성하지 않은 에셋**만 담는다. 하나 추가할 때마다
 * `docs/ASSET_CREDITS.md`의 "게임에 포함되는 에셋" 표에도 반드시 적어야 한다 —
 * 여기서 조용히 빼고 출처를 안 남기면 그게 규정 위반이다(CLAUDE.md 하네스 10).
 *
 * - logo_title.png: 저장소 소유자가 Gemini로 생성한 타이틀 로고.
 *   16색 팔레트는 32×32 도트 스프라이트에 적용되는 규격이고, 이 로고는
 *   도트를 확대 렌더한 일러스트라 애초에 그 규격의 대상이 아니다.
 */
const PALETTE_EXEMPT = new Set(['logo_title.png']);

function listPngFiles() {
  return readdirSync(ASSETS_DIR)
    .filter((f) => f.endsWith('.png'))
    .filter((f) => !PALETTE_EXEMPT.has(f))
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

// ---- W1~W5 (docs/SPEC_ZONES.md §3.5) — tile_wall.png / tile_shadow.png / tile_floor.png 실측 ----
// W1(크기)은 EXPECTED_SIZE + A3가 이미 검사했다. 여기는 W2~W5.
function luminanceRgb(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** pixels: [[r,g,b], ...] 중 가장 많이 등장한 (r,g,b)를 돌려준다("배경/지배색" 실측). */
function dominantRgb(pixels) {
  const counts = new Map();
  for (const [r, g, b] of pixels) {
    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey.split(',').map(Number);
}

function framePixels(frame, x0, y0, x1, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * FRAME_SIZE + x) * 4;
      out.push([frame[i], frame[i + 1], frame[i + 2]]);
    }
  }
  return out;
}

const wallImg = images['tile_wall'];
const floorImg = images['tile_floor'];
const shadowImg = images['tile_shadow'];

if (!wallImg || !floorImg || !shadowImg) {
  fail('[W] tile_wall.png / tile_floor.png / tile_shadow.png 중 하나 이상이 없다 — W2~W5 검사 불가');
} else {
  // ---- W2: C1-W — 앞면이 있는 벽 프레임(variant 0·2)의 앞면 영역(y 18..31)에 쓰인
  // 모든 색이 L <= 117 ----
  // ⚠️ SPEC_ZONES.md §3.5 W2 원문은 "12개 벽 프레임"(전 variant)이라고 적었지만, 같은 문서
  // §3.2가 "variant 1·3은 y0..31 전체가 윗면이고 무늬가 y=31까지 이어진다"고 명시하며 이
  // 이어지는 무늬는 zone의 WALL_TOP(예: forest_wall_top L147, village_wall_top L168)를
  // 그대로 쓴다 — 즉 두 규칙이 서로 모순된다. C1-W의 존재 이유("캐릭터가 겹치는 구간은
  // 앞면(south=floor)뿐"이라는 §3.1 표의 구조, ART.md C1-W 원문 "위쪽 벽 타일과 겹치는 구간이
  // 정확히 여기다")로 보면 겹침은 남쪽이 바닥인 variant(0·2, hasFace=true)에서만 발생할 수
  // 있다 — 남쪽이 벽인 variant(1·3)는 그 아래에 캐릭터가 설 자리 자체가 없다. 그래서 이
  // 검사는 variant 0·2만 대상으로 한다. gd에 반려 대상으로 보고함(하네스 15) — 문항 자체를
  // 조용히 우회하지 않는다.
  for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
    for (const variant of [0, 2]) {
      const frame = getFrame(wallImg, FRAME_SIZE, variant, zone);
      const seen = new Set();
      for (let y = 18; y <= 31; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
          const i = (y * FRAME_SIZE + x) * 4;
          if (frame[i + 3] === 0) continue;
          seen.add(`${frame[i]},${frame[i + 1]},${frame[i + 2]}`);
        }
      }
      for (const key of seen) {
        const [r, g, b] = key.split(',').map(Number);
        const L = luminanceRgb(r, g, b);
        if (L > 117) {
          fail(
            `[W2 C1-W] tile_wall.png zone=${ZONE_LABELS[zone]} variant=${variant}: 앞면 영역(y18..31)에 L=${L.toFixed(1)}(>117)인 색 #${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')} 존재`
          );
        }
      }
    }
  }

  // ---- W3: 구역별 C2a~C2d ----
  // WALL_TOP/WALL_FACE/FLOOR는 순수 배경 채움 색이 최다 픽셀을 차지하도록 설계됐으므로
  // "지배색(가장 많이 등장하는 색)"으로 실측한다. SHADOW(ink)는 tile_shadow.png의 불투명
  // 픽셀 중 지배색.
  {
    const shadowPixels = [];
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const i = (y * shadowImg.width + x) * 4;
        if (shadowImg.data[i + 3] !== 0) shadowPixels.push([shadowImg.data[i], shadowImg.data[i + 1], shadowImg.data[i + 2]]);
      }
    }
    const [sr, sg, sb] = dominantRgb(shadowPixels);
    const shadowL = luminanceRgb(sr, sg, sb);

    for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
      const label = ZONE_LABELS[zone];
      // WALL_TOP: variant 3(북쪽모서리선 없음, 앞면 없음 — 전체가 윗면 채움+무늬)의 전체 지배색
      const topFrame = getFrame(wallImg, FRAME_SIZE, 3, zone);
      const [tr, tg, tb] = dominantRgb(framePixels(topFrame, 0, 0, 31, 31));
      const topL = luminanceRgb(tr, tg, tb);

      // WALL_FACE: variant 0의 앞면 영역(y19..31) 지배색
      const faceFrame = getFrame(wallImg, FRAME_SIZE, 0, zone);
      const [fr, fg, fb] = dominantRgb(framePixels(faceFrame, 0, 19, 31, 31));
      const faceL = luminanceRgb(fr, fg, fb);

      // FLOOR: floor variant 0 전체 지배색
      const floorFrame = getFrame(floorImg, FRAME_SIZE, 0, zone);
      const [flr, flg, flb] = dominantRgb(framePixels(floorFrame, 0, 0, 31, 31));
      const floorL = luminanceRgb(flr, flg, flb);

      const c2a = Math.abs(topL - floorL);
      const c2b = topL - faceL;
      const c2c = floorL - shadowL;
      const c2d = floorL - faceL;

      if (c2a < 30) fail(`[W3 C2a] ${label}: |L(WALL_TOP)${topL.toFixed(1)} - L(FLOOR)${floorL.toFixed(1)}| = ${c2a.toFixed(1)} < 30`);
      if (c2b < 35) fail(`[W3 C2b] ${label}: L(WALL_TOP)${topL.toFixed(1)} - L(WALL_FACE)${faceL.toFixed(1)} = ${c2b.toFixed(1)} < 35`);
      if (c2c < 30) fail(`[W3 C2c] ${label}: L(FLOOR)${floorL.toFixed(1)} - L(SHADOW)${shadowL.toFixed(1)} = ${c2c.toFixed(1)} < 30`);
      if (c2d < 25) fail(`[W3 C2d] ${label}: L(FLOOR)${floorL.toFixed(1)} - L(WALL_FACE)${faceL.toFixed(1)} = ${c2d.toFixed(1)} < 25`);
    }
  }

  // ---- W4: variant 1·3의 y∈{17,18} 행에 ink 전 구간 줄이 없다(앞면이 없어야 한다) ----
  for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
    for (const variant of [1, 3]) {
      const frame = getFrame(wallImg, FRAME_SIZE, variant, zone);
      for (const y of [17, 18]) {
        let allInk = true;
        for (let x = 0; x < FRAME_SIZE; x++) {
          const i = (y * FRAME_SIZE + x) * 4;
          if (frame[i + 3] === 0 || frame[i] !== INK_RGB[0] || frame[i + 1] !== INK_RGB[1] || frame[i + 2] !== INK_RGB[2]) {
            allInk = false;
            break;
          }
        }
        if (allInk) {
          fail(`[W4] tile_wall.png zone=${ZONE_LABELS[zone]} variant=${variant}: y=${y} 행 전체가 ink (앞면이 없어야 하는 variant인데 있다)`);
        }
      }
    }
  }

  // ---- W5: variant 0·1의 y=0 행이 전부 ink, variant 2·3은 아니다 ----
  for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
    for (let variant = 0; variant < 4; variant++) {
      const frame = getFrame(wallImg, FRAME_SIZE, variant, zone);
      let allInk = true;
      for (let x = 0; x < FRAME_SIZE; x++) {
        const i = (0 * FRAME_SIZE + x) * 4;
        if (frame[i + 3] === 0 || frame[i] !== INK_RGB[0] || frame[i + 1] !== INK_RGB[1] || frame[i + 2] !== INK_RGB[2]) {
          allInk = false;
          break;
        }
      }
      const shouldBeInk = variant === 0 || variant === 1;
      if (shouldBeInk && !allInk) {
        fail(`[W5] tile_wall.png zone=${ZONE_LABELS[zone]} variant=${variant}: y=0 행이 전부 ink가 아니다 (북쪽 모서리선이 있어야 함)`);
      }
      if (!shouldBeInk && allInk) {
        fail(`[W5] tile_wall.png zone=${ZONE_LABELS[zone]} variant=${variant}: y=0 행이 전부 ink다 (북쪽 모서리선이 없어야 함)`);
      }
    }
  }
}

notes.push('[W6/W7 참고] 렌더 코드(GameScene.ts) 로직 검사라 PNG 픽셀만으로 확인 불가 — tech가 소스 정적 확인으로 대신함(실측 아님, 하네스 14)');

// ---- R1/R2 (docs/SPEC_ZONES.md §4.4) — props.png 12프레임 실측 ----
// R1(크기)은 EXPECTED_SIZE(props: 128×96) + A3가 이미 검사했다. 여기는 R2(P1~P4)만.
{
  const propsImg = images['props'];
  if (!propsImg) {
    fail('[R2] props.png 없음 — 검사 불가');
  } else {
    const GOBLIN_HEXES = new Set(
      [PALETTE.goblin_dark, PALETTE.goblin_mid, PALETTE.goblin_shadow].map((h) => h.toUpperCase())
    );
    const AMBER_HEX = PALETTE.accent_amber.toUpperCase();
    for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
      for (let index = 0; index < 4; index++) {
        const frame = getFrame(propsImg, FRAME_SIZE, index, zone);
        let minX = FRAME_SIZE;
        let maxX = -1;
        let minY = FRAME_SIZE;
        let maxY = -1;
        let alphaCount = 0;
        let goblinCount = 0;
        let amberCount = 0;
        for (let y = 0; y < FRAME_SIZE; y++) {
          for (let x = 0; x < FRAME_SIZE; x++) {
            const i = (y * FRAME_SIZE + x) * 4;
            if (frame[i + 3] === 0) continue;
            alphaCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const hex = `#${[frame[i], frame[i + 1], frame[i + 2]]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('')}`.toUpperCase();
            if (GOBLIN_HEXES.has(hex)) goblinCount++;
            if (hex === AMBER_HEX) amberCount++;
          }
        }
        const label = `props.png zone=${ZONE_LABELS[zone]} index=${index}`;
        if (alphaCount === 0) {
          fail(`[R2 P1] ${label}: 알파≠0 픽셀이 0개(빈 프레임)`);
        } else {
          const w = maxX - minX + 1;
          const h = maxY - minY + 1;
          if (w > 20 || h > 20) fail(`[R2 P1] ${label}: bbox ${w}x${h} (>20x20)`);
        }
        if (goblinCount > 0) fail(`[R2 P2] ${label}: 고블린색(goblin_dark/mid/shadow) 픽셀 ${goblinCount}개 (0이어야 함)`);
        if (amberCount > 8) fail(`[R2 P3] ${label}: accent_amber 픽셀 ${amberCount}개 (>8)`);
        if (alphaCount > 150) fail(`[R2 P4] ${label}: 알파≠0 픽셀 ${alphaCount}개 (>150)`);
      }
    }
  }
}
notes.push(
  '[R2 참고] P5(무-애니메이션)·P6(소품 지배색 C1)은 이번 세션 지시 범위(§4.4 R2: P1~P4) 밖이라 검사하지 않았다 — 미구현임을 그대로 남긴다(하네스 14)'
);

// ---- R3 (배치 결정성) — 실제 맵 전체를 두 번 계산해 완전히 같은지 비교 ----
{
  const cols = MAP_ROWS[0].length;
  const rowsN = MAP_ROWS.length;
  function computeAllProps() {
    const out = [];
    for (let row = 0; row < rowsN; row++) {
      for (let col = 0; col < cols; col++) out.push(propAt(col, row));
    }
    return out;
  }
  const passA = computeAllProps();
  const passB = computeAllProps();
  let mismatch = 0;
  for (let i = 0; i < passA.length; i++) {
    const a = passA[i];
    const b = passB[i];
    const same = (a === null && b === null) || (a !== null && b !== null && a.zone === b.zone && a.index === b.index);
    if (!same) mismatch++;
  }
  if (mismatch > 0) {
    fail(`[R3 결정성] 같은 맵을 두 번 계산했더니 소품 배치가 ${mismatch}칸에서 달랐다 (0이어야 함)`);
  }
}

// ---- R4 (앵커·순찰 격자 회피) — 실제로 놓인 모든 소품이 §4.1 회피 규칙을 지키는지 재검사 ----
{
  let violations = 0;
  let placedCount = 0;
  for (let row = 0; row < MAP_ROWS.length; row++) {
    const line = MAP_ROWS[row];
    for (let col = 0; col < line.length; col++) {
      const p = propAt(col, row);
      if (!p) continue;
      placedCount++;
      const nearAnchor = ANCHORS.some(
        (a) => Math.max(Math.abs(a.col - col), Math.abs(a.row - row)) <= ANCHOR_AVOID_TILES
      );
      const onGrid = LATTICE_COLS.includes(col) || LATTICE_ROWS.includes(row);
      if (nearAnchor || onGrid) violations++;
    }
  }
  if (violations > 0) {
    fail(`[R4] 앵커(M/E/P/G) 2타일 이내 또는 순찰 격자(col∈{6,18,30,42}·row∈{7,19,31}) 위에 놓인 소품 ${violations}개 (0개여야 함)`);
  }
  notes.push(`[R4 참고] 실제 맵 전체 소품 개수 ${placedCount}개 (SPEC_ZONES.md §4.1 설계값: 약 75개)`);
}

notes.push('[R5 참고] 이 스크립트(PNG 픽셀 판독)는 sim CLI를 구동하지 않는다 — `npm run sim`을 별도로 실행해 클리어율이 소품 도입 전후로 동일한지 확인한다(하네스 14)');

// ---- Z-B1 (docs/SPEC_ZONES.md §5.4) — 수풀 layer 0(바탕)의 구역별 조성비 ----
// "테마보다 우선하는 규칙": layer 0에서 {tile_bush_dark, tile_bush_mid} 합계 면적 ≥50%,
// 그중 tile_bush_mid ≥10%. 구역별 구조물(통나무·상자·바위)이 이 비율을 깎아먹을 수 있어
// 손 계산이 아니라 실제 PNG로 측정한다(하네스 14).
{
  const bushImg = images['tile_bush'];
  if (!bushImg) {
    fail('[Z-B1] tile_bush.png 없음 — 검사 불가');
  } else {
    const BUSH_DARK_HEX = PALETTE.tile_bush_dark.toUpperCase();
    const BUSH_MID_HEX = PALETTE.tile_bush_mid.toUpperCase();
    for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
      const frame = getFrame(bushImg, FRAME_SIZE, 0, zone); // col 0 = layer 0(바탕)
      let dark = 0;
      let mid = 0;
      let total = 0;
      for (let y = 0; y < FRAME_SIZE; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
          const i = (y * FRAME_SIZE + x) * 4;
          if (frame[i + 3] === 0) continue;
          total++;
          const hex = `#${[frame[i], frame[i + 1], frame[i + 2]]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')}`.toUpperCase();
          if (hex === BUSH_DARK_HEX) dark++;
          else if (hex === BUSH_MID_HEX) mid++;
        }
      }
      const label = ZONE_LABELS[zone];
      if (total === 0) {
        fail(`[Z-B1] tile_bush.png zone=${label}: 알파≠0 픽셀이 0개`);
        continue;
      }
      const bushPct = ((dark + mid) / total) * 100;
      const midPct = (mid / total) * 100;
      if (bushPct < 50) fail(`[Z-B1] tile_bush.png zone=${label}: dark+mid 면적비 ${bushPct.toFixed(1)}% (<50%)`);
      if (midPct < 10) fail(`[Z-B1] tile_bush.png zone=${label}: mid 면적비 ${midPct.toFixed(1)}% (<10%)`);
      notes.push(`[Z-B1 실측] ${label}: dark+mid=${bushPct.toFixed(1)}% mid=${midPct.toFixed(1)}% (문턱 50%/10%)`);
    }
  }
}

// ---- C11/C12 (docs/SPEC_ZONES.md §2.5·§2.6-a) — 은신처 판별. 면적가중 평균 RGB 거리, 문턱 35 ----
// 2026-08-07 정정(gd 확정, SPEC_ZONES.md §2.6-a): 이전 판은 wall̄을 WALL_FACE(y19..31)만으로
// 측정했다 — tech가 스펙 공백에서 임의로 색·좌표를 고쳐 통과시키지 않고 정의를 gd에 되돌려
// 보낸 결과다(하네스 15). gd 판정: C11/C12가 묻는 질문은 "이 덩어리를 지나갈 수 있는가"이고,
// 플레이어는 벽을 부분(윗면/앞면)으로 보지 않는다 — **wall̄ = tile_wall variant0 프레임
// 전체(y 0..31, 윗면+경계선+앞면 전부) 평균**이 정의다. C2b/C2d가 윗면·앞면을 나누는 것은
// "벽 안에서 두께가 읽히는가"라는 다른 질문이라 그 선례를 여기로 옮기지 않는다.
// bush̄ = tile_bush layer0(바탕) 전체 평균, floor̄ = tile_floor variant0 전체 평균(둘 다 32×32
// 전체가 배경 채움이라 처음부터 불투명 — "면적가중"은 픽셀당 동일 가중의 평균과 같다).
{
  const bushImg = images['tile_bush'];
  const floorImg = images['tile_floor'];
  const wallImg = images['tile_wall'];
  if (!bushImg || !floorImg || !wallImg) {
    fail('[C11/C12] tile_bush.png/tile_floor.png/tile_wall.png 중 하나 이상 없음 — 검사 불가');
  } else {
    function meanRgbOfFrame(frame, y0 = 0, y1 = FRAME_SIZE - 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
          const i = (y * FRAME_SIZE + x) * 4;
          if (frame[i + 3] === 0) continue;
          sr += frame[i];
          sg += frame[i + 1];
          sb += frame[i + 2];
          count++;
        }
      }
      if (count === 0) return null;
      return [sr / count, sg / count, sb / count];
    }
    function rgbDist(a, b) {
      return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    }
    for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
      const bushMean = meanRgbOfFrame(getFrame(bushImg, FRAME_SIZE, 0, zone));
      const floorMean = meanRgbOfFrame(getFrame(floorImg, FRAME_SIZE, 0, zone));
      const wallMean = meanRgbOfFrame(getFrame(wallImg, FRAME_SIZE, 0, zone)); // variant0 프레임 전체(y0..31)
      const label = ZONE_LABELS[zone];
      if (!bushMean || !floorMean || !wallMean) {
        fail(`[C11/C12] zone=${label}: 대표 프레임이 완전 투명 — 측정 불가`);
        continue;
      }
      const c11 = rgbDist(bushMean, floorMean);
      const c12 = rgbDist(bushMean, wallMean);
      if (c11 < 35) fail(`[C11] zone=${label}: RGBdist(bush̄,floor̄)=${c11.toFixed(1)} < 35`);
      if (c12 < 35) fail(`[C12] zone=${label}: RGBdist(bush̄,wall̄)=${c12.toFixed(1)} < 35`);
      notes.push(`[C11/C12 실측] ${label}: dist(bush,floor)=${c11.toFixed(1)} dist(bush,wall)=${c12.toFixed(1)} (문턱 35, wall̄=variant0 프레임 전체)`);
    }
  }
}

// ---- A22 (신설, docs/SPEC_ZONES.md §2.6-c / C13 / W8) — 숲 벽에 초록 0픽셀 ----
// "숲에서 초록은 전부 통과 가능하다" — 숲 벽(tile_wall zone=forest, variant 0~3)의 어떤
// 픽셀도 최대 RGB 채널이 G(녹색)면 안 된다. C12처럼 연속량(문턱 35)이 아니라 이산 판정이라
// 재발을 구조적으로 막는다.
{
  const wallImg = images['tile_wall'];
  if (!wallImg) {
    fail('[A22] tile_wall.png 없음 — 검사 불가');
  } else {
    let greenCount = 0;
    let firstViolation = null;
    for (let variant = 0; variant < 4; variant++) {
      const frame = getFrame(wallImg, FRAME_SIZE, variant, ZONE_FOREST);
      for (let y = 0; y < FRAME_SIZE; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
          const i = (y * FRAME_SIZE + x) * 4;
          if (frame[i + 3] === 0) continue;
          const [r, g, b] = [frame[i], frame[i + 1], frame[i + 2]];
          if (g > r && g > b) {
            greenCount++;
            if (!firstViolation) firstViolation = [variant, x, y];
          }
        }
      }
    }
    if (greenCount > 0) {
      fail(
        `[A22] tile_wall.png zone=숲: 최대 RGB 채널이 G인 픽셀 ${greenCount}개 (0이어야 함, 첫 위반 variant=${firstViolation[0]} (${firstViolation[1]},${firstViolation[2]}))`
      );
    }
  }
}

// ---- A23 (신설, docs/SPEC_ZONES.md §4.3 P7) — props에 수풀색(tile_bush_*) 0픽셀 ----
// "소품은 tile_bush_dark·tile_bush_mid를 0px 사용한다" — 상호작용 없는 장식이 은신처와
// 같은 색이면 거짓 어포던스가 된다(§4.5). 12프레임 전부 대상.
{
  const propsImg = images['props'];
  if (!propsImg) {
    fail('[A23] props.png 없음 — 검사 불가');
  } else {
    const BUSH_HEXES = new Set([PALETTE.tile_bush_dark.toUpperCase(), PALETTE.tile_bush_mid.toUpperCase()]);
    let bushCount = 0;
    for (const zone of [ZONE_FOREST, ZONE_VILLAGE, ZONE_CAVE]) {
      for (let index = 0; index < 4; index++) {
        const frame = getFrame(propsImg, FRAME_SIZE, index, zone);
        for (let i = 0; i < frame.length; i += 4) {
          if (frame[i + 3] === 0) continue;
          const hex = `#${[frame[i], frame[i + 1], frame[i + 2]]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')}`.toUpperCase();
          if (BUSH_HEXES.has(hex)) bushCount++;
        }
      }
    }
    if (bushCount > 0) fail(`[A23 P7] props.png: 수풀색(tile_bush_dark/_mid) 픽셀 ${bushCount}개 (0이어야 함)`);
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

console.log(
  `verify-sprites: OK — ${names.length}개 PNG, 8항목(A13 포함) + W2~W5(SPEC_ZONES §3.5) + R1~R4·Z-B1·C11/C12(SPEC_ZONES §4.4/§5.4/§2.6-a) + A22·A23(SPEC_ZONES §2.6-c/§4.3) 전부 통과`
);
console.log('verify-sprites: 미구현(범위 밖, ART.md §6 참고): A7 좌우대칭, A10 몸통2색, A11 명도조건, A12 타일이음매');
console.log('verify-sprites: 미구현(범위 밖, 이번 세션 지시 R1/R2로 한정): P5 무-애니메이션, P6 소품 지배색');
process.exit(0);
