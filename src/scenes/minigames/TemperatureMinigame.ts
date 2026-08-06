/**
 * TemperatureMinigame — M2 온천 온도 맞추기 (GDD 5장: "움직이는 바를 초록 구간에서 정지 ×3").
 *
 * 조작: 바가 초록 구간 안에 있을 때 SPACE 또는 클릭.
 *  - 라운드 3개가 sim 진행도(missionSec)를 시계로 [0, 0.3T) / [0.3T, 0.6T) / [0.6T, 0.9T)를
 *    차지한다. 각 라운드에서 바는 창 전체에 걸쳐 왼쪽→오른쪽으로 1회 쓸고 지나간다.
 *  - 초록 구간 밖에서 누르거나, 바가 구간을 지나칠 때까지 안 누르면 실패(→ 진행도 리셋).
 *  - 성공하면 바가 그 자리에 고정되고 다음 라운드는 제 시간에 시작된다.
 * 완료 판정은 하지 않는다 — 3회를 다 맞춰도 sim의 missionSec이 T에 차야 미션이 끝난다.
 */
import Phaser from 'phaser';
import { UI_HEX, UI_TEXT } from '../palette';
import type { MinigameContext, MinigameTickResult, MinigameView } from './common';
import { M2_ROUND_FRAC, M2_ZONE_STARTS, M2_ZONE_WIDTH_FRAC } from './pacing';

/** 패널 내부 레이아웃 (px, 컨테이너 로컬). 밸런스가 아니라 UI 좌표 상수. */
const BAR_X = 65;
const BAR_Y = 118;
const BAR_W = 300;
const BAR_H = 18;
const DOT_Y = 172;

export class TemperatureMinigame implements MinigameView {
  private readonly ctx: MinigameContext;
  private readonly succeeded = [false, false, false];
  /** 성공한 라운드에서 바가 고정된 위치 (0..1). */
  private readonly frozenU = [0, 0, 0];
  private pendingPress = false;
  private failReason: string | null = null;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly spaceKey: Phaser.Input.Keyboard.Key;

  constructor(ctx: MinigameContext) {
    this.ctx = ctx;

    this.gfx = ctx.scene.add.graphics();
    ctx.container.add(this.gfx);

    const hint = ctx.scene.add
      .text(ctx.width / 2, 40, '바가 초록 구간에 있을 때 SPACE (또는 클릭)', {
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

    this.spaceKey = ctx.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    ctx.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
  }

  destroy(): void {
    this.ctx.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    this.ctx.scene.input.keyboard!.removeKey(this.spaceKey, true);
  }

  update(missionSec: number): MinigameTickResult {
    const T = this.ctx.durationSec;
    const roundLen = M2_ROUND_FRAC * T;
    const solved = this.succeeded.every(Boolean);

    if (solved) {
      this.pendingPress = false;
      this.draw(missionSec);
      return { kind: 'solved' };
    }

    const r = Math.min(Math.floor(missionSec / roundLen), 2);

    // 프레임이 라운드 경계를 건너뛴 경우 대비: 지나간 라운드가 미성공이면 실패
    for (let q = 0; q < r; q++) {
      if (!this.succeeded[q]) return this.fail(missionSec, '온도 구간을 놓쳤다');
    }

    const u = Phaser.Math.Clamp((missionSec - r * roundLen) / roundLen, 0, 1);
    const zone = this.zone(r);

    // 바가 초록 구간을 지나쳤는데 안 눌렀다 → 더는 성공할 수 없으므로 즉시 실패
    if (!this.succeeded[r] && u > zone.end) {
      return this.fail(missionSec, '온도 구간을 놓쳤다');
    }

    // 입력 처리 (SPACE / 클릭)
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.pendingPress = true;
    if (this.pendingPress) {
      this.pendingPress = false;
      if (!this.succeeded[r]) {
        if (u >= zone.start && u <= zone.end) {
          this.succeeded[r] = true;
          this.frozenU[r] = u;
        } else {
          return this.fail(missionSec, '초록 구간 밖에서 정지했다');
        }
      }
    }

    this.draw(missionSec);
    if (this.failReason) return { kind: 'fail', reason: this.failReason };
    return this.succeeded.every(Boolean) ? { kind: 'solved' } : { kind: 'ongoing' };
  }

  private fail(sec: number, reason: string): MinigameTickResult {
    this.failReason = reason;
    this.draw(sec);
    return { kind: 'fail', reason };
  }

  private zone(r: number): { start: number; end: number } {
    const start = M2_ZONE_STARTS[(this.ctx.seed + r) % M2_ZONE_STARTS.length];
    return { start, end: start + M2_ZONE_WIDTH_FRAC };
  }

  private handlePointer(): void {
    this.pendingPress = true;
  }

  private draw(missionSec: number): void {
    const T = this.ctx.durationSec;
    const roundLen = M2_ROUND_FRAC * T;
    const r = Math.min(Math.floor(missionSec / roundLen), 2);
    const solved = this.succeeded.every(Boolean);
    const zone = this.zone(r);

    const g = this.gfx;
    g.clear();

    // 바 배경 + 초록 구간
    g.fillStyle(UI_HEX.capyGrayDark, 1);
    g.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
    g.fillStyle(UI_HEX.goblinMid, 1);
    g.fillRect(BAR_X + zone.start * BAR_W, BAR_Y, (zone.end - zone.start) * BAR_W, BAR_H);
    g.lineStyle(2, UI_HEX.ink, 1);
    g.strokeRect(BAR_X, BAR_Y, BAR_W, BAR_H);

    // 마커: 현재 라운드 성공 시 고정 위치, 아니면 진행 위치
    const u = this.succeeded[r]
      ? this.frozenU[r]
      : Phaser.Math.Clamp((missionSec - r * roundLen) / roundLen, 0, 1);
    g.fillStyle(UI_HEX.capyWhite, 1);
    g.fillRect(BAR_X + u * BAR_W - 2, BAR_Y - 5, 4, BAR_H + 10);

    // 라운드 진행 점 3개
    for (let i = 0; i < 3; i++) {
      const x = this.ctx.width / 2 + (i - 1) * 26;
      if (this.succeeded[i]) {
        g.fillStyle(UI_HEX.accentAmber, 1);
        g.fillCircle(x, DOT_Y, 6);
      } else {
        g.lineStyle(2, i === r ? UI_HEX.capyWhite : UI_HEX.capyGrayMid, 1);
        g.strokeCircle(x, DOT_Y, 6);
      }
    }

    this.statusText.setText(
      solved ? '온도 안정화 중...' : this.succeeded[r] ? '고정! 다음 온도 대기...' : `정지 ${this.succeeded.filter(Boolean).length}/3`,
    );
  }
}
