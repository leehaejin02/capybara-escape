import { BOT, MISSION, NAV, ROUND, SIM } from '../config/balance';
import { EXIT_POINT, LATTICE_NEIGHBORS, LATTICE_NODES } from './map';
import { rayHitsWall } from './raycast';
import { distSq, length, normalize, rotate, sub } from './vec';
import type { RNG } from './rng';
import type { SimInput, SimState, Vec2 } from './types';

/**
 * 봇 정책(`playtest` 전용). RULES.md §7 구현.
 *
 * ⚠️ 이 파일은 게임 밸런스가 아니라 "측정 기구"의 눈금이다(§7.0). 봇이 읽는 것은
 * §7.1이 허용한 것뿐이다 — 고블린의 `state`(FSM 상태)는 절대 읽지 않는다.
 */

export interface BotPolicy {
  decide(state: SimState, rng: RNG): SimInput;
}

type Mode = 'ESCAPE' | 'FLEE' | 'DO_MISSION' | 'SEEK';

/** §7.1: 반응 지연 링 버퍼 길이. N = round(REACTION_DELAY_SEC / TIMESTEP_SEC) (=15). */
const DELAY_TICKS = Math.round(BOT.REACTION_DELAY_SEC / SIM.TIMESTEP_SEC);

/**
 * 봇 정체(wedge) 감지 임계 틱 수. §8 위험#3 방어 — RULES.md에 명시된 규칙은 아니고,
 * 아래 `standingNode` 히스테리시스(내 해석으로 추가한 상태)가 만들 수 있는 새로운 실패
 * 모드를 막기 위한 안전장치다(자세한 이유는 `navDir` 근처 주석). 새 밸런스 상수를 만들지 않고
 * 이미 있는 `NAV.AVOID_COMMIT_SEC`(고블린 steer()의 "커밋 유지 시간"과 같은 개념 — 짧은 정체를
 * 무시할 만큼 길고, 실제 정체를 방치하지 않을 만큼 짧게)를 그대로 재사용한다.
 */
const STUCK_RESET_TICKS = Math.round(NAV.AVOID_COMMIT_SEC / SIM.TIMESTEP_SEC);

// ── §7.3 웨이포인트 격자 네비게이션 ──────────────────────────────────────────

/**
 * from에서 LOS가 뚫린 노드 중 가장 가까운 것(§7.3 2·3번이 공유하는 알고리즘).
 * 없으면 LOS 무시하고 직선거리 최소 노드. 동률이면 노드 id(=열 오름차순→행 오름차순)가 작은 쪽.
 */
function nearestLatticeNode(from: Vec2): number {
  let bestId = -1;
  let bestD = Infinity;
  for (const node of LATTICE_NODES) {
    if (rayHitsWall(from, node.pos)) continue;
    const d = distSq(from, node.pos);
    if (d < bestD) {
      bestD = d;
      bestId = node.id;
    }
  }
  if (bestId !== -1) return bestId;

  bestD = Infinity;
  for (const node of LATTICE_NODES) {
    const d = distSq(from, node.pos);
    if (d < bestD) {
      bestD = d;
      bestId = node.id;
    }
  }
  return bestId;
}

/**
 * entry→goal 12노드 4-이웃 격자 BFS. 이웃 순회 순서는 북→동→남→서(map.ts에서 이미 그 순서로
 * 구성됨) 고정 — 동률 시 결정성을 보장한다. 경로의 두 번째 노드를 반환한다(entry==goal이면 goal).
 */
function bfsNextNode(entry: number, goal: number): number {
  if (entry === goal) return goal;
  const prev: Array<number | null> = new Array(LATTICE_NODES.length).fill(null);
  const visited: boolean[] = new Array(LATTICE_NODES.length).fill(false);
  visited[entry] = true;
  const queue: number[] = [entry];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === goal) break;
    for (const nb of LATTICE_NEIGHBORS[cur]) {
      if (!visited[nb]) {
        visited[nb] = true;
        prev[nb] = cur;
        queue.push(nb);
      }
    }
  }
  const path: number[] = [];
  let cur: number | null = goal;
  while (cur !== null) {
    path.push(cur);
    cur = prev[cur];
  }
  path.reverse(); // entry ... goal
  return path.length >= 2 ? path[1] : goal;
}

