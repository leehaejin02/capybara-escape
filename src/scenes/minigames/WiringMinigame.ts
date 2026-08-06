/**
 * WiringMinigame — M1 배선 잇기 (GDD 5장: "좌우 색 4쌍을 드래그로 연결").
 *
 * 조작: 왼쪽의 켜진(활성) 단자를 잡아 같은 색의 오른쪽 단자로 드래그.
 *  - 전선은 sim 진행도(missionSec)에 따라 0 / 0.2T / 0.4T / 0.6T 시점에 하나씩 켜진다
 *    → 미션 내내 주기적으로 손이 가게 만들어 (b)안의 "죽은 대기시간"을 없앤다.
 *  - 각 전선은 활성화 후 0.35T 안에 연결해야 한다. 넘기면 실패(→ 진행도 리셋).
 *  - 틀린 단자에 놓으면 전선이 되돌아갈 뿐 실패는 아니다(드래그는 오조작이 잦아 관대하게).
 * 완료 판정은 하지 않는다 — 4쌍을 다 이어도 sim의 missionSec이 T에 차야 미션이 끝난다.
 */
import Phaser from 'phaser';
import { UI_HEX, UI_TEXT } from '../palette';
import { MINIGAME_COLOR_SET, permutation4 } from './common';
import type { MinigameContext, MinigameTickResult, MinigameView } from './common';
import { M1_ACTIVATION_INTERVAL_FRAC, M1_WIRE_DEADLINE_FRAC } from './pacing';

/** 패널 내부 레이아웃 (px, 컨테이너 로컬). 밸런스가 아니라 UI 좌표 상수. */
const LEFT_X = 84;
const RIGHT_X = 346;
const ROW0_Y = 66;
const ROW_GAP = 46;
const PEG_R = 11;
const HIT_R = 18;

export class WiringMinigame implements MinigameView {
  private readonly ctx: MinigameContext;
  /** 오른쪽 단자 j의 색 인덱스 = perm[j]. 항등 순열 제외(직선 4개는 난이도 0). */
  private readonly perm: readonly number[];
  /** 왼쪽 단자 i가 연결된 오른쪽 단자 index. 미연결이면 null. */
  private readonly connectedTo: (number | null)[] = [null, null, null, null];
  private dragFrom: number | null = null;
  private pointerLocal = { x: 0, y: 0 };
  private lastSec = 0;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly statusText: Phaser.GameObjects.Text;

  constructor(ctx: MinigameContext) {
    this.ctx = ctx;
    this.perm = permutation4(ctx.seed, true);

    this.gfx = ctx.scene.add.graphics();
    ctx.container.add(this.gfx);

    const hint = ctx.scene.add
      .text(ctx.width / 2, 40, '켜진 단자를 같은 색으로 드래그해 연결하라', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UI_TEXT.capyGrayMid,
      })
      .setOrigin(0.5);
    ctx.container.add(hint);

