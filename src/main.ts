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
 * 크기와 백킹스토어의 비율(=물리픽셀/게임픽셀)이 정수가 아니면(예: dpr이
 * 1.1, 1.25, 1.5일 때 비율을 1로 두면 그 자체가 비정수) 이 두 번째 확대가
 * pixelArt(NEAREST) 샘플링에서 픽셀을 불규칙하게 중복·소실시킨다 — 한글
 * 1px 획이 통째로 사라지는 증상이 이거다.
 *
 * 필요한 조건은 "물리픽셀/게임픽셀 = 1"이 아니라 "= 정수 N"이다(N=1은 그
 * 특수 사례일 뿐). `pickIntegerScale()`이 N을 고르고, CSS 크기를
 * `960*N/dpr × 640*N/dpr`로 설정한다. 그러면 물리 픽셀 =
 * `(960*N/dpr) * dpr = 960*N`이 되어 N이 정수인 한 백킹스토어 대비 항상
 * 정수배(N:1)로 상쇄된다. dpr=1인 환경에서는 N=1(아래 제약 2에서 후보
 * N=2가 960*2/1=1920>960으로 즉시 걸러짐)이라 CSS 960×640, 지금과 완전히
 * 동일하다(회귀 없음).
 */
function pickIntegerScale(dpr: number, viewportWidth: number, viewportHeight: number): number {
  // 제약 1(호출부 요구): N은 양의 정수, 최소 1 — 이 아래로는 못 내려간다.
  let n = 1;

  // N을 2부터 올려보면서, 아래 두 제약을 둘 다 만족하는 가장 큰 N을 찾는다.
  // dpr이 유한한 한 cssWidth는 candidate에 비례해 무한히 커지므로 반드시
  // candidate ~ dpr+1 부근에서 제약 2에 걸려 루프가 끝난다(무한루프 아님).
  for (let candidate = 2; ; candidate += 1) {
    const cssWidth = (GAME_WIDTH * candidate) / dpr;
    const cssHeight = (GAME_HEIGHT * candidate) / dpr;

    // 제약 2(호출부 요구): CSS 크기가 원래 화면 크기(960×640)를 넘지 않는다.
    // 픽셀아트를 원본보다 키우는 건 이번 목적이 아니다 — 지금까지의 화면
    // 크기가 기준선이다. 이게 dpr에 대해 N을 사실상 floor(dpr) 이하로 묶는다.
    if (cssWidth > GAME_WIDTH || cssHeight > GAME_HEIGHT) {
      break;
    }

    // 제약 3(호출부 요구): CSS 크기가 뷰포트를 넘지 않는다 — 심사자 화면이
    // 작을 수 있다.
    if (cssWidth > viewportWidth || cssHeight > viewportHeight) {
      break;
    }

    n = candidate;
  }

  return n;
}

function applyIntegerPixelScale(g: Phaser.Game): void {
  const dpr = window.devicePixelRatio || 1;
  const n = pickIntegerScale(dpr, window.innerWidth, window.innerHeight);
  const canvas = g.canvas;

  canvas.style.width = `${(GAME_WIDTH * n) / dpr}px`;
  canvas.style.height = `${(GAME_HEIGHT * n) / dpr}px`;

  // ScaleManager#displayScale(포인터 입력 좌표 변환에 쓰임)은 canvas의 실제
  // CSS 경계(getBoundingClientRect)를 기준으로 계산된다. 위에서 ScaleManager를
  // 거치지 않고 CSS 크기를 직접 바꿨으므로, refresh()로 그 경계 캐시를 즉시
  // 갱신해야 커스터마이즈 화면 버튼과 포인터 기반 미니게임 3종의 클릭 좌표가
  // 어긋나지 않는다.
  g.scale.refresh();
}

game.events.once(Phaser.Core.Events.READY, () => applyIntegerPixelScale(game));

// 뷰포트 변화(창 크기 조절) 또는 dpr 변화(브라우저 줌, 모니터 간 창 이동)에
// 재적용한다 — 둘 다 window의 innerWidth/innerHeight를 바꾸면서 대개
// 'resize' 이벤트를 함께 발생시킨다(체감상 dpr만 바뀌어도 CSS 뷰포트 크기가
// 갱신되며 같이 발화한다). 다시 계산하지 않으면 매핑이 깨져 원래 버그가
// 재발한다. 완벽하지 않다는 판단을 남긴다: 'resize'를 동반하지 않는 dpr
// 변화(일부 브라우저의 순수 줌 등)는 이 리스너로 못 잡을 수 있다.
// `window.matchMedia('(resolution: ...)').addEventListener('change', ...)`가
// 더 정확하지만 dpr이 바뀔 때마다 미디어쿼리 문자열을 다시 만들어 리스너를
// 재등록해야 하는 추가 상태 관리가 필요해, 결함 수정이라는 이번 스코프에서는
// 비용 대비 이득이 낮다고 판단해 넣지 않았다. 코스트가 저렴한 재계산이라
// 디바운스도 넣지 않았다.
window.addEventListener('resize', () => applyIntegerPixelScale(game));
