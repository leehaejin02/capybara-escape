import Phaser from 'phaser';
import { ROUND, MISSION } from '../config/balance';
import { UI_TEXT, UI_HEX } from './palette';
import { addCozySkyBackground } from './background';
import { drawPanel } from './uiPanel';
import { ensureWalkAnims, idleFrame, walkAnimKey } from './anims';
import { bodyTextureKey } from './spriteBake';

/**
 * IntroScene — 타이틀(S1)과 커스터마이즈(S2) 사이의 짧은 컷신.
 *
 * 새 에셋 없이 기존 텍스처(`capy_body_01`)·배경 헬퍼(`addCozySkyBackground`)·패널 헬퍼
 * (`drawPanel`)만 조합한다. 이 씬은 렌더 전용이다 — 게임 규칙을 판정하지 않는다
 * (CLAUDE.md 아키텍처 3). `src/sim/`을 참조하지 않는다.
 *
 * 배경 선택: 스펙은 "title_screen을 어둡게 깔거나, 로고가 거슬리면 addCozySkyBackground를
 * 써도 좋다"고 위임했다 — `addCozySkyBackground`를 골랐다. `title_screen`에는 이미 로고+
 * 게임 제목 글자가 그려져 있어, 그 위에 다시 대사 텍스트를 얹으면 "글자 위에 글자"가 되고
 * 씬을 시작하자마자 타이틀을 또 보여주는 중복감이 생긴다. `addCozySkyBackground`는
 * CustomizeScene·ResultScene과 이미 같은 톤을 공유하는 중립 배경이라 컷신 대사에 방해되지 않는다.
 */

// ── 표현값 상수 (게임 판정과 무관한 연출 타이밍/스케일. balance.ts 대상이 아니다) ──

/** 한 글자가 나타나는 간격 (ms). 타이핑 연출 속도 — 판정에 쓰이지 않는다. */
const TYPING_INTERVAL_MS = 40;

/** 카피바라 확대 배율. 정수만 허용(픽셀아트 서브픽셀 금지, CLAUDE.md 하네스). */
const CAPY_SCALE = 3;
/** capy_body_* 시트의 열 수(방향 4행 × 프레임 4열, ART.md §2.1 고정 레이아웃) — 밸런스 아님. */
const CAPY_SHEET_COLS = 4;
/** 걷기 애니메이션 키 이름공간. GameScene의 'player'/'goblin'과 겹치지 않게 분리한다. */
const CAPY_ANIM_PREFIX = 'introCapy';

/** 카피바라가 걸어 들어와 멈추는 x 위치 비율(화면 폭 기준) — "중앙 왼쪽". */
const CAPY_TARGET_X_RATIO = 0.32;
/** 카피바라가 대화 상자 위에서 몇 px 띄워 서는지. */
const CAPY_GAP_ABOVE_BOX_PX = 130;
/** 걸어 들어오는 연출 시간 (ms). */
const WALK_IN_DURATION_MS = 1800;

/** 낙하 연출: 아래로 내려가는 거리(px) · 회전각(deg) · 지속시간(ms). */
const FALL_DROP_PX = 220;
const FALL_ANGLE_DEG = 220;
const FALL_DURATION_MS = 900;

/** 구멍(어두운 타원) 반경(px). */
const HOLE_RADIUS_X_PX = 34;
const HOLE_RADIUS_Y_PX = 13;

/** 화면 암전 연출: 최대 알파 · 유지시간(ms) · 페이드 인/아웃 각각 시간(ms). */
const DIM_FADE_ALPHA = 0.85;
const DIM_FADE_DURATION_MS = 350;
const DIM_FADE_HOLD_MS = 250;

/** 대화 상자 크기·여백. 폭은 화면의 약 80%, 높이 약 110px(스펙 지정). */
const DIALOGUE_BOX_WIDTH_RATIO = 0.8;
const DIALOGUE_BOX_HEIGHT_PX = 110;
const DIALOGUE_BOX_MARGIN_BOTTOM_PX = 26;
const DIALOGUE_BOX_PAD_X = 24;
const DIALOGUE_BOX_PAD_Y = 18;

/** ▼ 커서 깜빡임 주기(ms). */
const ARROW_BLINK_DURATION_MS = 500;

/** S1(타이틀)과 다른 새 배경(구멍/암전 연출이 겹치므로 별도 키로 굽는다 — 텍스처 재사용 시
 * 같은 캔버스를 다른 씬과 공유해도 무방하지만, 명시적으로 이름을 남겨 의도를 드러낸다). */
const SKY_BG_KEY = 'ui_cozy_sky';

