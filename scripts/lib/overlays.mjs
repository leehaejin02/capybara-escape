/**
 * overlays.mjs — capy_outfit_{00..04} / capy_hat_{00..03}. ART.md §3.2 (2026-08-07 개정판).
 *
 * 이번 개정에서 gd가 down/right 양쪽 좌표를 전부 명시했다 — tech가 지어낸 도형은 없다.
 * up은 down 좌표를 그대로 재사용한다(§3.2 표: down = up). left는 flipX(right) (§2.4).
 *
 * FRAME_DY 공유: 이 파일은 body 생성기(capybara.mjs/goblin.mjs)와 마찬가지로 buildMaskFrame() 하나만
 * 호출한다. FRAME_DY는 mask-sprite.mjs 안에 유일한 상수로 존재하고 두 생성기가 그 함수를 통해서만
 * 적용받으므로, 복붙된 별도 상수가 애초에 존재하지 않는다(ART.md §3.2 규칙 2).
 */

import { bresenhamLine, createCanvas, FRAME_SIZE } from './canvas.mjs';
import { buildMaskFrame } from './mask-sprite.mjs';

const INK = 'ink';

function rectShape(x0, y0, x1, y1, color, opts = {}) {
  return { x0, y0, x1, y1, color, ...opts };
}
function lineShape(x0, y0, x1, y1, color, opts = {}) {
  return { type: 'points', points: bresenhamLine(x0, y0, x1, y1), color, ...opts };
}

// ============ capy_outfit_* ============
// 몸통이 폭 16→20(down) / 19→21(right)로 넓어졌으므로 옷 가로 폭도 §3.2 새 좌표로 키웠다.
//
// tech 수정 (2026-08-07, 사용자 피드백 — ART.md §3.2 tech 구현 노트):
// §3.2 원안의 세로 범위(y26 또는 y25까지)는 아랫배 띠(y24..25)·발·몸통 하단 곡선을 전부
// 덮어 "색깔 상자에 담긴 머리"로 보였다. 모든 outfit의 아랫변을 y23으로 올려 "띠"로 만들고,
// 몸통 본색이 옷 위(어깨)와 아래(아랫배·발)에 보이게 했다. 가로 폭·색·보조 무늬는 원안 그대로.
const outfit = {
  1: {
    // 멜빵바지: tile_spa + capy_gray_mid 단추
    down: [
      rectShape(8, 20, 23, 23, 'tile_spa'), // 바지 (원안 y26 → y23)
      rectShape(12, 16, 12, 20, 'tile_spa'), // 어깨끈(좌) 세로 1px
      rectShape(19, 16, 19, 20, 'tile_spa'), // 어깨끈(우)
      rectShape(12, 20, 12, 20, 'capy_gray_mid', { recolorOnly: true }), // 단추
      rectShape(19, 20, 19, 20, 'capy_gray_mid', { recolorOnly: true }),
    ],
    right: [
      rectShape(5, 19, 22, 23, 'tile_spa'), // 바지 (원안 y26 → y23)
      rectShape(14, 15, 15, 19, 'tile_spa'), // 어깨끈
      rectShape(14, 19, 14, 19, 'capy_gray_mid', { recolorOnly: true }), // 단추
    ],
  },
  2: {
    // 수건: capy_white + capy_gray_mid 줄 (흰색 카피바라 대응 — §3.2 공통규칙 4)
    down: [
      rectShape(8, 18, 23, 23, 'capy_white'), // 원안 y25 → y23
      rectShape(8, 20, 23, 20, 'capy_gray_mid', { recolorOnly: true }),
      rectShape(8, 22, 23, 22, 'capy_gray_mid', { recolorOnly: true }), // 원안 y23 줄 → y22 (아랫변이 올라와서)
    ],
    right: [
      rectShape(5, 18, 21, 23, 'capy_white'),
      rectShape(5, 20, 21, 20, 'capy_gray_mid', { recolorOnly: true }),
      rectShape(5, 22, 21, 22, 'capy_gray_mid', { recolorOnly: true }),
    ],
  },
  3: {
    // 우비: accent_amber + capy_white 줄
    down: [
      rectShape(6, 17, 25, 23, 'accent_amber', { removeCorners: true }), // 원안 y26 → y23
      rectShape(6, 18, 25, 18, 'capy_white', { recolorOnly: true }),
    ],
    right: [
      rectShape(4, 16, 24, 23, 'accent_amber', { removeCorners: true }),
      rectShape(4, 17, 24, 17, 'capy_white', { recolorOnly: true }),
    ],
  },
  4: {
    // 작업복: capy_gray_dark + accent_amber 대각 안전선
    down: [
      rectShape(8, 18, 23, 23, 'capy_gray_dark'), // 원안 y25 → y23
      lineShape(9, 22, 22, 19, 'accent_amber', { recolorOnly: true }), // 안전선도 내부(y19..22)로
    ],
    right: [
      rectShape(5, 18, 21, 23, 'capy_gray_dark'),
      lineShape(6, 22, 19, 19, 'accent_amber', { recolorOnly: true }),
    ],
  },
};

