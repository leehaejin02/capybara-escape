/**
 * MinigameOverlay — 미니게임 3종의 수명주기 관리 + sim과의 유일한 접점.
 *
 * ── sim과의 계약 (CLAUDE.md 하네스 1·3, RULES.md §5) ──
 * - 미션의 시작·진행·완료·리셋은 전부 sim이 판정한다. 이 클래스는 `SimState`를 읽어
 *   패널을 열고 닫을 뿐, 어떤 미션 상태도 직접 쓰지 않는다.
 * - 미니게임 실패의 유일한 효과는 **sim의 공식 입력 1틱 주입**이다:
 *   자발적 중단(이동 입력, RULES.md §5.4 bullet 2) → sim이 스스로 진행도를 0으로 되돌린다.
 *   그 틱은 sim 규칙상 이동도 일어나지 않는다(§5.4 "이 틱은 여기서 종료").
 * - 피격 리셋(§6.3 step 4)·자발적 이탈: sim이 missionIndex를 null로 만들면 이 클래스는
 *   그걸 관찰해 패널을 파괴한다 → 미니게임 UI가 sim보다 오래 살아남을 방법이 없다.
 *
 * 시간 정합성: 완료는 항상 sim이 `missionSec >= duration`에 판정하므로, 미니게임을
 * 아무리 잘해도 sim 가정(정확히 duration초)보다 빨라지지 않는다. 실패는 리셋이므로
 * 사람의 실제 소요 시간은 sim 가정 이상이다 — RULES.md §5.1이 문서화한 괴리 방향과 일치.
 */
import Phaser from 'phaser';
import { MISSION } from '../../config/balance';
import type { MissionType, SimInput, SimState } from '../../sim/types';
import { UI_HEX, UI_TEXT } from '../palette';
import type { MinigameView } from './common';
import { WiringMinigame } from './WiringMinigame';
import { TemperatureMinigame } from './TemperatureMinigame';
import { MemoryMinigame } from './MemoryMinigame';

/** 패널·배너 레이아웃 (px, 캔버스 960×640 화면 좌표). 밸런스가 아니라 UI 상수. */
const PANEL_W = 430;
const PANEL_H = 250;
const PANEL_X = 265; // (960 - 430) / 2 — 화면 중앙
const PANEL_Y = 140;
/** 스프라이트 depth(2000 + y, 최대 ≈3184)와 HUD(3000대)보다 위 — 패널은 항상 최상단. */
const PANEL_DEPTH = 4000;
const BANNER_DEPTH = 4100;
/** 패널 배경 알파. ART.md §4 "UI만 반투명 허용" — 뒤로 맵·고블린이 비쳐 보여야 한다. */
const PANEL_BG_ALPHA = 0.7;
const BANNER_Y = 112;
const BANNER_SHOW_MS = 1600;

const TITLE_BY_TYPE: Record<MissionType, string> = {
  M1: 'M1 배선 잇기',
  M2: 'M2 온천 온도 맞추기',
  M3: 'M3 순서 기억',
};

/**
 * 표시용 소요시간 조회. 완료 판정은 sim(`src/sim/mission.ts`의 `durationOf`)이 한다 —
 * 여기는 미니게임 타임라인을 같은 balance.ts 상수로 그리기 위해 다시 읽을 뿐이다.
 */
function durationOf(type: MissionType): number {
  switch (type) {
    case 'M1':
      return MISSION.M1_WIRING_DURATION_SEC;
    case 'M2':
      return MISSION.M2_TEMPERATURE_DURATION_SEC;
    case 'M3':
      return MISSION.M3_MEMORY_DURATION_SEC;
  }
}

type BannerKind = 'good' | 'fail' | 'info';

export class MinigameOverlay {
  private readonly scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private view: MinigameView | null = null;
  private viewMissionIndex: number | null = null;
  /** 미션 지점별 시도 횟수 — 재시도 시 배치(순열) 시드를 바꾸는 데 쓴다. */
  private readonly attemptCount = new Map<number, number>();

  /** 미니게임 실패 → 다음 sim 틱에 "자발적 중단" 입력을 주입하라는 1회성 요청. */
  private cancelPending = false;
  /** 주입한 중단이 실행되기를 기다리는 중 — 이때의 미션 종료는 "실패"로 이미 배너를 띄웠다. */
  private selfCancelInFlight = false;

  private prevMissionIndex: number | null = null;
  private prevCompleted = 0;
  private prevHits = 0;