interface IntroLine {
  text: string;
  /** 이 대사가 시작될 때(타이핑 시작 직전) 1회 실행되는 연출 콜백. */
  onEnter?: () => void;
}

export class IntroScene extends Phaser.Scene {
  private capy!: Phaser.GameObjects.Sprite;
  private holeGfx?: Phaser.GameObjects.Graphics;
  private dimOverlay!: Phaser.GameObjects.Rectangle;
  private dialogueText!: Phaser.GameObjects.Text;
  private arrowText!: Phaser.GameObjects.Text;

  private lines: IntroLine[] = [];
  private lineIndex = 0;
  private lineChars: string[] = [];
  private charIndex = 0;
  private typingTimer?: Phaser.Time.TimerEvent;
  private typingComplete = false;

  /** 낙하 지점(구멍 중심) 좌표 — create()에서 계산해 onEnter 콜백들이 재사용한다. */
  private capyTargetX = 0;
  private capyY = 0;

  constructor() {
    super('IntroScene');
  }

  create(): void {
    const { width, height } = this.scale;

    addCozySkyBackground(this, width, height, SKY_BG_KEY);

    // ── 대화 상자 레이아웃(먼저 좌표를 계산해 카피바라 위치도 여기서 파생시킨다) ──
    const boxWidth = width * DIALOGUE_BOX_WIDTH_RATIO;
    const boxHeight = DIALOGUE_BOX_HEIGHT_PX;
    const boxX = (width - boxWidth) / 2;
    const boxY = height - boxHeight - DIALOGUE_BOX_MARGIN_BOTTOM_PX;

    this.capyTargetX = width * CAPY_TARGET_X_RATIO;
    this.capyY = boxY - CAPY_GAP_ABOVE_BOX_PX;
    const capySpritePx = 32 * CAPY_SCALE;
    const capyStartX = -capySpritePx; // 화면 완전히 밖에서 시작해 걸어 들어오는 느낌을 준다.

    // ── 카피바라 ──
    ensureWalkAnims(this, bodyTextureKey(0), CAPY_ANIM_PREFIX);
    this.capy = this.add
      .sprite(capyStartX, this.capyY, bodyTextureKey(0), idleFrame(3, CAPY_SHEET_COLS))
      .setOrigin(0.5)
      .setScale(CAPY_SCALE);

    // ── 화면 암전 오버레이(4번째 대사에서만 잠깐 씀) — 항상 최상단에 두되 평소엔 투명. ──
    this.dimOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(1000);

    // ── 대화 상자(uiPanel.drawPanel) ──
    this.dialogueText = this.add.text(boxX + DIALOGUE_BOX_PAD_X, boxY + DIALOGUE_BOX_PAD_Y, '', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: UI_TEXT.capyWhite,
      wordWrap: { width: boxWidth - DIALOGUE_BOX_PAD_X * 2, useAdvancedWrap: true },
    });

    this.arrowText = this.add
      .text(boxX + boxWidth - 28, boxY + boxHeight - 22, '▼', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: UI_TEXT.accentAmber,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.tweens.add({
      targets: this.arrowText,
      alpha: 0.2,
      duration: ARROW_BLINK_DURATION_MS,
      yoyo: true,
      repeat: -1,
    });

    const boxGfx = this.add.graphics();
    drawPanel(boxGfx, boxX, boxY, boxWidth, boxHeight);
    // 패널을 나중에 그리면 위에 덮이므로, 이미 만든 텍스트류를 다시 앞으로 올린다
    // (BootScene·CustomizeScene·ResultScene과 같은 처리 순서).
    boxGfx.setDepth(0);
    this.dialogueText.setDepth(1);
    this.arrowText.setDepth(1);

    // ── ESC 건너뛰기 힌트 — 항상 화면 우하단에 표시(촬영 동선을 막지 않기 위한 필수 기능). ──
    this.add
      .text(width - 12, height - 6, 'ESC 건너뛰기', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UI_TEXT.capyGrayMid,
      })
      .setOrigin(1, 1)
      .setDepth(2);

    // ── 대사 흐름 정의 ──
    this.lines = [
      { text: '평소처럼 길을 걸어가던 카피바라.', onEnter: () => this.playWalkIn(capyStartX) },
      { text: '발밑에 구멍이 뻥.', onEnter: () => this.showHole() },
      { text: '…어?', onEnter: () => this.playFall() },
      { text: '정신을 차려 보니, 처음 보는 곳이었다.', onEnter: () => this.playDimFade() },
      { text: '여긴 고블린의 서식지.' },
      {
        // GDD 7장 제한시간·미션 개수는 balance.ts가 원본이다 — 대사에 직접 숫자를 적지 않고
        // 여기서 파생해, balance.ts가 바뀌어도 대사가 따라간다(CLAUDE.md 하네스 1).
        text: `제한시간 ${ROUND.TIME_LIMIT_SEC / 60}분 안에 미션 ${MISSION.REQUIRED_COUNT}개를 끝내고 탈출해야 한다.`,
      },
      { text: '방향키·WASD 이동 · E 상호작용 · Shift 대시 · M 음소거' },
    ];

