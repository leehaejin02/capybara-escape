/**
 * balance.ts — 이 게임의 모든 밸런스 수치의 유일한 원본
 *
 * ── 계약 ────────────────────────────────────────────────────────────────
 * 1. 밸런스 수치는 **전부 여기에만** 있다. 속도·시야·제한시간·쿨다운·확률을
 *    이 파일 밖(`src/sim/`, `src/scenes/`, `src/tools/`)에 리터럴로 쓰지 않는다.
 *    이 파일 밖의 밸런스 매직넘버는 **하네스 위반**이다 (CLAUDE.md 아키텍처 2, GDD 11장 8번).
 * 2. 이 파일은 **`gd` 에이전트 소유**다. `tech`는 읽기만 한다.
 *    수치를 바꾸려면 `gd`를 거친다 (docs/DECISIONS.md "소유 경계").
 * 3. **import 0개 / 파생 계산 0개 / 함수 0개.** 리터럴 상수만 둔다.
 *    `scripts/check-boundary.mjs`가 이걸 검사한다. `A * 2` 같은 식도 쓰지 않는다
 *    — 한 수치만 바꿔 시뮬을 돌리는 게 이 파일의 존재 이유이고,
 *    파생식이 생기면 "한 축만 바꾼다"는 절차가 깨진다.
 * 4. **모든 수치는 이름 또는 주석에 단위를 명시**한다. 단위 없는 숫자는 금지.
 * 5. 각 값 옆의 `GDD n장` 주석은 `verify`가 문서 ↔ 코드를 기계적으로 대조하는 근거다.
 *    주석을 지우지 않는다.
 *
 * ── 검증 상태 ───────────────────────────────────────────────────────────
 * ⚠️ **이 값들은 전부 `playtest` 미검증 가설이다.** (2026-08-06 기준)
 * 게임 규칙(고블린 FSM·미션·충돌)이 `src/sim/`에 아직 없어 측정 자체가 불가능하다
 * — `playtest` 생략은 docs/DECISIONS.md에 명시적으로 기록돼 있다.
 * 시뮬 100회 측정 후 `gd`가 **한 번에 한 축만** 조정한다.
 * 여기 적힌 숫자를 "밸런스가 맞다"의 근거로 인용하지 마라 (하네스 16).
 *
 * 출처: docs/GDD.md 5장(미션) / 6장(고블린) / 7장(타임·밸런스) / 8장(아트 규격)
 *      docs/RULES.md (규칙 스펙 — 각 수치가 **어느 판정식에 쓰이는지**가 여기 적혀 있다)
 * `[신규제안]` 표시가 붙은 값은 **GDD에 없어 gd가 새로 제안한 값**이다.
 * `[근거없음]` 표시가 붙은 값은 **지어낸 값**이다. playtest 1회차의 조정 대상 1순위다.
 */

/** 시뮬레이션 실행 파라미터. 렌더 프레임레이트와 무관한 **고정 timestep**. */
export const SIM = {
  /** 고정 timestep 틱 레이트 (Hz). 헤드리스/렌더 양쪽 동일. [신규제안] GDD에 없음 — 60Hz는 Phaser 기본 렌더 레이트에 맞춘 값 */
  TICKS_PER_SEC: 60,
  /** 고정 timestep 1틱의 길이 (초). = 1/60을 소수 리터럴로 고정 (이 파일은 파생 계산 금지). [신규제안] */
  TIMESTEP_SEC: 0.016666666666666666,
  /** `npm run sim`의 기본 반복 횟수 (회). GDD 7장 "봇 100회 시뮬" / 11장 7번 `--runs=100` */
  DEFAULT_RUNS: 100,
  /** `--seed` 미지정 시 쓰는 기본 시드 (정수). 재현성용. [신규제안] 값 자체에 의미 없음(날짜) */
  DEFAULT_SEED: 20260806,
} as const;

/** 플레이어(카피바라). GDD 6장 파라미터 표 + 7장 초기값 표 */
export const PLAYER = {
  /** 기본 이동 속도 (px/s). GDD 6장 — 고블린 chase 95보다 근소하게 빠름(도주는 되나 여유는 없음) */
  BASE_SPEED_PX_PER_SEC: 90,
  /** 대시 중 이동 속도 (px/s). GDD 6장 */
  DASH_SPEED_PX_PER_SEC: 150,
  /** 대시 지속 시간 (초). GDD 7장 */
  DASH_DURATION_SEC: 0.4,
  /** 대시 쿨다운 (초). GDD 7장 */
  DASH_COOLDOWN_SEC: 3.0,
  /** 최대 체력 (점). 0이 되면 패배. GDD 7장 */
  MAX_HP: 3,
  /** 충돌 히트박스 가로 (px). 위치를 중심으로 한 AABB. [신규제안] RULES.md §3 — 타일 32px보다 작게 잡아야 2칸 문을 편하게 통과한다 */
  HITBOX_W_PX: 20,
  /** 충돌 히트박스 세로 (px). [신규제안] RULES.md §3 */
  HITBOX_H_PX: 20,
} as const;

