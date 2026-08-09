import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { IntroScene } from './scenes/IntroScene';
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
  // index.html의 #app은 (프레임 + 캡션)을 담는 페이지 레이아웃 컨테이너로
  // 바뀌었다. Phaser는 그 안의 #game-canvas-holder에만 canvas를 붙인다 —
  // 프레임(padding·border)이 canvas 자신에는 닿지 않게 하기 위함.
  parent: 'game-canvas-holder',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  scene: [BootScene, IntroScene, CustomizeScene, GameScene, ResultScene],

  /*
   * 개발 모드 전용 — 제출용 스크린샷 캡처를 가능하게 하는 두 가지.
   * `import.meta.env.DEV`는 `vite build`에서 false로 상수 폴딩되므로 **배포본에는 없다.**
   *
   * - preserveDrawingBuffer: WebGL은 기본적으로 그린 직후 버퍼를 버려서
   *   `canvas.toDataURL()`이 빈 이미지를 준다. 켜면 캔버스에서 960×640 원본 픽셀을
   *   그대로 뽑을 수 있다(스크린샷 크롭이 어긋날 일이 없다). 약간의 성능 비용이 있어
   *   배포본에는 넣지 않는다.
   * - forceSetTimeOut: 브라우저는 **백그라운드 탭에서 requestAnimationFrame을 멈춘다.**
   *   그러면 게임 루프가 자서 인게임 화면까지 진행시킬 수 없다. setTimeout 루프로
   *   바꾸면 탭이 숨겨져 있어도 계속 돈다. 실제 플레이 품질과는 무관한 개발 편의다.
   */
  ...(import.meta.env.DEV
    ? { render: { preserveDrawingBuffer: true }, fps: { forceSetTimeOut: true } }
    : {}),
};

const game = new Phaser.Game(config);

// 개발 모드에서만 게임 인스턴스를 노출한다. 스크린샷 캡처 스크립트가 씬 상태를 읽고
// 캔버스를 뽑는 데 쓴다. 배포본에는 이 줄이 남지 않는다.
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}

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
 * 정수배(N:1)로 상쇄된다. dpr=1이고 뷰포트가 960×640(+프레임 여백)보다
 * 작으면(예: 1920×950 뷰포트는 세로가 부족) N=2 후보(CSS 1920×1280)가
 * 여유 뷰포트 제약에 걸려 즉시 버려지므로 N=1, CSS 960×640이 나온다 — 지금과
 * 완전히 동일하다(회귀 없음). 뷰포트가 충분히 크면(예: 2560×1400) N=2를
 * 그대로 고른다 — 원본 크기·2배 해상도가 공짜로 나온다는 뜻이고, 이건
 * 의도된 동작이다.
 */

/**
 * index.html의 페이지 크롬(#page padding + #frame padding/border + #frame↔#caption
 * gap + #caption 한 줄)이 캔버스 주위에서 실제로 차지하는 여백. 아래 값은 그
 * CSS 수치에서 그대로 뽑았다(가로: #page padding 8*2 + #frame padding 10*2 +
 * #frame border 1*2 = 40. 세로: 위 합 40 + #page↔#caption gap 6 + #caption
 * 한 줄(13px·line-height 1.3 ≈ 17px) ≈ 63). 폰트 렌더링 오차 등을 감안해
 * 여유를 얹어 반올림했다 — CSS를 고치면 이 값도 같이 맞춰야 한다는 뜻의
 * 근사치이지, CSS에서 자동으로 읽어오는 값이 아니다.
 */
const RESERVED_CHROME_WIDTH_PX = 40;
const RESERVED_CHROME_HEIGHT_PX = 70;

function pickIntegerScale(dpr: number, viewportWidth: number, viewportHeight: number): number {
  // 제약 1(호출부 요구): N은 양의 정수, 최소 1 — 이 아래로는 못 내려간다.
  let n = 1;

  // 프레임·캡션이 실제로 차지하는 만큼을 뺀 "캔버스가 쓸 수 있는" 여유
  // 뷰포트. 여기서 빼지 않으면 프레임을 두른 뒤 캔버스가 뷰포트를 넘칠 수
  // 있다(index.html 요구사항 6).
  const availableWidth = viewportWidth - RESERVED_CHROME_WIDTH_PX;
  const availableHeight = viewportHeight - RESERVED_CHROME_HEIGHT_PX;

  // N을 2부터 올려보면서, 여유 뷰포트 제약을 만족하는 가장 큰 N을 찾는다.
  // "CSS ≤ 960×640" 제약(원래 화면 크기를 넘지 않아야 한다는 것)은 제거했다
  // — 큰 모니터에서는 원본보다 크고 선명하게 보여주는 게 오히려 맞다. dpr이
  // 유한한 한 cssWidth는 candidate에 비례해 무한히 커지므로 반드시
  // candidate가 커지는 어느 시점에 아래 제약에 걸려 루프가 끝난다(무한루프
  // 아님).
  for (let candidate = 2; ; candidate += 1) {
    const cssWidth = (GAME_WIDTH * candidate) / dpr;
    const cssHeight = (GAME_HEIGHT * candidate) / dpr;

    // 제약 2(호출부 요구, 프레임·캡션 여유 반영): CSS 크기가 여유 뷰포트를
    // 넘지 않는다 — 심사자 화면이 작을 수 있고, 프레임·캡션도 자리를 차지한다.
    if (cssWidth > availableWidth || cssHeight > availableHeight) {
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