    this.statusText = ctx.scene.add
      .text(ctx.width / 2, ctx.height - 16, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UI_TEXT.capyWhite,
      })
      .setOrigin(0.5);
    ctx.container.add(this.statusText);

    ctx.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    ctx.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    ctx.scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
  }

  destroy(): void {
    this.ctx.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    this.ctx.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    this.ctx.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
  }

  update(missionSec: number): MinigameTickResult {
    this.lastSec = missionSec;
    const solved = this.connectedTo.every((c) => c !== null);

    if (!solved) {
      for (let i = 0; i < 4; i++) {
        if (this.connectedTo[i] === null && missionSec > this.deadlineSec(i)) {
          this.draw(missionSec);
          return { kind: 'fail', reason: '전선 연결 시간 초과' };
        }
      }
    }

    this.draw(missionSec);
    return solved ? { kind: 'solved' } : { kind: 'ongoing' };
  }

  private activationSec(i: number): number {
    return i * M1_ACTIVATION_INTERVAL_FRAC * this.ctx.durationSec;
  }

  private deadlineSec(i: number): number {
    return this.activationSec(i) + M1_WIRE_DEADLINE_FRAC * this.ctx.durationSec;
  }

  private leftPeg(i: number): { x: number; y: number } {
    return { x: LEFT_X, y: ROW0_Y + i * ROW_GAP };
  }

  private rightPeg(j: number): { x: number; y: number } {
    return { x: RIGHT_X, y: ROW0_Y + j * ROW_GAP };
  }

  private toLocal(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    // 패널은 scrollFactor 0(화면 고정)이라 포인터 화면 좌표 - 컨테이너 위치 = 로컬 좌표.
    return { x: pointer.x - this.ctx.container.x, y: pointer.y - this.ctx.container.y };
  }

  private handleDown(pointer: Phaser.Input.Pointer): void {
    const p = this.toLocal(pointer);
    for (let i = 0; i < 4; i++) {
      if (this.connectedTo[i] !== null) continue;
      if (this.lastSec < this.activationSec(i)) continue;
      const peg = this.leftPeg(i);
      if (Math.hypot(p.x - peg.x, p.y - peg.y) <= HIT_R) {
        this.dragFrom = i;
        this.pointerLocal = p;
        return;
      }
    }
  }

  private handleMove(pointer: Phaser.Input.Pointer): void {
    if (this.dragFrom === null) return;
    this.pointerLocal = this.toLocal(pointer);
  }

  private handleUp(pointer: Phaser.Input.Pointer): void {
    if (this.dragFrom === null) return;
    const p = this.toLocal(pointer);
    for (let j = 0; j < 4; j++) {
      const peg = this.rightPeg(j);
      if (Math.hypot(p.x - peg.x, p.y - peg.y) <= HIT_R && this.perm[j] === this.dragFrom) {
        this.connectedTo[this.dragFrom] = j;
        break;
      }
      // 색이 다른 단자에 놓음 → 전선이 사라질 뿐(실패 아님)
    }
    this.dragFrom = null;
  }

  private draw(sec: number): void {
    const g = this.gfx;
    g.clear();

    // 연결된 전선
    for (let i = 0; i < 4; i++) {
      const j = this.connectedTo[i];
      if (j === null) continue;
      const a = this.leftPeg(i);
      const b = this.rightPeg(j);
      g.lineStyle(4, MINIGAME_COLOR_SET[i], 1);
      g.lineBetween(a.x + PEG_R, a.y, b.x - PEG_R, b.y);
    }

    // 드래그 중인 전선
    if (this.dragFrom !== null) {
      const a = this.leftPeg(this.dragFrom);
      g.lineStyle(3, MINIGAME_COLOR_SET[this.dragFrom], 1);
      g.lineBetween(a.x + PEG_R, a.y, this.pointerLocal.x, this.pointerLocal.y);
    }

    // 단자
    let connectedCount = 0;
    for (let i = 0; i < 4; i++) {
      const active = sec >= this.activationSec(i);
      const done = this.connectedTo[i] !== null;
      if (done) connectedCount++;

      const lp = this.leftPeg(i);
      g.fillStyle(active || done ? MINIGAME_COLOR_SET[i] : UI_HEX.capyGrayDark, 1);
      g.fillCircle(lp.x, lp.y, PEG_R);
      g.lineStyle(2, UI_HEX.ink, 1);
      g.strokeCircle(lp.x, lp.y, PEG_R);

      const rp = this.rightPeg(i);
      g.fillStyle(MINIGAME_COLOR_SET[this.perm[i]], 1);
      g.fillCircle(rp.x, rp.y, PEG_R);
      g.lineStyle(2, UI_HEX.ink, 1);
      g.strokeCircle(rp.x, rp.y, PEG_R);

      // 활성·미연결 전선의 남은 시간 바 (마감이 다가올수록 줄어든다)
      if (active && !done) {
        const frac = Phaser.Math.Clamp(
          (this.deadlineSec(i) - sec) / (this.deadlineSec(i) - this.activationSec(i)),
          0,
          1,
        );
        g.fillStyle(UI_HEX.capyGrayDark, 1);
        g.fillRect(lp.x - 14, lp.y + PEG_R + 4, 28, 3);
        g.fillStyle(UI_HEX.accentAmber, 1);
        g.fillRect(lp.x - 14, lp.y + PEG_R + 4, 28 * frac, 3);
      }
    }

    this.statusText.setText(
      connectedCount === 4 ? '연결 완료 — 마무리 중...' : `연결 ${connectedCount}/4`,
    );
  }
}
