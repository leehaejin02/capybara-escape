import Phaser from 'phaser';
import { UI_HEX } from './palette';

/**
 * uiPanel.ts — HUD·타이틀·결과 화면이 공유하는 순수 렌더링 헬퍼.
 *
 * 게임 규칙을 판정하지 않는다(CLAUDE.md 아키텍처 3) — 그리는 좌표·색만 다룬다.
 * 색은 밸런스가 아니므로 balance.ts 대상이 아니고, 전부 `palette.ts`(원본 docs/ART.md §1.1)에서 온다.
 */

/** 패널 배경 알파. 밸런스 수치가 아니라 UI 레이어 상수 — ART.md §4 "패널 배경 = ink 알파0.8"과 동일 값. */
const PANEL_FILL_ALPHA = 0.8;
/** 안쪽 강조선을 바깥 테두리에서 몇 px 들여 그릴지. */
const PANEL_INSET_PX = 3;

/**
 * 픽셀아트 프레임 패널: `ink` 채움 + `ink` 1px 외곽선 + `warm_tan` 1px 안쪽 강조선.
 * HUD 박스·미션 게이지·타이틀 조작키 박스·커스터마이즈 미리보기 받침/항목 박스·결과 화면이
 * 전부 이 하나로 통일된 톤을 쓴다.
 *
 * `gfx`는 호출부가 `clear()`를 책임진다(매 프레임 다시 그리는 HUD와, 한 번만 그리는 타이틀 패널이
 * 같은 헬퍼를 쓰기 때문에 이 함수는 clear를 하지 않는다).
 */
export function drawPanel(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  gfx.fillStyle(UI_HEX.ink, PANEL_FILL_ALPHA);
  gfx.fillRect(x, y, w, h);

  // 외곽선(0.5px 오프셋 — Graphics 1px 선이 픽셀 경계에 걸쳐 흐려지는 것을 막는다).
  gfx.lineStyle(1, UI_HEX.ink, 1);
  gfx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  gfx.lineStyle(1, UI_HEX.warmTan, 1);
  gfx.strokeRect(x + PANEL_INSET_PX + 0.5, y + PANEL_INSET_PX + 0.5, w - PANEL_INSET_PX * 2 - 1, h - PANEL_INSET_PX * 2 - 1);
}

/**
 * 7×6 픽셀 맵으로 정의한 하트. HP 표시를 사각형 대신 아이콘으로 바꾸는 용도(ART.md §4 "체력 3칸"
 * 색 배정은 그대로 — 남음=accentAmber, 잃음=capyGrayDark — 모양만 하트로 바꾼다).
 * 새 PNG를 만들지 않고 Graphics로 그린다 — 팔레트 30색·새 스프라이트시트를 늘리지 않기 위함.
 */
const HEART_ROWS: readonly string[] = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

/** 하트 1개를 (x,y)를 좌상단으로 `cellPx` 크기의 블록으로 채워 그린다. */
export function drawHeart(gfx: Phaser.GameObjects.Graphics, x: number, y: number, cellPx: number, color: number): void {
  gfx.fillStyle(color, 1);
  for (let row = 0; row < HEART_ROWS.length; row++) {
    const line = HEART_ROWS[row];
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== '#') continue;
      gfx.fillRect(x + col * cellPx, y + row * cellPx, cellPx, cellPx);
    }
  }
}

/** `drawHeart`가 그리는 하트 1개의 픽셀 폭·높이(맵 기준, cellPx=1일 때). 배치 간격 계산용. */
export const HEART_COLS = 7;
export const HEART_ROWS_COUNT = 6;
