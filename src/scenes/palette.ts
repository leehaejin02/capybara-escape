/**
 * palette.ts — UI(HUD/타이틀/커스터마이즈) 텍스트·패널에 쓰는 색 상수.
 *
 * 색은 밸런스 수치가 아니다 (docs/ART.md §1 계약 1) — 따라서 balance.ts에 두지 않는다.
 * 원본은 docs/ART.md §1.1이고, 여기는 그 값 중 UI에 쓰는 것만 문자열로 옮긴 것이다.
 * (docs/ART.md §4 "UI" 표: 기본 텍스트=capy_white, 보조=capy_gray_mid, 강조=accent_amber,
 *  패널 배경=ink 알파0.8, 체력 3칸=accent_amber(남음)/capy_gray_dark(잃음))
 */

/** Phaser Text `color` 문자열 형식(hex CSS 문자열). */
export const UI_TEXT = {
  ink: '#16121C',
  capyWhite: '#F0ECE2',
  capyGrayMid: '#94919E',
  capyGrayDark: '#4E4B57',
  accentAmber: '#F2B03C',
} as const;

/** Phaser Graphics `fillStyle`/`lineStyle` 숫자(0xRRGGBB) 형식 — 문자열과 동일한 색의 다른 표현. */
export const UI_HEX = {
  ink: 0x16121c,
  capyWhite: 0xf0ece2,
  capyGrayMid: 0x94919e,
  capyGrayDark: 0x4e4b57,
  accentAmber: 0xf2b03c,
  /** ART.md §1.1 idx 8 `goblin_mid`. 미니게임 UI(M2 "초록 구간", M1/M3 색 구분)용. */
  goblinMid: 0x8fd64f,
  /** ART.md §1.1 idx 14 `tile_spa`. 미니게임 UI(M1/M3 색 구분)용. */
  tileSpa: 0x3e7e94,
} as const;
