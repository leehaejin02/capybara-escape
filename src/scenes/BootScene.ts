import Phaser from 'phaser';
import { UI_TEXT } from './palette';
import { startBgm } from '../audio/bgm';

/**
 * BootScene — 에셋 프리로드 + S1 타이틀 화면(GDD 3장).
 *
 * 이 씬은 렌더링만 한다. 게임 규칙 판정은 여기서 하지 않는다 (CLAUDE.md 아키텍처 3).
 * 프리로드가 끝나면 타이틀을 보여주고, 클릭/키 입력으로 CustomizeScene(S2)로 이동한다.
 */

/** public/assets/*.png 파일명 목록. docs/ART.md §2.2. */
const SPRITESHEETS: ReadonlyArray<{ key: string; frameWidth: number; frameHeight: number }> = [
  { key: 'capy_body_01', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_body_02', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_body_03', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_body_04', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_outfit_00', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_outfit_01', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_outfit_02', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_outfit_03', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_outfit_04', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_hat_00', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_hat_01', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_hat_02', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_hat_03', frameWidth: 32, frameHeight: 32 },
  // 과일 모자 2종 — AI 시트에 없어 import-ai-art.mjs가 코드로 그린다.
  { key: 'capy_hat_04', frameWidth: 32, frameHeight: 32 },
  { key: 'capy_hat_05', frameWidth: 32, frameHeight: 32 },
  { key: 'goblin_walk', frameWidth: 32, frameHeight: 32 },
  { key: 'goblin_idle', frameWidth: 32, frameHeight: 32 },
  // tile_floor/tile_wall: SPEC_ZONES.md §2.2 — 128×96 = 4변형(col) × 3구역(row).
  // frameIndex = zone*4 + variant (row-major 스프라이트시트 인덱싱이 그대로 이 식이 된다).
  { key: 'tile_floor', frameWidth: 32, frameHeight: 32 },
  { key: 'tile_wall', frameWidth: 32, frameHeight: 32 },
  // tile_bush: 64×96 = 2 layer(0=바탕 1=캐노피) × 3구역. frameIndex = zone*2 + layer. SPEC_ZONES.md §5.4·§6.
  { key: 'tile_bush', frameWidth: 32, frameHeight: 32 },
  // tile_spa: 32×96 = 1 × 3구역. frameIndex = zone. SPEC_ZONES.md §5.5.
  { key: 'tile_spa', frameWidth: 32, frameHeight: 32 },
  // props: 128×96 = 4종(col) × 3구역(row). frameIndex = zone*4 + index. SPEC_ZONES.md §4.
  { key: 'props', frameWidth: 32, frameHeight: 32 },
  { key: 'marker_mission', frameWidth: 32, frameHeight: 32 },
  { key: 'marker_exit', frameWidth: 32, frameHeight: 32 },
];

/** 프레임이 1개뿐인 단순 이미지. docs/ART.md §2.2, SPEC_ZONES.md §3.4(tile_shadow 신규).
 * `title_screen`: 새 타이틀 배경(480×320, 화면에서 2배로 띄운다 — 정수 스케일, 한글 로고 획 보존).
 * `intro_bg`: IntroScene 전용 배경(480×320, 화면에서 2배로 띄운다 — 지형(하늘·풀밭·흙)이 그려져
 * 있어 카피바라가 밟고 설 땅이 생긴다).
 * `logo_title`은 이 씬에서 더는 안 쓰지만, 다른 곳이 참조할 수 있어 로드 목록에서 빼지 않는다. */
const IMAGES: readonly string[] = ['tile_shadow', 'logo_title', 'title_screen', 'intro_bg'];

/** `title_screen` 원본 픽셀 크기와, 화면에 띄울 정수 배율. 표현값(밸런스 아님) — 정수여야
 * pixelArt(NEAREST) 샘플링에서 한글 로고 획이 죽지 않는다(세션 6에서 고친 결함과 동일 원인). */
const TITLE_SCREEN_SCALE = 2;

