/**
 * MemoryMinigame — M3 순서 기억 (GDD 5장: "4개 아이콘 점멸 순서대로 클릭").
 *
 * 조작: 점멸 페이즈([0, T/3))에 4개 아이콘이 순서대로 한 번씩 켜진다. 입력 페이즈에
 * 그 순서대로 아이콘을 클릭(또는 키 1~4 — 아이콘의 왼쪽부터의 위치에 대응)한다.
 *  - 틀린 아이콘을 누르면 실패(→ 진행도 리셋).
 *  - n번째 입력이 마감(입력 페이즈 4등분)을 넘기면 실패 — 방치도 실패다.
 *  - 점멸 페이즈의 클릭은 무시한다(실수 방지).
 * 완료 판정은 하지 않는다 — 4개를 다 맞혀도 sim의 missionSec이 T에 차야 미션이 끝난다.
 * 재시도(실패·피격 후)에는 seed가 바뀌어 점멸 순서가 달라진다 — 외운 답 재사용 방지.
 */
import Phaser from 'phaser';
import { UI_HEX, UI_TEXT } from '../palette';
import { MINIGAME_COLOR_SET, permutation4 } from './common';
import type { MinigameContext, MinigameTickResult, MinigameView } from './common';
import { M3_FLASH_ON_FRAC, M3_FLASH_PHASE_FRAC, M3_INPUT_END_FRAC } from './pacing';

/** 패널 내부 레이아웃 (px, 컨테이너 로컬). 밸런스가 아니라 UI 좌표 상수. */
const BOX_SIZE = 56;
const BOX_GAP = 28;
const BOX_CY = 130;
const PROGRESS_Y = 186;
const DEADLINE_BAR_Y = 202;

export class MemoryMinigame implements MinigameView {
  private readonly ctx: MinigameContext;
  /** 점멸 순서: seq[k] = k번째로 켜지는 아이콘의 위치(0..3). */
  private readonly seq: readonly number[];
  private inputIndex = 0;
  private lastGoodSec = -1;
  private readonly pendingChoices: number[] = [];
  private failReason: string | null = null;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly keys: Phaser.Input.Keyboard.Key[];

  constructor(ctx: MinigameContext) {
    this.ctx = ctx;
    this.seq = permutation4(ctx.seed, false);

    this.gfx = ctx.scene.add.graphics();
    ctx.container.add(this.gfx);

    this.phaseText = ctx.scene.add
      .text(ctx.width / 2, 40, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UI_TEXT.capyGrayMid,
      })
      .setOrigin(0.5);
    ctx.container.add(this.phaseText);

