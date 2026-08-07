/**
 * palette.mjs — docs/ART.md §1.1의 30색 팔레트 (2026-08-07 개정: 16 → 30).
 *
 * 원본은 docs/ART.md다. 값이 갈리면 그 문서가 이긴다 (ART.md 계약 1).
 * 색은 밸런스가 아니므로 src/config/balance.ts에 넣지 않는다 — 생성 스크립트 내부 상수로 둔다.
 *
 * 개명 3건(ART.md §1.1 각주) — PNG 파일명은 그대로, 색 상수 이름만 바뀌었다:
 *   tile_wall -> cave_wall_face (hex 동일) / tile_floor -> cave_floor (hex 변경) /
 *   tile_floor_shade -> cave_floor_shade (hex 변경). 옛 이름을 참조하는 곳이 있으면 버그다.
 */

export const PALETTE = {
  ink: '#16121C',
  capy_brown_dark: '#4A2C1E',
  capy_brown_mid: '#A96C3C',
  capy_brown_light: '#C89460',
  capy_gray_dark: '#4E4B57',
  capy_gray_mid: '#94919E',
  capy_white: '#F0ECE2',
  goblin_dark: '#37662B',
  goblin_mid: '#8FD64F',
  goblin_shadow: '#23421C',
  goblin_cloth: '#A0602E',
  accent_amber: '#F2B03C',
  tile_bush_dark: '#2C5432',
  tile_bush_mid: '#478046',
  tile_spa: '#3E7E94',
  ember_red: '#C4522A',
  cave_wall_top: '#6E6880',
  cave_wall_face: '#2A2636',
  cave_floor: '#4A4658',
  cave_floor_shade: '#3D394A',
  village_wall_top: '#C9A468',
  earth_mid: '#8A6A44',
  earth_dark: '#6E5236',
  warm_tan: '#B98F4E',
  forest_wall_top: '#86A84A',
  forest_wall: '#1B2F1B',
  forest_floor: '#4E7A3A',
  forest_floor_shade: '#3A5C2C',
  // S1/S4 배경 전용. ART.md §1.1: "어떤 PNG에도 나타나면 안 된다" — 아래 PNG_EXEMPT_NAMES로 표시.
  sky_soft: '#8FC7E0',
  sky_pink: '#F0B9C4',
};

/**
 * PALETTE 중 PNG(스프라이트) 에셋에는 절대 쓰면 안 되는 이름 (ART.md §1.1 PNG열 `✗`).
 * Phaser Graphics/Text 전용 — S1(타이틀)·S4(결과) 배경에서만 쓴다.
 * `verify-sprites.mjs`의 A1(팔레트 준수) 검사는 이 둘을 "허용 28색"에서 제외해야 한다.
 */
export const PALETTE_PNG_EXEMPT_NAMES = ['sky_soft', 'sky_pink'];

/** hex('#RRGGBB') -> [r,g,b] */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 팔레트 이름 -> [r,g,b,255] RGBA 튜플. */
export function rgba(name) {
  const hex = PALETTE[name];
  if (!hex) throw new Error(`palette.mjs: 알 수 없는 색 이름 "${name}"`);
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, 255];
}

export const TRANSPARENT = [0, 0, 0, 0];

/** ART.md §1.1 상대 명도 공식. */
export function luminance(name) {
  const [r, g, b] = hexToRgb(PALETTE[name]);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