/**
 * §7.3 5번의 "entry != 현재 서 있는 노드" 조건이 참조하는 지속 상태.
 *
 * 처음에는 이 조건을 거리 판정(`distToEntry > ARRIVE_RADIUS_PX`)과 동치인 군더더기로 보고
 * 생략했었다 — 그런데 시드 12345로 실측하니(§8 위험#3) 봇이 시작 지점 근처에서 영원히
 * 좌우로 떨며 전진하지 못했다. 원인은 이렇다: entry 노드가 목표(다음 노드) 방향과 반대편에
 * 있을 때, "도착했다(dist<=RADIUS)→next로 향한다→그 순간 entry에서 멀어져 dist>RADIUS로
 * 복귀→다시 entry로 향한다→..."가 매 틱 반복되는 **경계에서의 리밋 사이클**이 생긴다.
 * "현재 서 있는 노드"를 실제로 기억해 두면(한 번 도착한 노드는 "이미 그 자리에 있다"로
 * 계속 취급) 이 진동이 끊긴다 — 즉 이 조건은 군더더기가 아니라 진동 방지용 히스테리시스였다.
 * `createBotPolicy()`가 봇 하나당 하나만 만들어 모든 navDir 호출(SEEK/ESCAPE/FLEE)이 공유한다.
 */
interface StandingNodeMemory {
  current: number | null;
}

/**
 * §7.3 navDir. from→to 직선 LOS가 뚫려 있으면 직선 방향. 막혀 있으면 격자 BFS로 다음 노드 방향.
 *
 * `forceLattice`(기본 false)는 이 문서 §7.3에 없는 추가 인자다 — RULES.md의 "직선 LOS면
 * 직선 방향" 규칙은 `rayHitsWall`을 **중심점 대 중심점** 레이(폭 0)로 판정한다(§4.4가 원래
 * 고블린 시야용으로 설계됐고, 여기서도 그대로 재사용한다, §7.3 마지막 줄). 그런데 봇은 실제로
 * 20px 폭 히트박스로 그 직선을 "걸어서" 따라가야 한다 — 목표가 멀고 경로가 좁은 모서리를
 * 스치듯 지나가면, 몸(히트박스)은 걸리는데 중심선(레이)은 근소하게 안 걸리는 경계가 생겨
 * 봇의 y가 1px만 흔들려도 "직선 뚫림/막힘" 판정이 매 틱 뒤집힌다 — 실측으로 확인했다(시드
 * 12345, run 5, t≈20~22s: 모서리 옆에 낀 채 방향이 동쪽/서쪽으로 매 틱 반전). §4.4 자체(모든
 * 고블린·봇이 공유하는 유일한 레이캐스트)를 두껍게 바꾸면 시야 판정까지 같이 바뀌어 버리므로
 * 건드리지 않는다. 대신 아래 stuck 감지가 이 진동을 잡으면, 잠깐(§4.6과 같은 커밋 관용구,
 * `NAV.AVOID_COMMIT_SEC`) 직선 지름길 자체를 쓰지 않고 격자 라우팅만 쓰게 강제해 진동을 끊는다.
 */
function navDir(from: Vec2, to: Vec2, memory: StandingNodeMemory, forceLattice = false): Vec2 {
  const dist = length(sub(to, from));
  if (dist < 1e-6) return { x: 0, y: 0 };

  if (!forceLattice && !rayHitsWall(from, to)) return normalize(sub(to, from));

  const entry = nearestLatticeNode(from);
  const goal = nearestLatticeNode(to);
  const nextId = bfsNextNode(entry, goal);

  const entryNode = LATTICE_NODES[entry];
  const distToEntry = length(sub(entryNode.pos, from));
  if (distToEntry <= BOT.ARRIVE_RADIUS_PX) {
    memory.current = entry; // "도착했다" — 이후 잠깐 다시 멀어져도 이 노드는 이미 지나온 것으로 취급
  }

  if (distToEntry > BOT.ARRIVE_RADIUS_PX && entry !== memory.current) {
    return normalize(sub(entryNode.pos, from));
  }

  if (nextId === entry) {
    // entry===goal(또는 BFS가 더 나아갈 곳을 못 찾음) — 격자로는 더 진행할 수 없다.
    // §7.5 FLEE의 awayPoint처럼 `to`가 격자 범위 밖(예: 맵 밖)이라 어떤 노드와도 LOS가 없으면
    // nearestLatticeNode의 폴백이 매번 "지금 서 있는 그 노드"를 goal로 돌려주고, 그 결과
    // `nextNode.pos - from`이 0에 가까운 벡터가 되어 방향이 매 틱 미세한 부동소수 차이에 따라
    // 무작위로 뒤집힌다(실측: 시드 12345, t≈25s FLEE 도중 관찰). 격자가 도와줄 수 없는 상황이므로
    // §4.6 steer()가 벽에 막혔을 때와 같은 관용구로 처리한다 — 막혀 있어도 원래 원하던 방향(raw
    // desired)을 그대로 돌려주면 이동/충돌 시스템이 벽을 따라 슬라이딩시킨다. 진동 대신 안정된
    // 방향이 나온다.
    return normalize(sub(to, from));
  }

  const nextNode = LATTICE_NODES[nextId];
  return normalize(sub(nextNode.pos, from));
}