export class BootScene extends Phaser.Scene {
  /**
   * preload()의 "로딩 중..." 텍스트. create()에서 반드시 destroy() 해야 한다 —
   * 두 좌표가 우연히 같아 겹친 게 아니라 **둘 다 (width/2, height/2)를 의도적으로 썼다.**
   * 참조를 안 남기면 이 텍스트가 화면에 남아, create()가 그 정확히 같은 좌표(height*0.5)에
   * 그리는 세계관 문구와 같은 자리에서 두 Text의 글리프가 겹쳐 그려진다.
   * 실측(headless 스크린샷, 2026-08-07): 겹치는 글자가 뭉개져 보인 원인은 웹폰트 타이밍이 아니라
   * 이 잔여 Text였다 — "로딩 중..."의 폭만큼만 정확히 뭉개졌고, 그 밖의 글자는 멀쩡했다.
   */
  private loadingText?: Phaser.GameObjects.Text;

  constructor() {
    super('BootScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    this.loadingText = this.add
      .text(width / 2, height / 2, '로딩 중...', { fontFamily: 'monospace', fontSize: '16px', color: UI_TEXT.capyWhite })
      .setOrigin(0.5);

    const base = import.meta.env.BASE_URL;
    /*
     * `?v=` — 캐시 무효화. `public/assets/*.png`는 Vite가 해시를 안 붙이고 그대로 복사하므로,
     * 그림을 바꿔 배포해도 URL이 같아 **이미 방문한 브라우저는 옛 파일을 계속 쓴다.**
     * 실측(2026-08-08): 아트 교체 배포 직후에도 `transfer: 0`으로 923B짜리 옛 파일을 썼다
     * (서버 파일은 3,430B). 값의 출처와 이유는 `vite.config.ts` 주석 참조.
     */
    const v = `?v=${__ASSET_VERSION__}`;
    for (const s of SPRITESHEETS) {
      this.load.spritesheet(s.key, `${base}assets/${s.key}.png${v}`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    }
    for (const key of IMAGES) {
      this.load.image(key, `${base}assets/${key}.png${v}`);
    }
  }

  create(): void {
    this.loadingText?.destroy();
    this.loadingText = undefined;

    const { width, height } = this.scale;

    // 새 타이틀 배경 — 로고·게임 제목이 이미 그려진 480×320 원본을 화면 정중앙에
    // 정수 배율(×2)로 깐다. 비정수 배율은 pixelArt(NEAREST) 샘플링에서 한글 로고
    // 획을 죽인다(세션 6에서 고친 결함과 같은 원인) — 여기서 같은 함정을 반복하지 않는다.
    // 배경이 화면을 꽉 채우므로 addCozySkyBackground·logo_title은 더 이상 쓰지 않는다.
    this.add.image(width / 2, height / 2, 'title_screen').setOrigin(0.5).setScale(TITLE_SCREEN_SCALE);

    // 세계관 문구·조작키 패널은 타이틀에서 뺐다(사용자 요청 — "처음엔 로고 이미지만").
    // 정보를 버린 게 아니라 IntroScene 컷신의 마지막 대사로 옮겼다(GDD 3장 S1 "조작법" 요건은
    // IntroScene이 이어서 충족한다).

    const startText = this.add
      .text(width / 2, height * 0.9, '클릭 또는 아무 키나 눌러 시작', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: UI_TEXT.accentAmber,
        stroke: UI_TEXT.ink,
        // 배경이 밝아져 기존 두께(3)로는 대비가 약할 수 있어 한 단계 올렸다.
        // 실제 화면에서 읽히는지는 미확인(브라우저 렌더 미검증) — 보고서에 명시.
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.tweens.add({ targets: startText, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const start = (): void => {
      // 브라우저 자동재생 정책상 AudioContext는 사용자 제스처 핸들러 안에서
      // 동기적으로 시작해야 한다. 이 핸들러가 게임 전체에서 첫 제스처다.
      startBgm();
      this.scene.start('IntroScene');
    };
    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
  }
}