  private readonly bannerBg: Phaser.GameObjects.Graphics;
  private readonly bannerText: Phaser.GameObjects.Text;
  private bannerUntilMs = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bannerBg = scene.add.graphics().setScrollFactor(0).setDepth(BANNER_DEPTH).setVisible(false);
    this.bannerText = scene.add
      .text(scene.scale.width / 2, BANNER_Y, '', { fontFamily: 'monospace', fontSize: '16px' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(BANNER_DEPTH + 1)
      .setVisible(false);
  }

  /**
   * 매 sim 틱 직전에 호출. 실패 리셋이 예약돼 있으면 그 틱의 입력을 "자발적 중단"으로
   * 대체해 반환한다(1회성). 아니면 null — 호출부는 실제 입력을 그대로 쓴다.
   */
  overrideInput(state: SimState): SimInput | null {
    if (!this.cancelPending) return null;
    this.cancelPending = false;
    if (state.player.missionIndex === null) {
      // 주입 전에 미션이 이미 끝났다(피격 등) — 주입하면 플레이어가 실제로 움직여 버린다.
      return null;
    }
    this.selfCancelInFlight = true;
    // RULES.md §5.4 bullet 2: 이동 입력 → 진행도 0 + 미션 중단. 그 틱은 이동 없이 종료된다.
    return { moveX: 1, moveY: 0, interact: false, dash: false };
  }

  /** 매 렌더 프레임, sim 틱 처리가 끝난 뒤 호출. */
  sync(state: SimState, nowMs: number): void {
    const mi = state.player.missionIndex;

    if (mi !== null) {
      if (this.view !== null && this.viewMissionIndex !== mi) this.closePanel();
      if (this.view === null && !this.cancelPending) this.openPanel(state, mi);
      if (this.view !== null) {
        const res = this.view.update(state.player.missionSec);
        if (res.kind === 'fail') {
          this.closePanel();
          this.cancelPending = true;
          this.showBanner(`실패 — ${res.reason} · 진행도 초기화 (E로 재시작)`, 'fail', nowMs);
        }
      }
    } else {
      if (this.view !== null) this.closePanel();
      if (this.prevMissionIndex !== null) {
        // 미션이 이 프레임 사이에 끝났다 — 원인별로 즉시 읽히는 피드백을 준다.
        if (state.completedCount > this.prevCompleted) {
          this.showBanner('미션 완료!', 'good', nowMs);
        } else if (state.hits > this.prevHits) {
          this.showBanner('피격! 미션 진행도 초기화', 'fail', nowMs);
        } else if (!this.selfCancelInFlight) {
          this.showBanner('미션 중단 — 진행도 초기화', 'info', nowMs);
        }
        // 실패 주입에 의한 종료면 이미 실패 배너가 떠 있다 — 덮어쓰지 않는다.
        this.selfCancelInFlight = false;
      }
    }

    if (nowMs > this.bannerUntilMs) {
      this.bannerBg.setVisible(false);
      this.bannerText.setVisible(false);
    }

    this.prevMissionIndex = mi;
    this.prevCompleted = state.completedCount;
    this.prevHits = state.hits;
  }

  /** 씬 종료(결과 화면 전환) 직전 호출 — 입력 리스너·표시 객체 정리. */
  teardown(): void {
    this.closePanel();
    this.bannerBg.setVisible(false);
    this.bannerText.setVisible(false);
  }

  private openPanel(state: SimState, missionIndex: number): void {
    // 실패 주입과 재시작(E 유지)이 같은 프레임에 겹친 경우의 플래그 잔류 방지 —
    // 새 미션이 열렸으면 "중단 대기" 상태는 더 이상 유효하지 않다.
    this.selfCancelInFlight = false;
    const type = state.missions[missionIndex].type;
    const attempt = this.attemptCount.get(missionIndex) ?? 0;
    this.attemptCount.set(missionIndex, attempt + 1);

    const container = this.scene.add
      .container(PANEL_X, PANEL_Y)
      .setScrollFactor(0)
      .setDepth(PANEL_DEPTH);

    const bg = this.scene.add.graphics();
    bg.fillStyle(UI_HEX.ink, PANEL_BG_ALPHA);
    bg.fillRect(0, 0, PANEL_W, PANEL_H);
    bg.lineStyle(2, UI_HEX.capyGrayMid, 1);
    bg.strokeRect(1, 1, PANEL_W - 2, PANEL_H - 2);
    container.add(bg);

    const title = this.scene.add
      .text(PANEL_W / 2, 18, TITLE_BY_TYPE[type], {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: UI_TEXT.accentAmber,
      })
      .setOrigin(0.5);
    container.add(title);

    const ctx = {
      scene: this.scene,
      container,
      width: PANEL_W,
      height: PANEL_H,
      durationSec: durationOf(type),
      // 시도마다 순열이 바뀌도록 섞는다(특히 M3: 외운 답 재사용 방지). 7·13은 임의의 서로소.
      seed: missionIndex + attempt * 7 + state.completedCount * 13,
    };

    this.container = container;
    this.viewMissionIndex = missionIndex;
    this.view =
      type === 'M1'
        ? new WiringMinigame(ctx)
        : type === 'M2'
          ? new TemperatureMinigame(ctx)
          : new MemoryMinigame(ctx);
  }

  private closePanel(): void {
    if (this.view !== null) {
      this.view.destroy();
      this.view = null;
    }
    if (this.container !== null) {
      this.container.destroy(); // Container는 파괴 시 자식도 함께 파괴한다
      this.container = null;
    }
    this.viewMissionIndex = null;
  }

  private showBanner(msg: string, kind: BannerKind, nowMs: number): void {
    this.bannerText.setText(msg);
    this.bannerText.setColor(
      kind === 'good' ? UI_TEXT.accentAmber : kind === 'fail' ? UI_TEXT.ink : UI_TEXT.capyGrayMid,
    );

    const w = this.bannerText.width + 28;
    const h = this.bannerText.height + 14;
    const cx = this.scene.scale.width / 2;
    this.bannerBg.clear();
    if (kind === 'fail') {
      // 실패는 팔레트에서 가장 튀는 색(amber) 바탕 + ink 텍스트 — 빨강 없이 즉시 읽히게.
      this.bannerBg.fillStyle(UI_HEX.accentAmber, 1);
    } else {
      this.bannerBg.fillStyle(UI_HEX.ink, 0.85);
    }
    this.bannerBg.fillRect(cx - w / 2, BANNER_Y - h / 2, w, h);

    this.bannerBg.setVisible(true);
    this.bannerText.setVisible(true);
    this.bannerUntilMs = nowMs + BANNER_SHOW_MS;
  }
}
