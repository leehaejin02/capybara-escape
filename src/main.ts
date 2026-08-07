import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CustomizeScene } from './scenes/CustomizeScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';

/**
 * 게임 부팅 진입점.
 * 화면 크기(960×640)는 렌더 캔버스 좌표이지 밸런스 수치가 아니다 — balance.ts 대상이 아니다.
 * 32px 타일 그리드와 정수 배로 맞아떨어지도록 골랐을 뿐(30×20타일), 판정에는 쓰이지 않는다.
 */
const GAME_WIDTH = 960;
const GAME_HEIGHT = 640;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  scene: [BootScene, CustomizeScene, GameScene, ResultScene],
};

const game = new Phaser.Game(config);

/**
 * DPR 정수 픽셀 매핑 보정.
 *
 * 백킹스토어(canvas.width/height)는 게임 월드 좌표계(960×640)와 zoom=1로 항상
 * 1:1이다 — 씬 4개 + 미니게임 3개가 전부 이 좌표에 박혀 있어 바꾸지 않는다.
 * 문제는 그다음 단계다: 브라우저는 이 백킹스토어를 CSS 크기로 그린 뒤
 * devicePixelRatio(dpr)만큼 실제 화면 물리 픽셀로 한 번 더 확대한다. CSS
 * 크기가 백킹스토어와 같은 960×640이고 dpr이 정수(1, 2, 3…)가 아니면(예:
 * 1.1, 1.25, 1.5) 이 두 번째 확대가 비정수 배가 되어 pixelArt(NEAREST)
 * 샘플링이 픽셀을 불규칙하게 중복·소실시킨다 — 한글 1px 획이 통째로
 * 사라지는 증상이 이거다.
 *
 * 고치는 방법: 백킹스토어(월드 좌표계)는 그대로 두고, 캔버스의 CSS 표시
 * 크기만 `960/dpr × 640/dpr`로 낮춘다. 그러면 두 번째 확대가
 * `(960/dpr) * dpr = 960`으로 정확히 상쇄되어 백킹스토어 1픽셀 = 물리 픽셀
 * 1개(정수 1배)가 dpr 값과 무관하게 항상 성립한다. dpr=1인 환경에서는
 * 960/1=960이라 지금과 완전히 동일하다(회귀 없음).
 *
 * 트레이드오프: dpr>1 환경에서는 화면에 보이는 CSS 크기가 960×640보다
 * 작아진다(예: dpr=2.0 → 480×320 CSS px). 게임 월드 좌표계를 바꾸지 않는 한
 * (그러려면 씬 전체 재배치가 필요해 이번 스코프 밖) 이 트레이드오프를 피할
 * 방법이 없다 — 화면을 덜 차지할 뿐 잘리거나 깨지지는 않는다.
 */
function applyIntegerPixelScale(g: Phaser.Game): void {
  const dpr = window.devicePixelRatio || 1;
  const canvas = g.canvas;

  canvas.style.width = `${GAME_WIDTH / dpr}px`;
  canvas.style.height = `${GAME_HEIGHT / dpr}px`;

  // ScaleManager#displayScale(포인터 입력 좌표 변환에 쓰임)은 canvas의 실제
  // CSS 경계(getBoundingClientRect)를 기준으로 계산된다. 위에서 ScaleManager를
  // 거치지 않고 CSS 크기를 직접 바꿨으므로, refresh()로 그 경계 캐시를 즉시
  // 갱신해야 커스터마이즈 화면 버튼과 포인터 기반 미니게임 3종의 클릭 좌표가
  // 어긋나지 않는다.
  g.scale.refresh();
}

game.events.once(Phaser.Core.Events.READY, () => applyIntegerPixelScale(game));
