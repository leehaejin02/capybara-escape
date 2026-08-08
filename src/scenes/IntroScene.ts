import Phaser from 'phaser';
import { ROUND, MISSION } from '../config/balance';
import { UI_TEXT, UI_HEX } from './palette';
import { drawPanel } from './uiPanel';
import { ensureWalkAnims, idleFrame, walkAnimKey } from './anims';
import { bodyTextureKey } from './spriteBake';

/**
 * IntroScene — 타이틀(S1)과 커스터마이즈(S2) 사이의 짧은 컷신.
 *
 * 배경은 전용 에셋 `intro_bg`(480×320)를 정수 배율(×2)로 화면 전체에 깐다. 하늘·산·나무·풀밭·흙
 * 지형이 이미 그려져 있어 카피바라가 밟고 설 땅이 생긴다. (사용자 실측 피드백: 이전에는
 * `addCozySkyBackground`의 하늘 디더만 깔려 있어 카피바라가 허공에 떠 보였다 — 그 헬퍼는 이제
 * 이 씬에서 쓰지 않는다.) 카피바라 텍스처(`capy_body_01`)·대화 상자(`drawPanel`)는 그대로 재사용한다.
 *
 * 이 씬은 렌더 전용이다 — 게임 규칙을 판정하지 않는다(CLAUDE.md 아키텍처 3). `src/sim/`을 참조하지 않는다.
 */

// ── 표현값 상수 (게임 판정과 무관한 연출 타이밍/스케일. balance.ts 대상이 아니다) ──

/** 한 글자가 나타나는 간격 (ms). 타이핑 연출 속도 — 판정에 쓰이지 않는다. */
const TYPING_INTERVAL_MS = 40;

/** 카피바라 확대 배율. 정수만 허용(픽셀아트 서브픽셀 금지, CLAUDE.md 하네스). */
const CAPY_SCALE = 3;
/** 스프라이트 프레임(32×32) 아래쪽 투명 여백. 실측 2px — `getBounds()`가 알파 트리밍을
 * 하지 않아 이만큼 보정해야 발끝이 땅에 닿는다. 표현값이지 밸런스 수치가 아니다. */
const CAPY_FRAME_BOTTOM_MARGIN_PX = 2;
/** capy_body_* 시트의 열 수(방향 4행 × 프레임 4열, ART.md §2.1 고정 레이아웃) — 밸런스 아님. */
const CAPY_SHEET_COLS = 4;
/** 걷기 애니메이션 키 이름공간. GameScene의 'player'/'goblin'과 겹치지 않게 분리한다. */
const CAPY_ANIM_PREFIX = 'introCapy';

/** 카피바라가 걸어 들어와 멈추는 x 위치 비율(화면 폭 기준) — "중앙 왼쪽". */
const CAPY_TARGET_X_RATIO = 0.32;
/** 카피바라 발끝이 대화 상자 top에서 몇 px 위에 놓이는지(역산 기준점 — 하드코딩 좌표가 아니라
 * "대화상자 위치 - 이 값"으로 카피바라 발끝을 정한다. 상자 크기가 바뀌어도 따라간다). */
const CAPY_FEET_GAP_ABOVE_BOX_TOP_PX = 24;
/** intro_bg 실측 지형 경계(화면 높이 비율) — 풀밭 구간. 이 밖으로 나가는 발끝 위치는 여기로
 * 클램프한다(사용자 실측: 하늘·산·나무 0~62.7%, 풀밭 62.7~81.4%, 흙 81.4~100%). */
const GRASS_TOP_RATIO = 0.63;
const GRASS_BOTTOM_RATIO = 0.81;
/** 걸어 들어오는 연출 시간 (ms). */
const WALK_IN_DURATION_MS = 1800;

/** 낙하 연출: 회전각(deg) · 지속시간(ms). 목표 y는 화면 밖(흙 구간 아래)까지 내려가야 하므로
 * 고정 px가 아니라 화면 높이에서 파생시킨다(아래 playFall 참조). */
const FALL_ANGLE_DEG = 220;
const FALL_DURATION_MS = 900;
/** 낙하 목표 y가 화면 하단보다 얼마나 더 아래로 내려가는지(px) — 스프라이트가 완전히
 * 화면 밖으로 사라지게 하는 여유값. */
const FALL_OFF_SCREEN_MARGIN_PX = 60;

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

/** `intro_bg` 원본(480×320) → 화면(960×640) 배율. 정수만 허용(픽셀아트 서브픽셀 금지). */
const INTRO_BG_SCALE = 2;

/** 렌더 순서(depth) — 배경 < 구멍 < 카피바라. 구멍이 배경보다 아래(음수)면 배경에 가려 안 보이므로
 * 배경을 더 낮은 값으로 명시해 순서를 보장한다(카피바라가 구멍 위에 서 있다가 빠지는 연출 순서). */