/** 피격 시 처리. GDD 7장 "피격 시: 체력 −1, 시간 −10초, 넉백, 무적 1.5초, 미션 진행도 초기화" */
export const HIT = {
  /** 피격당 체력 감소량 (점). GDD 7장 */
  HP_LOSS: 1,
  /** 피격당 남은 시간 감소량 (초). GDD 7장 */
  TIME_PENALTY_SEC: 10,
  /** 피격 후 무적 시간 (초). 이 동안 재피격되지 않는다. GDD 7장 */
  INVULNERABLE_SEC: 1.5,
  /** 피격 시 고블린 반대 방향으로 밀려나는 거리 (px). [신규제안] GDD 7장은 "넉백"만 적고 수치가 없음 — 32px 타일 2칸 */
  KNOCKBACK_PX: 64,
  /** 피격 시 진행 중이던 미션 진행도를 0으로 되돌리는가. GDD 5장 중단 규칙 / 11장 4번 */
  RESETS_MISSION_PROGRESS: true,
} as const;

/** 고블린. GDD 6장 (상태 기계 + 파라미터 표) */
export const GOBLIN = {
  /** 맵에 배치되는 고블린 수 (마리). GDD 6장 */
  COUNT: 3,
  /** PATROL 상태 이동 속도 (px/s). GDD 6장 */
  PATROL_SPEED_PX_PER_SEC: 60,
  /** CHASE 상태 이동 속도 (px/s). GDD 6장 — 플레이어 기본 90보다 느리지만 근소 */
  CHASE_SPEED_PX_PER_SEC: 95,
  /** 시야 부채꼴 반경 (px). GDD 6장 */
  VISION_RADIUS_PX: 140,
  /** 시야 부채꼴 전체 각도 (도). 정면 기준 좌우 각 45°. GDD 6장 */
  VISION_ANGLE_DEG: 90,
  /** 시야 판정에 벽 차폐(레이캐스트)를 적용하는가. GDD 6장 / 11장 3번 */
  VISION_BLOCKED_BY_WALLS: true,
  /** CHASE 중 시야에서 놓친 뒤 SEARCH로 전이하기까지의 시간 (초). GDD 6장 상태 기계 / 11장 3번 */
  LOSE_SIGHT_TO_SEARCH_SEC: 3,
  /** SEARCH 상태 지속 시간 (초). 끝나면 PATROL로 복귀. GDD 6장 상태 기계 */
  SEARCH_DURATION_SEC: 5,
  /** ATTACK 후 다음 공격까지의 쿨다운 (초). GDD 6장 상태 기계 */
  ATTACK_COOLDOWN_SEC: 1,
  /** ATTACK(접촉) 판정 거리 — 두 중심 간 거리 (px). [신규제안] GDD 6장은 "접촉"만 적고 수치가 없음 — 32px 스프라이트가 확실히 겹치는 거리 */
  CONTACT_RADIUS_PX: 24,
  /** 충돌 히트박스 가로 (px). 플레이어와 동일. [신규제안] RULES.md §3 */
  HITBOX_W_PX: 20,
  /** 충돌 히트박스 세로 (px). [신규제안] RULES.md §3 */
  HITBOX_H_PX: 20,
  /**
   * CHASE 중 전진이 막힌 상태가 이 시간 이상 이어지면 SEARCH로 강제 이탈 (초).
   * A* 없이 직선추격을 쓰기 때문에 필요한 안전장치. [근거없음] RULES.md §4.6
   */
  CHASE_STUCK_ABORT_SEC: 1.5,
  /** SEARCH 중 목적지 도착 후 제자리에서 시야를 회전시키는 속도 (도/초). [근거없음] RULES.md §4.5 */
  SEARCH_TURN_DEG_PER_SEC: 90,
  /** SEARCH 목적지(마지막 목격 지점)에 도착했다고 판정하는 거리 (px). [근거없음] RULES.md §4.5 */
  SEARCH_ARRIVE_RADIUS_PX: 16,
} as const;

