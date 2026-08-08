/**
 * sim 전용 자체 타입.
 *
 * Phaser의 Math.Vector2 등 Phaser 타입을 절대 재사용하지 않는다 — src/sim/은
 * Phaser를 몰라야 한다. 이 파일이 그 경계의 타입 쪽 절반이다.
 *
 * RULES.md §2~§7의 상태 필드를 그대로 옮겼다. 각 필드 옆 주석에 출처 절을 적었다.
 */

/** 2D 벡터. Phaser.Math.Vector2를 대체하는 sim 자체 타입. */
export interface Vec2 {
  x: number;
  y: number;
}

/** 한 틱에 봇/플레이어가 world에 넣는 입력. */
export interface SimInput {
  /** 좌우 이동 의도 (-1..1). */
  moveX: number;
  /** 상하 이동 의도 (-1..1). */
  moveY: number;
  /** 상호작용(E) 의도. */
  interact: boolean;
  /** 대시 의도. */
  dash: boolean;
}

/** 패배 원인. */
export type LossCause = 'timeout' | 'hp0' | 'none';

/** 미션 타입. §5.2/§5.5. */
export type MissionType = 'M1' | 'M2' | 'M3';

/** 고블린 FSM 상태. §4.1. GDD 6장 4상태 그대로. */
export type GoblinFsmState = 'PATROL' | 'CHASE' | 'SEARCH' | 'ATTACK';

/** 플레이어(카피바라) 런타임 상태. §3, §5.2, §6.5. */
export interface Player {
  pos: Vec2;
  hp: number;
  /**
   * 4방향으로 양자화된 단위 벡터(§3.1). 이동 벡터 자체와는 별개이며 게임 규칙 판정(충돌·시야 등)에
   * 쓰지 않는다 — 렌더 방향 힌트이자 §7.5 봇 FLEE 폴백("sum이 완전히 상쇄되면 -bot.facing")이 읽는 값이다.
   * 초기값 (0,1)(아래)은 §6.5.
   */
  facing: Vec2;
  invulnSec: number;
  dashSec: number;
  dashCooldownSec: number;
  /** 진행 중인 미션 지점 index. 없으면 null(§5.2). */
  missionIndex: number | null;
  missionSec: number;
}

/** 고블린 런타임 상태. §4.1 필드 표 그대로. */
export interface Goblin {
  pos: Vec2;
  state: GoblinFsmState;
  /** 단위 벡터. 시야 판정의 기준축(§4.2). */
  facing: Vec2;
  /** 순찰로 인덱스(다음 목표). */
  wpIndex: number;
  lastSeenPos: Vec2;
  loseSightSec: number;
  searchSec: number;
  attackSec: number;
  /** 우회 커밋 방향(단위 벡터, §4.6). */
  avoidDir: Vec2;
  /** 우회 커밋 잔여 시간(§4.6). */
  avoidSec: number;
  /** CHASE 중 전진 실패 누적 시간(§4.5). */
  stuckSec: number;
}

/** 미션 지점 런타임 상태. §5.2. */
export interface MissionPoint {
  index: number;
  pos: Vec2;
  type: MissionType;
  /** 이번 판에 뽑혔는가(§5.6). */
  active: boolean;
  done: boolean;
}

/**
 * 한 판(에피소드)의 시뮬레이션 상태.
 * §6.5 라운드 초기 상태 + §8 위험 방어 통계 필드를 포함한다.
 */
export interface SimState {
  /** 이 라운드가 고른 맵의 index(0=village/1=forest/2=cave). SPEC_MAPS.md §1.4·O1. */
  mapIndex: number;
  elapsedSec: number;
  timeRemainingSec: number;
  player: Player;
  goblins: Goblin[];
  missions: MissionPoint[];
  completedCount: number;
  hits: number;
  ended: boolean;
  cleared: boolean;
  lossCause: LossCause;
  /**
   * §8 위험#1 방어 통계 — steer()의 3단(우회 커밋) 발동 총 횟수(이 판 전체, 고블린 3마리 합산).
   * 비정상적으로 크면 §4.6 1단(직선 추격)이 고장 났다는 신호다.
   */
  avoidTriggerCount: number;
  /** §8 위험#1 방어 통계 — CHASE의 stuckSec가 임계치에 도달해 SEARCH로 강제 이탈한 총 횟수. */
  stuckAbortCount: number;
  /**
   * 탈출구가 열렸는가. §6.4 3번 `exitOpen = (completedCount >= ROUND.EXIT_OPENS_AT_MISSIONS)`의
   * 노출값 — `checkEnd()`가 이미 매 틱 계산하던 식을 그대로 상태에 담은 것뿐이다(새 판정 아님).
   * §7.1이 봇이 읽어도 되는 값으로 이미 이 이름을 명시했다("탈출구 `pos`, `exitOpen`").
   */
  exitOpen: boolean;
  /**
   * 지금 `E`를 누르면 실제로 시작될 미션 지점의 index. 없으면 `null`.
   * §5.3 시작 조건의 후보 탐색(활성 && 미완료 && `MISSION.INTERACT_RADIUS_PX` 이내, 최소거리)을
   * `input.interact` 조건 없이 그대로 재사용한 값이다. 미션 수행 중(`player.missionIndex !== null`)에는
   * 항상 `null`이다 — §5.3 첫 줄("진행 중이면 §5.4로")과 같은 우선순위를 반영한다.
   */
  interactableMissionIndex: number | null;
}

/** 한 판(에피소드) 시뮬레이션 결과. src/tools/sim-cli.ts가 집계에 쓴다. */
export interface SimResult {
  /** 이 라운드가 고른 맵의 index. SPEC_MAPS.md O1(시뮬 JSON의 각 run 레코드에 포함). */
  mapIndex: number;
  cleared: boolean;
  timeRemainingSec: number;
  hits: number;
  lossCause: LossCause;
  completedCount: number;
  avoidTriggerCount: number;
  stuckAbortCount: number;
  /**
   * §8 위험#3 방어 — 봇 네비게이션 실패 감지. 라운드 시작 60초가 지난 시점에도
   * completedCount가 0이면 true. (60초는 RULES.md §8이 명시한 진단 임계값이다 —
   * 밸런스 축이 아니라 "봇이 멈췄는가"를 재는 도구 상수이므로 balance.ts에 두지 않는다.)
   */
  stuckRun: boolean;
}
