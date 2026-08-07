import Phaser from 'phaser';
import { SKY_HEX } from './palette';

/**
 * background.ts — S1(타이틀)·S2(커스터마이즈)·S4(결과) 공용 배경. sim에 의존하지 않는 순수 렌더링 헬퍼.
 *
 * ART.md §1.1의 `sky_soft`/`sky_pink`(idx 28·29, PNG 금지 — Graphics/Text 전용)를 쓴다.
 * 매끈한 그라데이션(WebGL/Canvas gradient)은 픽셀아트 톤과 안 맞아 **정렬 디더링**으로 대체한다 —
 * 두 색만 쓰고 그 사이 색을 새로 만들지 않는다(팔레트 30색을 늘리지 않는다는 제약을 그대로 지킨다).
 */

/** 디더 셀 크기(px). 32px 타일 그리드보다 작게 잡아 "칙칙polka 노이즈"가 아니라
 * 부드러운 계단식 전환으로 보이게 한다. 밸런스 수치가 아니라 렌더 디테일 상수. */
const DITHER_CELL_PX = 4;

/** 4×4 Bayer 정렬 디더 행렬(0..15). 표준 순서 디더링 문턱값 테이블. */
const BAYER_4X4: readonly number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/**
 * width×height 캔버스 텍스처 `key`에 위(sky_pink) → 아래(sky_soft) 디더 하늘을 굽고,
 * 씬 배경으로 화면 전체를 덮는 Image를 하나 추가해 돌려준다. 호출부가 `setDepth`로
 * 최하단에 놓아야 한다(이 함수는 depth를 강제하지 않는다 — 씬마다 다른 레이어 구성을 쓸 수 있다).
 */
export function addCozySkyBackground(scene: Phaser.Scene, width: number, height: number, key: string): Phaser.GameObjects.Image {
  if (!scene.textures.exists(key)) {
    const canvasTex = scene.textures.createCanvas(key, width, height)!;
    const ctx = canvasTex.getContext();
    const [topR, topG, topB] = hexToRgb(SKY_HEX.skyPink);
    const [botR, botG, botB] = hexToRgb(SKY_HEX.skySoft);

    for (let cy = 0; cy * DITHER_CELL_PX < height; cy++) {
      const cellY = cy * DITHER_CELL_PX;
      // 0(맨 위, 전부 sky_pink) .. 1(맨 아래, 전부 sky_soft).
      const t = cellY / Math.max(1, height - DITHER_CELL_PX);
      for (let cx = 0; cx * DITHER_CELL_PX < width; cx++) {
        const cellX = cx * DITHER_CELL_PX;
        const threshold = (BAYER_4X4[cy % 4][cx % 4] + 0.5) / 16;
        const useBottom = t > threshold;
        ctx.fillStyle = useBottom ? `rgb(${botR},${botG},${botB})` : `rgb(${topR},${topG},${topB})`;
        ctx.fillRect(cellX, cellY, DITHER_CELL_PX, DITHER_CELL_PX);
      }
    }
    canvasTex.refresh();
  }

  return scene.add.image(width / 2, height / 2, key).setOrigin(0.5);
}