/** 미션. GDD 5장(설계) + 7장(필요 개수) */
export const MISSION = {
  /** 맵에 배치되는 미션 지점 총 수 (곳). GDD 5장 */
  POINT_COUNT: 7,
  /** 매 판 랜덤 활성화되는 미션 수 (곳). GDD 5장 */
  ACTIVE_COUNT: 5,
  /** 승리에 필요한 완료 미션 수 (개). GDD 7장 (= ACTIVE_COUNT 전부) */
  REQUIRED_COUNT: 5,
  /** 활성화 시 각 미션 타입(M1/M2/M3)당 최소 보장 개수 (개). GDD 5장 "각 타입 최소 1개 보장" */
  MIN_PER_TYPE: 1,
  /** M1 배선 잇기 소요 시간 (초). GDD 5장 "~10초" */
  M1_WIRING_DURATION_SEC: 10,
  /** M2 온천 온도 맞추기 소요 시간 (초). GDD 5장 "~8초" */
  M2_TEMPERATURE_DURATION_SEC: 8,
  /** M3 순서 기억 소요 시간 (초). GDD 5장 "~12초" */
  M3_MEMORY_DURATION_SEC: 12,
  /** 미션 지점과 상호작용(E) 가능한 최대 거리 (px). [신규제안] GDD 5장은 "근접 후 E"만 적고 수치가 없음 — 32px 타일 1.25칸 */
  INTERACT_RADIUS_PX: 40,
  /** 미션 수행 중 플레이어가 이동할 수 있는가. GDD 5장 "이동·회피 불가" — 이 게임 긴장의 유일한 출처 */
  PLAYER_CAN_MOVE_DURING: false,
  /**
   * 피격이 아닌 **자발적 중단**(이동 입력)에서도 진행도를 0으로 되돌리는가.
   * GDD 5장은 피격만 규정했다. `true`로 두면 "언제 시작할지"의 판단 비용이 커진다(GDD 2장 긴장의 출처).
   * [신규제안] RULES.md §5.4 — playtest가 클리어율 조정에 쓸 수 있는 **on/off 축**이다.
   */
  CANCEL_RESETS_PROGRESS: true,
} as const;

/** 은신 — 카피바라다움을 규칙으로. GDD 6장 (스코프상 SHOULD, 10장) */
export const HIDING = {
  /**
   * 은신 규칙 전체의 마스터 스위치.
   * GDD 10장에서 은신은 **SHOULD**다. MUST 10개를 완주하기 전에는 `false`로 둔다 —
   * 맵 데이터의 `B`/`S` 타일은 이미 배치돼 있고 sim은 그걸 **일반 바닥으로 취급**한다.
   * MUST 완주 후 이 값 하나만 `true`로 바꿔 붙인다. [신규제안] RULES.md §6.2
   */
  ENABLED: false,
  /** 수풀 안에 있으면 고블린 감지 대상에서 제외되는가. GDD 6장 */
  BUSH_HIDES_PLAYER: true,
  /** 온천 안에 있으면 고블린 감지 대상에서 제외되는가. GDD 6장 */
  SPA_HIDES_PLAYER: true,
  /** 온천 안에 있을 때 제한시간이 흐르는 배속 (배). GDD 6장 — 이 게임의 시그니처 규칙(안전 ↔ 시간 교환) */
  SPA_TIME_SCALE: 2,
  /** 그 외 지형에서 시간이 흐르는 배속 (배). GDD 6장 (기준값) */
  DEFAULT_TIME_SCALE: 1,
} as const;

/** 라운드 규칙과 맵. GDD 7장 */
export const ROUND = {
  /** 제한시간 (초). 0이 되면 시간초과 패배. GDD 7장 */
  TIME_LIMIT_SEC: 180,
  /** 탈출구가 열리는 데 필요한 완료 미션 수 (개). GDD 7장 "5개 완료 시 탈출구 개방" */
  EXIT_OPENS_AT_MISSIONS: 5,
  /** 열린 탈출구에 도달했다고 판정하는 거리 (px). [신규제안] GDD 7장은 "도달하면 승리"만 적고 수치가 없음 — 미션 상호작용 거리와 동일하게 맞춤 */
  EXIT_REACH_RADIUS_PX: 40,
} as const;

