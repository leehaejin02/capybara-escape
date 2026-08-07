import Phaser from 'phaser';
import { UI_TEXT } from './palette';
import { startBgm } from '../audio/bgm';
import { addCozySkyBackground } from './background';
import { drawPanel } from './uiPanel';

/** S1/S4가 공유하는 하늘 텍스처 키. background.ts가 이미 있으면 다시 굽지 않는다. */
const SKY_BG_KEY = 'ui_cozy_sky';

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

/** 프레임이 1개뿐인 단순 이미지. docs/ART.md §2.2, SPEC_ZONES.md §3.4(tile_shadow 신규). */
const IMAGES: readonly string[] = ['tile_shadow', 'logo_title'];

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
    for (const s of SPRITESHEETS) {
      this.load.spritesheet(s.key, `${base}assets/${s.key}.png`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    }
    for (const key of IMAGES) {
      this.load.image(key, `${base}assets/${key}.png`);
    }
  }

  create(): void {
    this.loadingText?.destroy();
    this.loadingText = undefined;

    const { width, height } = this.scale;

    // 검은 배경 대신 "cozy"한 하늘(ART.md sky_pink→sky_soft 디더링). 다른 요소보다 먼저 그려
    // 항상 맨 뒤에 깔린다(뒤에 추가하는 Phaser GameObject가 그 위에 그려짐).
    addCozySkyBackground(this, width, height, SKY_BG_KEY);

    // 로고는 1376×768 원본이라 그대로 두면 캔버스를 덮는다.
    // 폭 80% / 높이 40% 중 더 작은 배율로 맞춘다.
    // 이 이미지는 도트를 확대 렌더한 원본이라 정수 스케일 규칙 대상이 아니다
    // (docs/ART.md의 정수 스케일 규칙은 32×32 스프라이트에 적용된다).
    const logo = this.add.image(width / 2, height * 0.26, 'logo_title').setOrigin(0.5);
    logo.setScale(Math.min((width * 0.8) / logo.width, (height * 0.4) / logo.height));

    // 밝은 하늘 배경 위라 흰 글자만으로는 대비가 약하다 — ink 외곽선을 둘러 어떤 배경에서도 읽히게 한다.
    this.add
      .text(width / 2, height * 0.5, '이세계에 떨어진 카피바라. 여긴 고블린의 서식지다.', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: UI_TEXT.capyWhite,
        stroke: UI_TEXT.ink,
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // 한 Text에 '\n'으로 넣고 align:'center'를 주면 한글이 monospace 폴백 폰트로
    // 렌더될 때 줄 내부 정렬 계산이 어긋나 글자가 겹친다(실측: 타이틀 1행).
    // 줄마다 별도 Text로 각자 중앙 정렬하면 그 계산 자체가 사라진다.
    const controlLines = [
      '이동: 방향키 / WASD',
      '상호작용(미션 시작): E',
      '대시: Shift · 음소거: M',
      '제한시간 안에 미션 5개를 끝내고 탈출구로!',
    ];
    const lineHeight = 24;
    const controlTop = height * 0.68 - ((controlLines.length - 1) * lineHeight) / 2;

    // 조작키 묶음을 패널 안에 넣는다(ink 알파배경 + warm_tan 테두리, uiPanel.ts).
    // 패널 크기는 실제로 만든 Text의 바운즈를 재서 정한다 — 폰트가 폴백으로 바뀌어도
    // 매직 넘버가 밀리지 않는다.
    const controlTexts = controlLines.map((line, i) =>
      this.add
        .text(width / 2, controlTop + i * lineHeight, line, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: UI_TEXT.capyWhite,
        })
        .setOrigin(0.5)
    );
    const PANEL_PAD_X = 28;
    const PANEL_PAD_Y = 16;
    const maxLineWidth = Math.max(...controlTexts.map((t) => t.width));
    const panelTop = controlTexts[0].y - controlTexts[0].height / 2 - PANEL_PAD_Y;
    const panelBottom =
      controlTexts[controlTexts.length - 1].y + controlTexts[controlTexts.length - 1].height / 2 + PANEL_PAD_Y;
    const panelWidth = maxLineWidth + PANEL_PAD_X * 2;
    const panelGfx = this.add.graphics();
    drawPanel(panelGfx, width / 2 - panelWidth / 2, panelTop, panelWidth, panelBottom - panelTop);
    // 패널을 텍스트보다 먼저 만들면 텍스트가 안 보여서, 그린 뒤 텍스트들을 다시 맨 위로 올린다.
    controlTexts.forEach((t) => t.setDepth(1));
    panelGfx.setDepth(0);

    const startText = this.add
      .text(width / 2, height * 0.9, '클릭 또는 아무 키나 눌러 시작', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: UI_TEXT.accentAmber,
        stroke: UI_TEXT.ink,
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.tweens.add({ targets: startText, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const start = (): void => {
      // 브라우저 자동재생 정책상 AudioContext는 사용자 제스처 핸들러 안에서
      // 동기적으로 시작해야 한다. 이 핸들러가 게임 전체에서 첫 제스처다.
      startBgm();
      this.scene.start('CustomizeScene');
    };
    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
  }
}