    // ── 입력 배선 ──
    this.input.on('pointerdown', () => this.handleAdvance());
    const kb = this.input.keyboard;
    kb?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') return; // ESC는 건너뛰기 전용 — 아래에서 별도 처리.
      this.handleAdvance();
    });
    kb?.on('keydown-ESC', () => this.skip());

    this.startLine(0);

    // 씬을 떠날 때 타이핑 타이머·진행 중이던 tween이 남지 않게 정리한다(재진입 시 중복 생성
    // 방지 — anims.ts의 force 인자 주석과 같은 이유의 실수를 컷신에서 반복하지 않기 위함).
    this.events.once('shutdown', () => this.cleanup());
  }

  // ── 연출 콜백 ──

  private playWalkIn(startX: number): void {
    this.capy.setPosition(startX, this.capyY).setAlpha(1).setAngle(0);
    this.capy.play(walkAnimKey(CAPY_ANIM_PREFIX, 3));
    this.tweens.add({
      targets: this.capy,
      x: this.capyTargetX,
      duration: WALK_IN_DURATION_MS,
      ease: 'Linear',
      onComplete: () => {
        this.capy.anims.stop();
        this.capy.setTexture(bodyTextureKey(0), idleFrame(3, CAPY_SHEET_COLS));
      },
    });
  }

  private showHole(): void {
    if (this.holeGfx) return;
    this.holeGfx = this.add.graphics();
    this.holeGfx.fillStyle(UI_HEX.ink, 0.85);
    const feetY = this.capyY + (32 * CAPY_SCALE) / 2 - 6;
    this.holeGfx.fillEllipse(this.capyTargetX, feetY, HOLE_RADIUS_X_PX * 2, HOLE_RADIUS_Y_PX * 2);
    this.holeGfx.setDepth(-1); // 카피바라 발밑에 깔리도록 뒤로 보낸다.
  }

  private playFall(): void {
    this.tweens.add({
      targets: this.capy,
      y: this.capyY + FALL_DROP_PX,
      angle: FALL_ANGLE_DEG,
      alpha: 0,
      duration: FALL_DURATION_MS,
      ease: 'Cubic.easeIn',
    });
  }

  private playDimFade(): void {
    this.dimOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.dimOverlay,
      alpha: DIM_FADE_ALPHA,
      duration: DIM_FADE_DURATION_MS,
      yoyo: true,
      hold: DIM_FADE_HOLD_MS,
    });
  }

  // ── 타이핑 진행 ──

  private startLine(index: number): void {
    this.lineIndex = index;
    const line = this.lines[index];
    this.lineChars = Array.from(line.text);
    this.charIndex = 0;
    this.typingComplete = false;
    this.dialogueText.setText('');
    this.arrowText.setVisible(false);

    this.typingTimer?.remove(false);
    line.onEnter?.();

    this.typingTimer = this.time.addEvent({
      delay: TYPING_INTERVAL_MS,
      loop: true,
      callback: () => this.advanceTyping(),
    });
  }

  private advanceTyping(): void {
    if (this.charIndex >= this.lineChars.length) {
      this.completeTyping();
      return;
    }
    this.charIndex += 1;
    this.dialogueText.setText(this.lineChars.slice(0, this.charIndex).join(''));
    if (this.charIndex >= this.lineChars.length) {
      this.completeTyping();
    }
  }

  private completeTyping(): void {
    this.typingTimer?.remove(false);
    this.typingTimer = undefined;
    this.typingComplete = true;
    this.dialogueText.setText(this.lineChars.join(''));
    this.arrowText.setVisible(true);
  }

  private handleAdvance(): void {
    if (!this.typingComplete) {
      // 타이핑 중 입력 → 생략이 아니라 즉시 전체 표시(가속).
      this.completeTyping();
      return;
    }
    if (this.lineIndex + 1 < this.lines.length) {
      this.startLine(this.lineIndex + 1);
    } else {
      this.finish();
    }
  }

  private finish(): void {
    this.scene.start('CustomizeScene');
  }

  private skip(): void {
    this.scene.start('CustomizeScene');
  }

  private cleanup(): void {
    this.typingTimer?.remove(false);
    this.typingTimer = undefined;
    this.tweens.killAll();
  }
}
