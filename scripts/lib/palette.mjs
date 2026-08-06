/**
 * palette.mjs — docs/ART.md §1.1의 16색 팔레트.
 *
 * 원본은 docs/ART.md다. 값이 갈리면 그 문서가 이긴다 (ART.md 계약 1).
 * 색은 밸런스가 아니므로 src/config/balance.ts에 넣지 않는다 — 생성 스크립트 내부 상수로 둔다.
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
  tile_floor: '#5C5666',
  tile_floor_shade: '#474252',
  tile_wall: '#2A2636',
  tile_bush_dark: '#2C5432',
  tile_bush_mid: '#478046',
  tile_spa: '#3E7E94',
  accent_amber: '#F2B03C',
};

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