const DEPTH_BG = -10;
const DEPTH_HOLE = -1;
const DEPTH_CAPY = 0;

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
  /** 카피바라 발끝(실제 바운딩 박스 아래끝) y — 구멍 중심도 이 높이에 맞춘다. */
  private capyFeetY = 0;

  constructor() {
    super('IntroScene');
  }

  create(): void {
    const { width, height } = this.scale;

    // intro_bg(480×320)를 정수 배율(×2)로 화면 정중앙에 채운다. 대비가 이미 낮게 그려져 있어
    // 추가로 어둡게 덮는 tint/알파 처리를 넣지 않는다(사용자 요청).
    this.add.image(width / 2, height / 2, 'intro_bg').setOrigin(0.5).setScale(INTRO_BG_SCALE).setDepth(DEPTH_BG);

    // ── 대화 상자 레이아웃(먼저 좌표를 계산해 카피바라 위치도 여기서 파생시킨다) ──
    const boxWidth = width * DIALOGUE_BOX_WIDTH_RATIO;
    const boxHeight = DIALOGUE_BOX_HEIGHT_PX;
    const boxX = (width - boxWidth) / 2;
    const boxY = height - boxHeight - DIALOGUE_BOX_MARGIN_BOTTOM_PX;

    this.capyTargetX = width * CAPY_TARGET_X_RATIO;

    // 발끝 y = 대화상자 top - 24px(역산, 하드코딩 아님). intro_bg 풀밭 구간을 벗어나면 클램프한다.
    const desiredFeetY = boxY - CAPY_FEET_GAP_ABOVE_BOX_TOP_PX;
    this.capyFeetY = Phaser.Math.Clamp(desiredFeetY, height * GRASS_TOP_RATIO, height * GRASS_BOTTOM_RATIO);

    const capySpritePx = 32 * CAPY_SCALE;
    const capyStartX = -capySpritePx; // 화면 완전히 밖에서 시작해 걸어 들어오는 느낌을 준다.

    // ── 카피바라 ──
    ensureWalkAnims(this, bodyTextureKey(0), CAPY_ANIM_PREFIX);
    this.capy = this.add
      .sprite(capyStartX, this.capyFeetY, bodyTextureKey(0), idleFrame(3, CAPY_SHEET_COLS))
      .setOrigin(0.5)
      .setScale(CAPY_SCALE)
      .setDepth(DEPTH_CAPY);

    // origin(0.5)은 스프라이트 캔버스 중심이지 몸통 발끝이 아니다.
    // getBounds()는 **프레임 크기**(32×32 × scale)로 계산한다 — 알파 트리밍을 하지 않으므로
    // 투명 여백까지 포함한다. 그래서 bottom을 그대로 맞추면 그 여백만큼 공중에 뜬다.
    // 실측(2026-08-08, `capy_body_01.png` 16칸 전수): 프레임 아래 투명 여백 최대 **2px**
    // → scale 3에서 6px. 그만큼 더 내려 실제 발끝이 풀밭에 닿게 한다.
    // (`import-ai-art.mjs`의 alignFeet이 16칸 발끝을 한 줄로 맞춰 두어 값이 하나로 정해진다.)
    const footOffset =
      this.capyFeetY - this.capy.getBounds().bottom + CAPY_FRAME_BOTTOM_MARGIN_PX * CAPY_SCALE;
    this.capyY = this.capyFeetY + footOffset;
    this.capy.setY(this.capyY);

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
    // 캔버스 가장자리에 붙으면 잘려 보이므로 안쪽으로 들이고, ink 외곽선을 둘러 어떤 배경 위에서도 읽히게 한다.
    this.add
      .text(width - 14, height - 14, 'ESC 건너뛰기', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UI_TEXT.capyGrayMid,
        stroke: UI_TEXT.ink,
        strokeThickness: 2,
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
    // 구멍 중심은 카피바라 발끝과 같은 높이 — 지형(풀밭)과 어긋나 공중에 뚫린 것처럼 보이지 않게 한다.
    this.holeGfx.fillEllipse(this.capyTargetX, this.capyFeetY, HOLE_RADIUS_X_PX * 2, HOLE_RADIUS_Y_PX * 2);
    // 배경(DEPTH_BG)보다 위, 카피바라(DEPTH_CAPY)보다 아래 — 카피바라가 구멍 위에 서 있다가 빠지는 순서.
    this.holeGfx.setDepth(DEPTH_HOLE);
  }

  private playFall(): void {
    // 흙 구간 아래(화면 밖)까지 내려가야 "떨어지다 만" 것처럼 보이지 않는다 — 화면 높이 기준으로 파생시킨다.
    const fallTargetY = this.scale.height + FALL_OFF_SCREEN_MARGIN_PX;
    this.tweens.add({
      targets: this.capy,
      y: fallTargetY,
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
