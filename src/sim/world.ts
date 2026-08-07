import { HIDING, PLAYER, ROUND, SIM } from '../config/balance';
import { EXIT_POINT, GOBLIN_ROUTES, MISSION_POINTS, PLAYER_START, selectMap, tileCharAt } from './map';
import { handleMissionTick, selectActiveMissions } from './mission';
import { updateGoblin } from './goblin';
import { moveAxisX, moveAxisY } from './movement';
import { createBotPolicy } from './bot';
import { normalize, sub, distSq } from './vec';
import type { RNG } from './rng';
import type { Goblin, MissionPoint, Player, SimInput, SimResult, SimState } from './types';

/**
 * world — 상태 생성 + 고정 timestep `step()` + 승패 판정. RULES.md §3, §5, §6 구현.
 *
 * ── timestep 소스 ──
 * `SIM.TICKS_PER_SEC`와 `SIM.TIMESTEP_SEC` 둘 다 balance.ts에 있으나(파생식 금지 규칙 때문에
 * 서로 어긋날 수 있다), 이 sim은 **`SIM.TIMESTEP_SEC`만을 진실로 삼는다**.
 *
 * `stuckRun`(§8 위험#3 방어) 판정 기준 60초는 RULES.md §8이 명시한 진단 임계값이다.
 * 밸런스 축이 아니라 "봇이 멈췄는가"를 재는 도구 상수이므로 balance.ts에 두지 않는다.
 */
const STUCK_CHECK_SEC = 60;

const P_HW = PLAYER.HITBOX_W_PX / 2;
const P_HH = PLAYER.HITBOX_H_PX / 2;

/**
 * §3.1: moveX/moveY(입력 의도)로부터 4방향 단위 벡터로 양자화해 `player.facing`에 보관한다.
 * 게임 규칙 판정(충돌·시야 등)에는 쓰지 않는다 — 렌더 힌트 + §7.5 봇 FLEE 폴백 전용.
 * 입력이 0에 가까우면(정지) 이전 값을 그대로 유지한다.
 */
function updatePlayerFacing(player: Player, moveX: number, moveY: number): void {
  const len = Math.hypot(moveX, moveY);
  if (len < 1e-6) return;
  if (Math.abs(moveX) >= Math.abs(moveY)) {
    player.facing = moveX > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  } else {
    player.facing = moveY > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }
}

/** §3.2~§3.4: 대시 발동 판단 + 속도 벡터 계산 + 축별 분리 충돌 해결. */
function movePlayer(player: Player, input: SimInput, dt: number): void {
  if (input.dash && player.dashCooldownSec <= 0 && player.dashSec <= 0) {
    player.dashSec = PLAYER.DASH_DURATION_SEC;
    player.dashCooldownSec = PLAYER.DASH_COOLDOWN_SEC;
  }

  const speed = player.dashSec > 0 ? PLAYER.DASH_SPEED_PX_PER_SEC : PLAYER.BASE_SPEED_PX_PER_SEC;
  const len = Math.hypot(input.moveX, input.moveY);
  let vx = 0;
  let vy = 0;
  if (len >= 1e-6) {
    vx = (input.moveX / len) * speed;
    vy = (input.moveY / len) * speed;
  }

  updatePlayerFacing(player, input.moveX, input.moveY);
  moveAxisX(player.pos, vx * dt, P_HW, P_HH);
  moveAxisY(player.pos, vy * dt, P_HW, P_HH);
}

/** §6.2: 온천(S) 위에 있으면 시간 배속. HIDING.ENABLED === false(MUST 스코프)면 항상 1배. */
function computeTimeScale(player: Player): number {
  if (HIDING.ENABLED && tileCharAt(player.pos) === 'S') return HIDING.SPA_TIME_SCALE;
  return HIDING.DEFAULT_TIME_SCALE;
}

/** §6.4. 순서 고정: hp0 → timeout → 탈출. */
function checkEnd(state: SimState): void {
  if (state.player.hp <= 0) {
    state.ended = true;
    state.cleared = false;
    state.lossCause = 'hp0';
    return;
  }
  if (state.timeRemainingSec <= 0) {
    state.ended = true;
    state.cleared = false;
    state.lossCause = 'timeout';
    return;
  }
  const exitOpen = state.completedCount >= ROUND.EXIT_OPENS_AT_MISSIONS;
  if (exitOpen && distSq(state.player.pos, EXIT_POINT) <= ROUND.EXIT_REACH_RADIUS_PX * ROUND.EXIT_REACH_RADIUS_PX) {
    state.ended = true;
    state.cleared = true;
    state.lossCause = 'none';
  }
}

/**
 * §6.5 라운드 초기 상태.
 *
 * `forcedMapIndex`(SPEC_MAPS.md O2, `sim-cli --map=N`)가 주어지면 그 맵을 강제로 쓴다 —
 * 측정 전용이다. 실제 플레이(GameScene)는 이 인자를 절대 넘기지 않는다.
 */
