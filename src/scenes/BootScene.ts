import Phaser from 'phaser';
import { UI_TEXT } from './palette';

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
  { key: 'tile_floor', frameWidth: 32, frameHeight: 32 },
  { key: 'marker_mission', frameWidth: 32, frameHeight: 32 },
  { key: 'marker_exit', frameWidth: 32, frameHeight: 32 },
];

/** 프레임이 1개뿐인 단순 이미지. docs/ART.md §2.2. */
const IMAGES: readonly string[] = ['tile_wall', 'tile_bush', 'tile_spa'];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    this.add
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
    this.cameras.main.setBackgroundColor(UI_TEXT.ink);
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height * 0.28, 'Capybara Escape', { fontFamily: 'monospace', fontSize: '40px', color: UI_TEXT.capyWhite })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.38, '카피바라를 꾸미고, 고블린을 피해 미션 5개를 끝내고 탈출하라', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: UI_TEXT.capyGrayMid,
      })
      .setOrigin(0.5);

    // 한 Text에 '\n'으로 넣고 align:'center'를 주면 한글이 monospace 폴백 폰트로
    // 렌더될 때 줄 내부 정렬 계산이 어긋나 글자가 겹친다(실측: 타이틀 1행).
    // 줄마다 별도 Text로 각자 중앙 정렬하면 그 계산 자체가 사라진다.
    const controlLines = ['이동: 방향키 / WASD', '상호작용(미션 시작): E', '대시: Shift', '제한시간 안에 미션 5개를 끝내고 탈출구로!'];
    const lineHeight = 24;
    const controlTop = height * 0.55 - ((controlLines.length - 1) * lineHeight) / 2;
    controlLines.forEach((line, i) => {
      this.add
        .text(width / 2, controlTop + i * lineHeight, line, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: UI_TEXT.capyWhite,
        })
        .setOrigin(0.5);
    });

    const startText = this.add
      .text(width / 2, height * 0.82, '클릭 또는 아무 키나 눌러 시작', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: UI_TEXT.accentAmber,
      })
      .setOrigin(0.5);

    this.tweens.add({ targets: startText, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const start = (): void => {
      this.scene.start('CustomizeScene');
    };
    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
  }
}
