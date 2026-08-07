import Phaser from 'phaser';
import { MISSION } from '../config/balance';
import type { LossCause } from '../sim/types';
import { UI_TEXT } from './palette';
import { PLAYER_TEXTURE_KEY } from './spriteBake';
import { addCozySkyBackground } from './background';
import { drawPanel } from './uiPanel';

/** BootScene과 같은 텍스처 키 — 이미 구워져 있으면 재사용한다(background.ts). */
const SKY_BG_KEY = 'ui_cozy_sky';

/** GameScene이 `scene.start('ResultScene', data)`로 넘기는 데이터. GDD 3장 S4. */
export interface ResultSceneData {
  cleared: boolean;
  lossCause: LossCause;
  timeRemainingSec: number;
  completedCount: number;
  hits: number;
}

/**
 * ResultScene — S4 결과 화면. 승리·패배, 남은 시간, 미션 수, 피격 수, 내 카피바라(GDD 3장).
 * `R`로 재시작 → S2(CustomizeScene). 이 씬도 sim 결과를 그리기만 한다(아키텍처 3).
 */
export class ResultScene extends Phaser.Scene {
  private resultData!: ResultSceneData;

  constructor() {
    super('ResultScene');
  }

  create(data: ResultSceneData): void {
    this.resultData = data;
    const { width, height } = this.scale;

    addCozySkyBackground(this, width, height, SKY_BG_KEY);

    const headline = data.cleared ? '탈출 성공!' : data.lossCause === 'timeout' ? '시간 초과' : '체력 소진';
    const headlineColor = data.cleared ? UI_TEXT.accentAmber : UI_TEXT.capyWhite;

    this.add
      .text(width / 2, 70, headline, {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: headlineColor,
        stroke: UI_TEXT.ink,
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    // 커스터마이즈에서 고른 카피바라 그대로 보여준다 (GDD 11장 2번 — 결과 화면 반영 필수).
    if (this.textures.exists(PLAYER_TEXTURE_KEY)) {
      this.add.image(width / 2, 190, PLAYER_TEXTURE_KEY, 0).setScale(4);
    }

    const remaining = Math.max(0, Math.ceil(data.timeRemainingSec));
    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    const lines = [
      `남은 시간: ${mm}:${String(ss).padStart(2, '0')}`,
      `완료 미션: ${data.completedCount}/${MISSION.REQUIRED_COUNT}`,
      `피격 횟수: ${data.hits}`,
    ];
    // BootScene과 같은 이유로 줄마다 별도 Text로 그린다 —
    // 한 Text + align:'center'는 한글 폴백 폰트에서 줄 내부 정렬이 어긋나 글자가 겹친다.
    const lineHeight = 30;
    const linesTop = 320 - ((lines.length - 1) * lineHeight) / 2;
    const lineTexts = lines.map((line, i) =>
      this.add
        .text(width / 2, linesTop + i * lineHeight, line, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: UI_TEXT.capyWhite,
        })
        .setOrigin(0.5)
    );

    // BootScene의 조작키 패널과 같은 톤 — ink 알파배경 + warm_tan 테두리 (uiPanel.ts).
    const PANEL_PAD_X = 28;
    const PANEL_PAD_Y = 14;
    const maxLineWidth = Math.max(...lineTexts.map((t) => t.width));
    const panelTop = lineTexts[0].y - lineTexts[0].height / 2 - PANEL_PAD_Y;
    const panelBottom = lineTexts[lineTexts.length - 1].y + lineTexts[lineTexts.length - 1].height / 2 + PANEL_PAD_Y;
    const panelWidth = maxLineWidth + PANEL_PAD_X * 2;
    const panelGfx = this.add.graphics();
    drawPanel(panelGfx, width / 2 - panelWidth / 2, panelTop, panelWidth, panelBottom - panelTop);
    lineTexts.forEach((t) => t.setDepth(1));
    panelGfx.setDepth(0);

    const restartText = this.add
      .text(width / 2, 460, '[ R 눌러 재시작 ]', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: UI_TEXT.accentAmber,
        stroke: UI_TEXT.ink,
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: restartText, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const restart = (): void => {
      this.scene.start('CustomizeScene');
    };
    restartText.on('pointerdown', restart);
    this.input.keyboard?.once('keydown-R', restart);
  }
}