export function createInitialState(rng: RNG, forcedMapIndex?: number): SimState {
  // SPEC_MAPS.md §1.4: 맵 선택이 라운드 RNG의 **첫 번째** 소비다. MISSION_POINTS 등을
  // 읽기 전에 반드시 먼저 호출해야 활성 맵의 값을 읽는다(map.ts의 live binding).
  const { mapIndex } = selectMap(rng, forcedMapIndex);

  const missions: MissionPoint[] = MISSION_POINTS.map((m) => ({
    index: m.index,
    pos: m.pos,
    type: m.type,
    active: false,
    done: false,
  }));
  selectActiveMissions(missions, rng);

  const goblins: Goblin[] = GOBLIN_ROUTES.map((route) => {
    const start = route[0];
    const nextWp = route[1];
    const facing = normalize(sub(nextWp, start));
    return {
      pos: { x: start.x, y: start.y },
      state: 'PATROL',
      facing,
      wpIndex: 1,
      lastSeenPos: { x: start.x, y: start.y },
      loseSightSec: 0,
      searchSec: 0,
      attackSec: 0,
      avoidDir: { x: 0, y: 0 },
      avoidSec: 0,
      stuckSec: 0,
    };
  });

  const player: Player = {
    pos: { x: PLAYER_START.x, y: PLAYER_START.y },
    hp: PLAYER.MAX_HP,
    facing: { x: 0, y: 1 }, // §6.5: 아래. 시작 방에서 위로 나가지만 판정에 안 쓴다
    invulnSec: 0,
    dashSec: 0,
    dashCooldownSec: 0,
    missionIndex: null,
    missionSec: 0,
  };

  return {
    mapIndex,
    elapsedSec: 0,
    timeRemainingSec: ROUND.TIME_LIMIT_SEC,
    player,
    goblins,
    missions,
    completedCount: 0,
    hits: 0,
    ended: false,
    cleared: false,
    lossCause: 'none',
    avoidTriggerCount: 0,
    stuckAbortCount: 0,
  };
}

/** §6.1 한 틱의 실행 순서. 순서를 바꾸면 같은 시드가 다른 결과를 낸다. */
export function step(state: SimState, input: SimInput, dt: number): void {
  if (state.ended) return;

  // 1. 타이머 감소
  state.player.invulnSec = Math.max(0, state.player.invulnSec - dt);
  state.player.dashSec -= dt;
  state.player.dashCooldownSec -= dt;

  // 2. 입력은 호출부(runEpisode)가 이미 결정해 넘겨준다

  // 3. 미션 로직
  const cancelledThisTick = handleMissionTick(state, input, dt);

  // 4. 플레이어 이동 — 미션 중이면(또는 이번 틱 자발적 중단이면) 건너뛴다
  const skipMovement = cancelledThisTick || state.player.missionIndex !== null;
  if (!skipMovement) {
    movePlayer(state.player, input, dt);
  }

  // 5. 고블린 갱신 — index 0 → 1 → 2 순서 고정
  for (let i = 0; i < state.goblins.length; i++) {
    updateGoblin(state, i, dt);
  }

  // 6. 시간 감소
  state.timeRemainingSec -= dt * computeTimeScale(state.player);

  // 7. 종료 판정
  checkEnd(state);

  // 8. 경과 시간
  state.elapsedSec += dt;
}

/**
 * 한 판(에피소드)을 끝까지 시뮬레이션한다. `rng`는 맵 선정(SPEC_MAPS.md §1.4)·미션 선정(§5.6)·
 * 봇 정책(§7)이 공유한다. `forcedMapIndex`는 sim-cli `--map=N` 전용(SPEC_MAPS.md O2).
 */
export function runEpisode(rng: RNG, forcedMapIndex?: number): SimResult {
  const state = createInitialState(rng, forcedMapIndex);
  const bot = createBotPolicy();
  const dt = SIM.TIMESTEP_SEC;
  // 안전 상한: timeRemainingSec가 정상적으로 0 이하가 되기까지 필요한 틱 수 + 여유.
  // timeScale은 항상 >= HIDING.DEFAULT_TIME_SCALE(1)이므로 이보다 더 걸릴 수 없다.
  const maxTicks = Math.round(ROUND.TIME_LIMIT_SEC / dt) + 10;

  let stuckRun = false;
  let checked60 = false;

  for (let i = 0; i < maxTicks && !state.ended; i++) {
    const input = bot.decide(state, rng);
    step(state, input, dt);
    if (!checked60 && state.elapsedSec >= STUCK_CHECK_SEC) {
      checked60 = true;
      stuckRun = state.completedCount === 0;
    }
  }

  return {
    mapIndex: state.mapIndex,
    cleared: state.cleared,
    timeRemainingSec: Math.max(state.timeRemainingSec, 0),
    hits: state.hits,
    lossCause: state.lossCause,
    completedCount: state.completedCount,
    avoidTriggerCount: state.avoidTriggerCount,
    stuckAbortCount: state.stuckAbortCount,
    stuckRun,
  };
}