    // 키 라벨 1~4 (아이콘 아래 고정)
    for (let i = 0; i < 4; i++) {
      const label = ctx.scene.add
        .text(this.boxCx(i), BOX_CY + BOX_SIZE / 2 + 10, String(i + 1), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: UI_TEXT.capyGrayMid,
        })
        .setOrigin(0.5);
      ctx.container.add(label);
    }

    const kb = ctx.scene.input.keyboard!;
    this.keys = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
    ].map((kc) => kb.addKey(kc));

    ctx.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
  }

  destroy(): void {
    this.ctx.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    const kb = this.ctx.scene.input.keyboard!;
    for (const key of this.keys) kb.removeKey(key, true);
  }

  update(missionSec: number): MinigameTickResult {
    const T = this.ctx.durationSec;
    const flashEnd = M3_FLASH_PHASE_FRAC * T;
    const solved = this.inputIndex >= 4;

    if (solved) {
      this.pendingChoices.length = 0;
      this.draw(missionSec);
      return { kind: 'solved' };
    }

    // 입력 수집 (키 1~4 + 클릭)
    for (let i = 0; i < 4; i++) {
      if (Phaser.Input.Keyboard.JustDown(this.keys[i])) this.pendingChoices.push(i);
    }
    while (this.pendingChoices.length > 0) {
      const b = this.pendingChoices.shift()!;
      if (missionSec < flashEnd) continue; // 점멸 페이즈 클릭은 무시
      if (b === this.seq[this.inputIndex]) {
        this.inputIndex++;
        this.lastGoodSec = missionSec;
        if (this.inputIndex >= 4) break;
      } else {
        this.failReason = '순서가 틀렸다';
        break;
      }
    }
    if (this.failReason) {
      this.draw(missionSec);
      return { kind: 'fail', reason: this.failReason };
    }

    // 마감: 입력 페이즈를 4등분해 n번째 입력의 마감을 배정. 방치도 실패다.
    if (this.inputIndex < 4 && missionSec > this.clickDeadlineSec(this.inputIndex)) {
      this.draw(missionSec);
      return { kind: 'fail', reason: '입력 시간 초과' };
    }

    this.draw(missionSec);
    return this.inputIndex >= 4 ? { kind: 'solved' } : { kind: 'ongoing' };
  }

  private clickDeadlineSec(n: number): number {
    const T = this.ctx.durationSec;
    const flashEnd = M3_FLASH_PHASE_FRAC * T;
    const perClick = (M3_INPUT_END_FRAC * T - flashEnd) / 4;
    return flashEnd + (n + 1) * perClick;
  }

  private boxCx(i: number): number {
    const total = 4 * BOX_SIZE + 3 * BOX_GAP;
    return (this.ctx.width - total) / 2 + BOX_SIZE / 2 + i * (BOX_SIZE + BOX_GAP);
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    const x = pointer.x - this.ctx.container.x;
    const y = pointer.y - this.ctx.container.y;
    for (let i = 0; i < 4; i++) {
      if (
        Math.abs(x - this.boxCx(i)) <= BOX_SIZE / 2 &&
        Math.abs(y - BOX_CY) <= BOX_SIZE / 2
      ) {
        this.pendingChoices.push(i);
        return;
      }
    }
  }

  private draw(missionSec: number): void {
    const T = this.ctx.durationSec;
    const flashEnd = M3_FLASH_PHASE_FRAC * T;
    const inFlash = missionSec < flashEnd;
    const solved = this.inputIndex >= 4;

    // 점멸 페이즈: 현재 켜져 있는 아이콘 위치
    let litBox = -1;
    if (inFlash) {
      const slotLen = flashEnd / 4;
      const slot = Math.floor(missionSec / slotLen);
      if (slot < 4 && missionSec - slot * slotLen < slotLen * M3_FLASH_ON_FRAC) {
        litBox = this.seq[slot];
      }
    } else if (this.lastGoodSec >= 0 && missionSec - this.lastGoodSec < 0.25) {
      litBox = this.seq[this.inputIndex - 1]; // 정답 직후 짧은 확인 점등
    }

    const g = this.gfx;
    g.clear();

    for (let i = 0; i < 4; i++) {
      const cx = this.boxCx(i);
      const lit = i === litBox;
      const half = BOX_SIZE / 2;

      g.fillStyle(lit ? UI_HEX.capyGrayDark : UI_HEX.ink, 1);
      g.fillRect(cx - half, BOX_CY - half, BOX_SIZE, BOX_SIZE);
      g.lineStyle(lit ? 3 : 2, lit ? UI_HEX.capyWhite : UI_HEX.capyGrayMid, 1);
      g.strokeRect(cx - half, BOX_CY - half, BOX_SIZE, BOX_SIZE);

      // 아이콘: 위치별로 모양+색을 다르게 (원/사각/삼각/마름모 — 색맹 대비 겸용)
      const c = MINIGAME_COLOR_SET[i];
      const r = lit ? 15 : 12;
      g.fillStyle(c, 1);
      if (i === 0) {
        g.fillCircle(cx, BOX_CY, r);
      } else if (i === 1) {
        g.fillRect(cx - r, BOX_CY - r, r * 2, r * 2);
      } else if (i === 2) {
        g.fillTriangle(cx, BOX_CY - r, cx - r, BOX_CY + r, cx + r, BOX_CY + r);
      } else {
        g.fillTriangle(cx, BOX_CY - r, cx - r, BOX_CY, cx + r, BOX_CY);
        g.fillTriangle(cx - r, BOX_CY, cx + r, BOX_CY, cx, BOX_CY + r);
      }
    }

    // 입력 진행 점 4개
    for (let n = 0; n < 4; n++) {
      const x = this.ctx.width / 2 + (n - 1.5) * 22;
      if (n < this.inputIndex) {
        g.fillStyle(UI_HEX.accentAmber, 1);
        g.fillCircle(x, PROGRESS_Y, 5);
      } else {
        g.lineStyle(2, UI_HEX.capyGrayMid, 1);
        g.strokeCircle(x, PROGRESS_Y, 5);
      }
    }

    // 입력 페이즈: 현재 입력의 남은 시간 바
    if (!inFlash && !solved) {
      const dl = this.clickDeadlineSec(this.inputIndex);
      const prev = this.inputIndex === 0 ? flashEnd : this.clickDeadlineSec(this.inputIndex - 1);
      const frac = Phaser.Math.Clamp((dl - missionSec) / (dl - prev), 0, 1);
      const w = 200;
      g.fillStyle(UI_HEX.capyGrayDark, 1);
      g.fillRect(this.ctx.width / 2 - w / 2, DEADLINE_BAR_Y, w, 4);
      g.fillStyle(UI_HEX.accentAmber, 1);
      g.fillRect(this.ctx.width / 2 - w / 2, DEADLINE_BAR_Y, w * frac, 4);
    }

    this.phaseText.setText(
      solved ? '순서 입력 완료 — 마무리 중...' : inFlash ? '점멸 순서를 기억하라...' : '기억한 순서대로 클릭 (키 1~4)',
    );
  }
}