/**
 * 맵·타일 규격. GDD 7장(맵 크기) + 8장(타일 크기).
 * ⚠️ 타일 크기는 밸런스 축이 아니라 **아트 규격**이다. `playtest`는 이 값을 튜닝 대상으로 삼지 않는다.
 *    sim이 그리드를 세려면 필요해 여기 둔다.
 * ✅ 2026-08-06 해소: 기존 세로 1200px는 1200/32 = 37.5로 정수 타일이 아니었다.
 *    **1184px(37타일)로 확정.** 1216(38타일)이 아니라 1184를 고른 이유는 RULES.md §1 참조
 *    (맵을 키우면 이동 시간이 늘어 180초 제한이 더 빡빡해진다 — 늘리는 쪽이 위험하다).
 * ⚠️ 실제 벽 배치는 밸런스가 아니므로 여기 없다. `src/sim/map.ts`의 문자열 배열이 원본이고,
 *    tech는 로드 시 `MAP_WIDTH_PX / TILE_SIZE_PX == 열 수`, `MAP_HEIGHT_PX / TILE_SIZE_PX == 행 수`를
 *    단언(assert)해 두 원본이 어긋나면 즉시 실패시킨다.
 */
export const WORLD = {
  /** 맵 가로 크기 (px). = 50타일 × 32px. GDD 7장 */
  MAP_WIDTH_PX: 1600,
  /** 맵 세로 크기 (px). = 37타일 × 32px. GDD 7장 (1200 → 1184 정정) */
  MAP_HEIGHT_PX: 1184,
  /** 타일 한 변 (px). GDD 8장 아트 규격 (밸런스 아님) */
  TILE_SIZE_PX: 32,
} as const;

/**
 * 이동·충돌·길찾기 공통 파라미터. RULES.md §3·§4.6·§7.3.
 * 플레이어·고블린·봇이 **같은 이동 함수 하나**를 공유한다는 전제의 수치다.
 * 이 그룹이 이 스펙에서 가장 구현 비용이 큰 부분이므로, tech는 여기부터 시간을 잰다.
 */
export const NAV = {
  /** 축별 분리 충돌 해결에서 벽에 붙일 때 남기는 여유 (px). 부동소수 오차로 벽에 끼는 것을 막는다. [신규제안] */
  COLLISION_EPSILON_PX: 0.001,
  /** 고블린이 PATROL 웨이포인트에 도착했다고 판정하는 거리 (px). [근거없음] 타일 12px ≈ 0.4칸 */
  WAYPOINT_ARRIVE_RADIUS_PX: 12,
  /**
   * 한 틱 실제 전진 거리가 이 값 미만이면 "막혔다"고 판정 (px/tick).
   * 참고: 60Hz에서 patrol 60px/s = 1.0px/tick, chase 95px/s = 1.58px/tick.
   * 0.2px는 가장 느린 기대 전진의 20% 수준. [근거없음] RULES.md §4.6
   */
  BLOCKED_MIN_ADVANCE_PX_PER_TICK: 0.2,
  /** 막혔을 때 고른 우회 방향을 유지하는 시간 (초). 짧으면 벽 앞에서 좌우로 떤다. [근거없음] RULES.md §4.6 */
  AVOID_COMMIT_SEC: 0.5,
  /** 우회 방향 후보(좌/우 수직)를 검사할 때 앞을 내다보는 거리 (px). [근거없음] 타일 0.75칸 */
  AVOID_PROBE_PX: 24,
} as const;

/**
 * 봇 정책 — `playtest`가 돌리는 가상 플레이어. RULES.md §7.
 *
 * ⚠️ **이 그룹은 게임 밸런스가 아니라 "측정 기구"의 눈금이다.**
 * 봇이 너무 잘하면 클리어율이 100%, 너무 못하면 0%가 되어 GDD 7장 목표 지표(35~55%)가
 * 게임이 아니라 봇의 성질만 측정하게 된다. 목표는 **사람 중급자**다.
 *
 * ⚠️ **조정 우선순위 규칙**: 지표가 어긋났을 때 먼저 손대는 것은 이 그룹이 아니라
 * `GOBLIN` / `ROUND` / `MISSION`이다. 게임을 못 고쳐서 봇을 고치면 측정 자체가 무의미해진다.
 * BOT 값을 바꿨다면 **그 이유를 반드시 WORKLOG에 남긴다** (하네스 16).
 *
 * 사람 중급자 근사는 3개 손잡이로만 한다: 반응 지연 / 조준 흔들림 / 위험 감수.
 */
