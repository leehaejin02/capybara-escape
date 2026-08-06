import Phaser from 'phaser';
import { MISSION } from '../config/balance';
import type { LossCause } from '../sim/types';
import { UI_TEXT } from './palette';
import { PLAYER_TEXTURE_KEY } from './spriteBake';

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
    this.cameras.main.setBackgroundColor(UI_TEXT.ink);

    const headline = data.cleared ? '탈출 성공!' : data.lossCause === 'timeout' ? '시간 초과' : '체력 소진';
    const headlineColor = data.cleared ? UI_TEXT.accentAmber : UI_TEXT.capyWhite;

    this.add.text(width / 2, 70, headline, { fontFamily: 'monospace', fontSize: '40px', color: headlineColor }).setOrigin(0.5);

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
    lines.forEach((line, i) => {
      this.add
        .text(width / 2, linesTop + i * lineHeight, line, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: UI_TEXT.capyWhite,
        })
        .setOrigin(0.5);
    });

    const restartText = this.add
      .text(width / 2, 460, '[ R 눌러 재시작 ]', { fontFamily: 'monospace', fontSize: '22px', color: UI_TEXT.accentAmber })
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