// ============ capy_hat_* ============
// HAT_BOX 개정: down/up y+2, right y+1 (머리가 낮아진 만큼). x는 전 방향 그대로.

const hat = {
  1: {
    // 밀짚모자: 챙 아랫줄·크라운 하단 2줄은 dark (연갈색 카피바라 위에서 사라지지 않게)
    down: [
      rectShape(7, 9, 24, 10, 'capy_brown_light'), // 챙
      rectShape(11, 4, 20, 9, 'capy_brown_light', { removeCorners: true }), // 크라운
      rectShape(7, 10, 24, 10, 'capy_brown_dark', { recolorOnly: true }), // 챙 아랫줄
      rectShape(11, 8, 20, 9, 'capy_brown_dark', { recolorOnly: true }), // 크라운 하단 2줄
    ],
    right: [
      rectShape(15, 9, 28, 10, 'capy_brown_light'),
      rectShape(18, 4, 25, 9, 'capy_brown_light', { removeCorners: true }),
      rectShape(15, 10, 28, 10, 'capy_brown_dark', { recolorOnly: true }),
      rectShape(18, 8, 25, 9, 'capy_brown_dark', { recolorOnly: true }),
    ],
  },
  2: {
    // 유자: accent_amber 열매 + tile_bush_mid 잎
    down: [
      rectShape(13, 5, 18, 10, 'accent_amber', { removeCorners: true }),
      rectShape(18, 4, 20, 5, 'tile_bush_mid'),
    ],
    right: [
      rectShape(19, 5, 24, 10, 'accent_amber', { removeCorners: true }),
      rectShape(24, 4, 26, 5, 'tile_bush_mid'),
    ],
  },
  3: {
    // 헬멧: tile_spa 돔 + capy_white 하이라이트
    down: [
      { type: 'rectTopCorners', x0: 10, y0: 5, x1: 21, y1: 11, n: 2, color: 'tile_spa' },
      rectShape(9, 11, 22, 12, 'tile_spa'), // 챙
      rectShape(12, 6, 14, 6, 'capy_white'),
    ],
    right: [
      { type: 'rectTopCorners', x0: 17, y0: 5, x1: 28, y1: 11, n: 2, color: 'tile_spa' },
      rectShape(16, 11, 29, 12, 'tile_spa'),
      rectShape(19, 6, 21, 6, 'capy_white'),
    ],
  },
};

function buildOverlayFrame(shapes, frameIndex) {
  return buildMaskFrame({ shapes, details: [], frameIndex, ink: INK, shading: null });
}

function emptyFrame() {
  return createCanvas(FRAME_SIZE, FRAME_SIZE);
}

/** id: 0(없음)..4. dir: 'down'|'up'|'right'. up은 down 좌표를 그대로 재사용한다(§3.2 박스 동일). */
export function buildOutfitFrame(id, dir, frameIndex) {
  if (id === 0) return emptyFrame();
  const spec = outfit[id];
  const shapes = dir === 'up' ? spec.down : spec[dir];
  return buildOverlayFrame(shapes, frameIndex);
}

export function buildHatFrame(id, dir, frameIndex) {
  if (id === 0) return emptyFrame();
  const spec = hat[id];
  const shapes = dir === 'up' ? spec.down : spec[dir];
  return buildOverlayFrame(shapes, frameIndex);
}