export const BOT = {
  /** 봇이 고블린을 "위험"으로 인지하기 시작하는 거리 (px). 시야선(LOS)이 뚫려 있을 때만. [근거없음] 고블린 시야 140px보다 넉넉히 큼 */
  DANGER_RADIUS_PX: 200,
  /** 위험 해제 거리 (px). 진입(200)보다 크게 잡아 FLEE ↔ SEEK 채터링을 막는 히스테리시스. [근거없음] */
  DANGER_RELEASE_RADIUS_PX: 300,
  /**
   * 미션을 **시작해도 된다고 판단**하는 최소 고블린 거리 (px).
   * 이 값이 이 봇의 "겁"이다. 크면 미션을 못 시작해 시간초과가 늘고, 작으면 미션 중 피격이 늘어난다.
   * → GDD 7장 "시간초과 : 체력0 ≈ 6:4"를 맞추는 **주 손잡이**. [근거없음] RULES.md §7.5
   */
  RISK_TOLERANCE_PX: 220,
  /** 봇이 보는 고블린 위치의 지연 시간 (초). 사람의 반응 속도를 근사한다. 0이면 봇이 초인이 된다. [근거없음] RULES.md §7.6 */
  REACTION_DELAY_SEC: 0.25,
  /** 이동 방향에 매 주기 더해지는 무작위 각도의 전체 폭 (도). ±6°. 사람의 조작 흔들림. [근거없음] RULES.md §7.6 */
  AIM_JITTER_DEG: 12,
  /** 조준 흔들림을 새로 뽑는 주기 (초). 매 틱 뽑으면 상쇄돼 아무 효과가 없다. [근거없음] */
  JITTER_INTERVAL_SEC: 0.4,
  /** 봇이 목표 지점에 도착했다고 판정하는 거리 (px). [근거없음] */
  ARRIVE_RADIUS_PX: 8,
  /** FLEE 중 대시를 쓰는가. RULES.md §7.7 */
  DASH_IN_FLEE: true,
  /** ESCAPE(탈출구로 직행) 중 대시를 쓰는가. RULES.md §7.7 */
  DASH_IN_ESCAPE: true,
  /** SEEK(미션 지점으로 이동) 중 대시를 쓰는가. `false` = 위험할 때 쓰려고 아껴 둔다(사람다움). RULES.md §7.7 */
  DASH_IN_SEEK: false,
} as const;

/**
 * 목표 지표 — `playtest` 합격선. GDD 7장 "목표 지표".
 * `npm run sim -- --assert`가 이 값을 읽어 판정하고(미달 시 exit 2),
 * `verify`가 GDD 11장 7번을 기계적으로 대조한다.
 * 즉 **이건 게임 수치가 아니라 판정 기준**이다. 미달을 통과시키려고 이 범위를 넓히지 마라
 * — 넓히려면 GDD 7장을 먼저 고치고 그 이유를 docs/DECISIONS.md에 남긴다.
 */
export const TARGET = {
  /** 클리어율 하한 (비율 0~1). GDD 7장 "35~55%" / 11장 7번 */
  CLEAR_RATE_MIN: 0.35,
  /** 클리어율 상한 (비율 0~1). GDD 7장 "35~55%" / 11장 7번 */
  CLEAR_RATE_MAX: 0.55,
  /** 클리어 판에서의 평균 잔여 시간 하한 (초). GDD 7장 "10~35초" */
  AVG_TIME_REMAINING_MIN_SEC: 10,
  /** 클리어 판에서의 평균 잔여 시간 상한 (초). GDD 7장 "10~35초" */
  AVG_TIME_REMAINING_MAX_SEC: 35,
  /** 한 판당 평균 피격 횟수 하한 (회). GDD 7장 "1~2회" — 0이면 고블린이 무의미 */
  AVG_HITS_MIN: 1,
  /** 한 판당 평균 피격 횟수 상한 (회). GDD 7장 "1~2회" — 3이면 즉사감 */
  AVG_HITS_MAX: 2,
  /**
   * 전체 패배 중 시간초과 패배가 차지하는 목표 비율 (비율 0~1). GDD 7장 "시간초과 : 체력0 ≈ 6:4"
   * ⚠️ GDD에 허용 오차가 없다. 따라서 `--assert`의 **실패 조건으로 쓰지 않는다** — 보고만 한다.
   *    게이트로 쓰려면 `gd`가 먼저 GDD 7장에 오차 범위를 적어야 한다.
   */
  TIMEOUT_LOSS_SHARE: 0.6,
} as const;