// ── §7.5 FLEE 회피 벡터 ──────────────────────────────────────────────────────

/** dangerPositions(위험한 고블린들의 지연 위치)로부터 도망 방향을 계산한다. §7.5. */
function computeFleeDir(
  botPos: Vec2,
  botFacing: Vec2,
  dangerPositions: readonly Vec2[],
  memory: StandingNodeMemory,
  forceLattice = false
): Vec2 {
  let sum: Vec2 = { x: 0, y: 0 };
  for (const gPos of dangerPositions) {
    const d = sub(botPos, gPos);
    const dLen = length(d);
    if (dLen >= 1e-6) {
      sum = { x: sum.x + d.x / dLen, y: sum.y + d.y / dLen };
    }
  }
  if (length(sum) < 1e-6) {
    sum = { x: -botFacing.x, y: -botFacing.y };
  }
  const awayPoint: Vec2 = {
    x: botPos.x + normalize(sum).x * BOT.DANGER_RELEASE_RADIUS_PX,
    y: botPos.y + normalize(sum).y * BOT.DANGER_RELEASE_RADIUS_PX,
  };
  return navDir(botPos, awayPoint, memory, forceLattice);
}

// ── 봇 정책 본체 ─────────────────────────────────────────────────────────────

export function createBotPolicy(): BotPolicy {
  // §7.1 반응 지연 링 버퍼. 고블린 개수만큼 지연 없이 lazy init(첫 decide() 호출 시).
  let delayBuffers: Vec2[][] | null = null;
  let writeIdx: number[] = [];

  // §7.2 히스테리시스: 이미 FLEE 중이었는가.
  let fleeing = false;

  /**
   * §7.6 SEEK 목표 캐시. RULES.md는 "선택된 미션 지점"을 SEEK 모드 동안 고정된 하나의
   * 대상으로 서술한다(§7.4 모드 표 "목표" 열, §7.6 "SEEK 중 목표에 도착했을 때"). 그런데
   * §7.6의 목표 선택 규칙("직선거리 최소")을 **매 틱 다시 계산**하면, 두 미션 지점이
   * 거리상 거의 동률일 때(벽을 우회하는 실제 경로 때문에 틱마다 최소값이 뒤집힌다) 목표가
   * 계속 바뀌어 봇이 제자리에서 지그재그하다 멈춘다 — 실측으로 확인했다(§8 위험#3, 시드
   * 12345에서 재현). "사람은 매 프레임 목적지를 다시 고르지 않는다"는 상식과도 맞지 않는다.
   * 따라서 목표를 한 번 고르면 그 지점이 완료(done)되거나 더 이상 active가 아니게 될 때까지
   * 유지한다. 이건 새 규칙을 추가한 게 아니라 "선택된 미션 지점"이라는 기존 서술을 문자
   * 그대로(매 틱 재계산) 대신 상식적으로(선택은 유지) 해석한 것이다.
   */
  let seekTargetIndex: number | null = null;

  // §7.3 5번의 "현재 서 있는 노드" 기억(navDir 진동 방지 히스테리시스). 위 StandingNodeMemory 참조.
  const standingNode: StandingNodeMemory = { current: null };

  /**
   * 정체 감지(STUCK_RESET_TICKS 주석 참조). `standingNode` 기억이 낡아(더 이상 실제 위치와
   * 맞지 않아) 봇을 장애물에 계속 밀어붙이게 만드는 경우, 실제 전진량을 관찰해 스스로 기억을
   * 버리고 entry를 거리 기준으로 다시 전력 추적하게 한다.
   *
   * 순간 전진량(틱 간 변위) 대신 **창(윈도우) 순변위**를 본다 — 제자리에서 흔들리며 오가는
   * 중에도 틱 하나하나의 변위는 종종 임계값을 넘어서(예: y가 몇 px씩 왔다갔다) 순간 전진량
   * 기준으로는 "정체"를 못 잡는 경우를 실측으로 확인했다. STUCK_RESET_TICKS 구간 동안의
   * 순변위가 그 구간 길이만큼의 최소 기대 전진(= BLOCKED_MIN_ADVANCE_PX_PER_TICK × 틱 수, 새
   * 상수를 만들지 않고 기존 상수를 구간 길이로 스케일한 값)보다 작으면 정체로 본다.
   */
  let stuckWindowStartPos: Vec2 | null = null;
  let stuckWindowTicks = 0;
  const STUCK_NET_ADVANCE_MIN_PX = NAV.BLOCKED_MIN_ADVANCE_PX_PER_TICK * STUCK_RESET_TICKS;

  /**
   * 정체가 감지되면 이 값이 STUCK_RESET_TICKS로 설정되고, 그 동안 `navDir`의 직선-LOS
   * 지름길(§7.3 1번)을 강제로 건너뛴다. 위 `navDir` 함수 주석 참조 — 20px 히트박스가 모서리를
   * 스치는 위치에서 "직선 뚫림" 판정 자체가 매 틱 뒤집히는 진동은 `standingNode`를 지워도
   * 잡히지 않는다(그 진동은 격자 판단 이전 단계에서 발생하므로). §4.6과 같은 커밋 관용구.
   */
  let forceLatticeTicksRemaining = 0;

  // §7.3 조준 흔들림. 첫 틱에 즉시 1회 뽑히도록 timer=0으로 시작.
  let jitterAngleRad = 0;
  let jitterTimer = 0;

  function updateDelayedPositions(state: SimState): Vec2[] {
    if (delayBuffers === null) {
      delayBuffers = state.goblins.map((g) => Array.from({ length: DELAY_TICKS }, () => ({ x: g.pos.x, y: g.pos.y })));
      writeIdx = state.goblins.map(() => 0);
    }
    const delayed: Vec2[] = [];
    for (let i = 0; i < state.goblins.length; i++) {
      const buf = delayBuffers[i];
      const idx = writeIdx[i];
      delayed.push(buf[idx]);
      buf[idx] = { x: state.goblins[i].pos.x, y: state.goblins[i].pos.y };
      writeIdx[i] = (idx + 1) % DELAY_TICKS;
    }
    return delayed;
  }

  function updateJitter(dt: number, rng: RNG): number {
    if (jitterTimer <= 0) {
      jitterAngleRad = ((rng.next() - 0.5) * BOT.AIM_JITTER_DEG * Math.PI) / 180;
      jitterTimer = BOT.JITTER_INTERVAL_SEC;
    }
    jitterTimer -= dt;
    return jitterAngleRad;
  }

  function decide(state: SimState, rng: RNG): SimInput {
    const dt = SIM.TIMESTEP_SEC;
    const bot = state.player;
    const delayedGoblinPos = updateDelayedPositions(state);
    const jitter = updateJitter(dt, rng);

    // 정체 감지 — 창(윈도우) 순변위가 계속 작으면 낡은 standingNode 기억을 버리고,
    // 잠깐 직선-LOS 지름길도 강제로 끈다(위 navDir/forceLatticeTicksRemaining 주석 참조).
    if (stuckWindowStartPos === null) {
      stuckWindowStartPos = { x: bot.pos.x, y: bot.pos.y };
      stuckWindowTicks = 0;
    } else {
      stuckWindowTicks++;
      if (stuckWindowTicks >= STUCK_RESET_TICKS) {
        const netAdvance = length(sub(bot.pos, stuckWindowStartPos));
        if (netAdvance < STUCK_NET_ADVANCE_MIN_PX) {
          standingNode.current = null;
          forceLatticeTicksRemaining = STUCK_RESET_TICKS;
        }
        stuckWindowStartPos = { x: bot.pos.x, y: bot.pos.y };
        stuckWindowTicks = 0;
      }
    }
    const forceLattice = forceLatticeTicksRemaining > 0;
    if (forceLatticeTicksRemaining > 0) forceLatticeTicksRemaining--;

    // §7.2 위험 인지 — 히스테리시스: 이미 FLEE 중이면 해제 반경을 넓게.
    const dangerRadius = fleeing ? BOT.DANGER_RELEASE_RADIUS_PX : BOT.DANGER_RADIUS_PX;
    const dangerousGoblins: Vec2[] = [];
    for (const gPos of delayedGoblinPos) {
      if (distSq(bot.pos, gPos) <= dangerRadius * dangerRadius && !rayHitsWall(bot.pos, gPos)) {
        dangerousGoblins.push(gPos);
      }
    }
    fleeing = dangerousGoblins.length > 0;

    // §7.4 모드 판정
    let mode: Mode;
    if (state.completedCount >= ROUND.EXIT_OPENS_AT_MISSIONS) {
      mode = 'ESCAPE';
    } else if (fleeing) {
      mode = 'FLEE';
    } else if (bot.missionIndex !== null) {
      mode = 'DO_MISSION';
    } else {
      mode = 'SEEK';
    }

    let dir: Vec2 = { x: 0, y: 0 };
    let interact = false;

    if (mode === 'ESCAPE') {
      dir = navDir(bot.pos, EXIT_POINT, standingNode, forceLattice);
    } else if (mode === 'FLEE') {
      dir = computeFleeDir(bot.pos, bot.facing, dangerousGoblins, standingNode, forceLattice);
      // FLEE 진입 시 미션 진행 중이었다면 이동 입력으로 §5.4의 자발적 중단을 유도한다.
      // (별도 취소 API 없음 — 봇도 SimInput만 쓴다.)
    } else if (mode === 'DO_MISSION') {
      dir = { x: 0, y: 0 };
    } else {
      // SEEK — 캐시된 목표가 여전히 유효(active && !done)하면 유지, 아니면 다시 고른다.
      if (seekTargetIndex !== null) {
        const cached = state.missions[seekTargetIndex];
        if (!cached.active || cached.done) seekTargetIndex = null;
      }
      if (seekTargetIndex === null) {
        const picked = selectSeekTarget(state, bot.pos);
        seekTargetIndex = picked !== null ? picked.index : null;
      }
      const target = seekTargetIndex !== null ? state.missions[seekTargetIndex] : null;
      if (target !== null) {
        if (distSq(bot.pos, target.pos) <= MISSION.INTERACT_RADIUS_PX * MISSION.INTERACT_RADIUS_PX) {
          // 도착 — §7.6 위험 감수 판단
          let nearestD = Infinity;
          for (const gPos of delayedGoblinPos) {
            if (!rayHitsWall(bot.pos, gPos)) {
              const d = length(sub(bot.pos, gPos));
              if (d < nearestD) nearestD = d;
            }
          }
          if (nearestD > BOT.RISK_TOLERANCE_PX) {
            interact = true;
            dir = { x: 0, y: 0 };
          } else {
            interact = false;
            // LOS가 뚫린 고블린들 기준으로 §7.5 회피 벡터 재사용 — 서성이며 기다린다.
            const losGoblins = delayedGoblinPos.filter((gPos) => !rayHitsWall(bot.pos, gPos));
            dir = computeFleeDir(bot.pos, bot.facing, losGoblins, standingNode, forceLattice);
          }
        } else {
          dir = navDir(bot.pos, target.pos, standingNode, forceLattice);
        }
      }
    }

    // 조준 흔들림 적용(마지막 단계). DO_MISSION은 이동 자체가 없으므로(길이 0) 회전해도 그대로 0.
    const finalDir = rotate(dir, jitter);

    const dashEnabled =
      (mode === 'FLEE' && BOT.DASH_IN_FLEE) ||
      (mode === 'ESCAPE' && BOT.DASH_IN_ESCAPE) ||
      (mode === 'SEEK' && BOT.DASH_IN_SEEK);

    return {
      moveX: finalDir.x,
      moveY: finalDir.y,
      interact,
      dash: dashEnabled,
    };
  }

  return { decide };
}

interface SeekTarget {
  index: number;
  pos: Vec2;
}

/** §7.6 목표 선택: active && !done 중 직선거리 최소. 동률이면 index 작은 쪽. */
function selectSeekTarget(state: SimState, botPos: Vec2): SeekTarget | null {
  let best: SeekTarget | null = null;
  let bestD = Infinity;
  for (const m of state.missions) {
    if (!m.active || m.done) continue;
    const d = distSq(botPos, m.pos);
    if (d < bestD) {
      bestD = d;
      best = { index: m.index, pos: m.pos };
    }
  }
  return best;
}
