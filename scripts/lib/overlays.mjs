/**
 * overlays.mjs — capy_outfit_{00..04} / capy_hat_{00..03}. ART.md §3.2.
 *
 * down/up은 ART.md가 명시한 down 좌표를 그대로 재사용한다(HAT_BOX/OUTFIT_BOX가 down·up 동일).
 * ⚠️ right(그리고 flipX인 left)의 구체적 좌표는 ART.md에 없다 — down 좌표만 명세돼 있다.
 * §3.2 표의 HAT_BOX/OUTFIT_BOX(right)는 있지만 도형은 없어서, right 형태는 **tech가
 * ART.md §7의 "1px 조정은 tech 재량" 범위를 넘어 새로 그렸다.** down의 실루엣을 right
 * 방향 몸통(§3.1 right: 머리 (17,7)-(27,17), 몸통 (4,15)-(22,26))에 맞춰 유사한 비율로
 * 이식한 것이며, gd가 검토해야 한다. 상세는 세션 보고 참조.
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

const outfit = {
  1: {
    down: [
      rectShape(9, 20, 22, 27, 'tile_spa'),
      rectShape(12, 16, 12, 20, 'tile_spa'), // 어깨끈(좌)
      rectShape(19, 16, 19, 20, 'tile_spa'), // 어깨끈(우)
      { x0: 12, y0: 20, x1: 12, y1: 20, color: 'capy_gray_mid', recolorOnly: true }, // 단추
      { x0: 19, y0: 20, x1: 19, y1: 20, color: 'capy_gray_mid', recolorOnly: true },
    ],
    right: [
      rectShape(6, 19, 21, 26, 'tile_spa'),
      rectShape(13, 15, 14, 19, 'tile_spa'), // 어깨끈
      { x0: 13, y0: 19, x1: 13, y1: 19, color: 'capy_gray_mid', recolorOnly: true }, // 단추
    ],
  },
  2: {
    down: [
      rectShape(9, 18, 22, 25, 'capy_white'),
      { x0: 9, y0: 20, x1: 22, y1: 20, color: 'capy_gray_mid', recolorOnly: true },
      { x0: 9, y0: 23, x1: 22, y1: 23, color: 'capy_gray_mid', recolorOnly: true },
    ],
    right: [
      rectShape(6, 17, 21, 24, 'capy_white'),
      { x0: 6, y0: 19, x1: 21, y1: 19, color: 'capy_gray_mid', recolorOnly: true },
      { x0: 6, y0: 22, x1: 21, y1: 22, color: 'capy_gray_mid', recolorOnly: true },
    ],
  },
  3: {
    down: [
      rectShape(8, 17, 23, 26, 'accent_amber', { removeCorners: true }),
      { x0: 8, y0: 18, x1: 23, y1: 18, color: 'capy_white', recolorOnly: true },
    ],
    right: [
      rectShape(4, 15, 22, 25, 'accent_amber', { removeCorners: true }),
      { x0: 4, y0: 16, x1: 22, y1: 16, color: 'capy_white', recolorOnly: true },
    ],
  },
  4: {
    down: [
      rectShape(9, 18, 22, 26, 'capy_gray_dark'),
      lineShape(10, 24, 21, 19, 'accent_amber', { recolorOnly: true }),
    ],
    right: [
      rectShape(6, 17, 21, 25, 'capy_gray_dark'),
      lineShape(7, 23, 18, 18, 'accent_amber', { recolorOnly: true }),
    ],
  },
};

// ============ capy_hat_* ============

const hat = {
  1: {
    // 밀짚모자: 챙 아랫줄·크라운 하단 2줄은 dark (연갈색 카피바라 위에서 사라지지 않게, §3.2 실제 사례)
    down: [
      rectShape(7, 7, 24, 8, 'capy_brown_light'),
      rectShape(11, 2, 20, 7, 'capy_brown_light', { removeCorners: true }),
      { x0: 7, y0: 8, x1: 24, y1: 8, color: 'capy_brown_dark', recolorOnly: true },
      { x0: 11, y0: 6, x1: 20, y1: 7, color: 'capy_brown_dark', recolorOnly: true },
    ],
    right: [
      rectShape(15, 8, 28, 9, 'capy_brown_light'),
      rectShape(18, 3, 25, 7, 'capy_brown_light', { removeCorners: true }),
      { x0: 15, y0: 9, x1: 28, y1: 9, color: 'capy_brown_dark', recolorOnly: true },
      { x0: 18, y0: 6, x1: 25, y1: 7, color: 'capy_brown_dark', recolorOnly: true },
    ],
  },
  2: {
    // 유자
    down: [
      rectShape(13, 3, 18, 8, 'accent_amber', { removeCorners: true }),
      rectShape(18, 2, 20, 3, 'tile_bush_mid'),
    ],
    right: [
      rectShape(19, 4, 24, 9, 'accent_amber', { removeCorners: true }),
      rectShape(24, 3, 26, 4, 'tile_bush_mid'),
    ],
  },
  3: {
    // 헬멧
    down: [
      { type: 'rectTopCorners', x0: 10, y0: 3, x1: 21, y1: 9, n: 2, color: 'tile_spa' },
      rectShape(9, 9, 22, 10, 'tile_spa'),
      rectShape(12, 4, 14, 4, 'capy_white'),
    ],
    right: [
      { type: 'rectTopCorners', x0: 17, y0: 4, x1: 28, y1: 10, n: 2, color: 'tile_spa' },
      rectShape(16, 10, 29, 11, 'tile_spa'),
      rectShape(19, 5, 21, 5, 'capy_white'),
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
