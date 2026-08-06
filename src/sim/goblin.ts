/**
 * goblin.ts — 고블린 FSM(§4.5) + steer(§4.6) + 피격 처리(§6.3).
 *
 * §8 위험#1(steer 4단 방어)의 통계 계측 지점이 여기다:
 * - `state.avoidTriggerCount`: steer()의 3단(우회 커밋) 발동 횟수
 * - `state.stuckAbortCount`: CHASE의 stuckSec 임계치 도달로 SEARCH 강제 전이한 횟수
 */
import { GOBLIN, HIT, NAV, PLAYER } from '../config/balance';
import { GOBLIN_ROUTES, isSolidAtPixel } from './map';
import { canSee } from './vision';
import { moveAxisX, moveAxisY } from './movement';
import { distSq, dot, normalize, rotate, sub, EPS_LEN } from './vec';
import type { Goblin, SimState, Vec2 } from './types';

const G_HW = GOBLIN.HITBOX_W_PX / 2;
const G_HH = GOBLIN.HITBOX_H_PX / 2;
const P_HW = PLAYER.HITBOX_W_PX / 2;
const P_HH = PLAYER.HITBOX_H_PX / 2;

/**
 * §4.6 steer. `g.pos`를 직접 이동시키고, 이번 틱 실제 전진 거리(px)를 반환한다
 * (CHASE의 stuckSec 판정이 이 값을 그대로 쓴다 — §4.5 CHASE 4번).
 */
function steer(state: SimState, g: Goblin, target: Vec2, speed: number, dt: number): number {
  const toTarget = sub(target, g.pos);
  const distToTarget = Math.hypot(toTarget.x, toTarget.y);
  if (distToTarget < EPS_LEN) return 0; // "이동 없음, 종료" — avoidSec도 건드리지 않는다

  const desired: Vec2 = { x: toTarget.x / distToTarget, y: toTarget.y / distToTarget };

  let dir: Vec2;
  if (g.avoidSec > 0) {
    dir = g.avoidDir;
    g.avoidSec -= dt;
  } else {
    dir = desired;
  }

  const before: Vec2 = { x: g.pos.x, y: g.pos.y };
  moveAxisX(g.pos, dir.x * speed * dt, G_HW, G_HH);
  moveAxisY(g.pos, dir.y * speed * dt, G_HW, G_HH);

  const adv: Vec2 = { x: g.pos.x - before.x, y: g.pos.y - before.y };
  const advLen = Math.hypot(adv.x, adv.y);
  if (advLen >= EPS_LEN) {
    g.facing = { x: adv.x / advLen, y: adv.y / advLen };
  }

  if (advLen < NAV.BLOCKED_MIN_ADVANCE_PX_PER_TICK && g.avoidSec <= 0) {
    const perpA: Vec2 = { x: -desired.y, y: desired.x };
    const perpB: Vec2 = { x: desired.y, y: -desired.x };
    const probeA: Vec2 = { x: g.pos.x + perpA.x * NAV.AVOID_PROBE_PX, y: g.pos.y + perpA.y * NAV.AVOID_PROBE_PX };
    const probeB: Vec2 = { x: g.pos.x + perpB.x * NAV.AVOID_PROBE_PX, y: g.pos.y + perpB.y * NAV.AVOID_PROBE_PX };
    const freeA = !isSolidAtPixel(probeA);
    const freeB = !isSolidAtPixel(probeB);
    let chosen: Vec2;
    if (freeA && !freeB) chosen = perpA;
    else if (freeB && !freeA) chosen = perpB;
    else if (freeA && freeB) chosen = dot(perpA, g.facing) >= dot(perpB, g.facing) ? perpA : perpB;
    else chosen = perpA;
    g.avoidDir = chosen;
    g.avoidSec = NAV.AVOID_COMMIT_SEC;
    state.avoidTriggerCount++;
  }

  return advLen;
}

/** §5.6 스캔 순서에서 route가 4개 웨이포인트의 닫힌 루프임을 전제로, 가장 가까운 노드 인덱스를 찾는다. */
function nearestRouteIndex(route: readonly Vec2[], pos: Vec2): number {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = distSq(route[i], pos);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** §6.3 피격 처리. ATTACK 진입 시 1회만 호출한다. 순서 고정. */
function applyHit(state: SimState, g: Goblin): void {
  // 0. 무적 중이면 아무것도 하지 않는다(고블린은 그래도 ATTACK 상태로 들어간다 — 호출부 책임).
  if (state.player.invulnSec > 0) return;

  // 1. 체력 감소
  state.player.hp -= HIT.HP_LOSS;
  // 2. 시간 페널티 (0 미만 클램프)
  state.timeRemainingSec = Math.max(0, state.timeRemainingSec - HIT.TIME_PENALTY_SEC);
  // 3. 넉백
  // §3.3 moveAxisX/Y의 충돌 스캔은 "이동 후 최종 위치"의 히트박스가 덮는 타일만 본다(스윕
  // 아님). §3.5는 이게 안전하다고 말하지만 그 근거("최대 이동량 2.5px가 타일 32px보다
  // 훨씬 작다")는 **틱당 이동에만** 성립한다. KNOCKBACK_PX(64px)는 dt와 무관한 단발성
  // 이동이라 이 전제가 깨진다 — 벽 바로 옆에서 맞으면 그 벽을 그대로 관통해 맵 밖으로
  // 순간이동한다(실측: 시드 12345 run 3, t≈17.6s). RULES.md §6.3 자체가 "벽을 뚫지 않는다"고
  // 명시하므로, 이는 규칙을 바꾸는 게 아니라 규칙이 실제로 성립하게 만드는 수정이다.
  // 큰 한 번의 이동 대신 §3.5의 안전 조건(이동량 ≪ 히트박스)을 만족하는 작은 하위 스텝
  // 여러 번으로 나눠 적용한다. `KNOCKBACK_SUBSTEP_PX`는 넉백 거리 자체를 바꾸지 않는
  // 이산 이동 안정성 상수다 — 밸런스 수치가 아니므로 RULES.md §0 계약 2의 "1e-6과 같은 예외"에
  // 해당한다(balance.ts에 두지 않는다).
  const KNOCKBACK_SUBSTEP_PX = 2;
  const d = sub(state.player.pos, g.pos);
  const dLen = Math.hypot(d.x, d.y);
  const dir: Vec2 = dLen >= EPS_LEN ? { x: d.x / dLen, y: d.y / dLen } : { x: -g.facing.x, y: -g.facing.y };
  const substeps = Math.max(1, Math.ceil(HIT.KNOCKBACK_PX / KNOCKBACK_SUBSTEP_PX));
  const stepX = (dir.x * HIT.KNOCKBACK_PX) / substeps;
  const stepY = (dir.y * HIT.KNOCKBACK_PX) / substeps;
  for (let i = 0; i < substeps; i++) {
    moveAxisX(state.player.pos, stepX, P_HW, P_HH);
    moveAxisY(state.player.pos, stepY, P_HW, P_HH);
  }
  // 4. 미션 진행도 초기화
  if (state.player.missionIndex !== null && HIT.RESETS_MISSION_PROGRESS) {
    state.player.missionIndex = null;
    state.player.missionSec = 0;
  }
  // 5. 무적 시작
  state.player.invulnSec = HIT.INVULNERABLE_SEC;
  // 6. 통계
  state.hits += 1;
}

function enterAttack(state: SimState, g: Goblin): void {
  applyHit(state, g);
  g.attackSec = GOBLIN.ATTACK_COOLDOWN_SEC;
  g.state = 'ATTACK';
}

/** §4.5. 고블린 하나를 한 틱 갱신한다. 호출 순서(index 0→1→2)는 world.ts가 보장한다. */
export function updateGoblin(state: SimState, index: number, dt: number): void {
  const g = state.goblins[index];
  const route = GOBLIN_ROUTES[index];
  const player = state.player;

  switch (g.state) {
    case 'PATROL': {
      if (canSee(g, player.pos)) {
        g.state = 'CHASE';
        g.lastSeenPos = { x: player.pos.x, y: player.pos.y };
        g.loseSightSec = 0;
        g.stuckSec = 0;
        // "CHASE 블록으로 넘어가지 않는다. 이 틱은 여기서 이동만 CHASE 규칙으로 한다"
        steer(state, g, g.lastSeenPos, GOBLIN.CHASE_SPEED_PX_PER_SEC, dt);
        return;
      }
      let target = route[g.wpIndex];
      if (distSq(target, g.pos) <= NAV.WAYPOINT_ARRIVE_RADIUS_PX * NAV.WAYPOINT_ARRIVE_RADIUS_PX) {
        g.wpIndex = (g.wpIndex + 1) % route.length;
        target = route[g.wpIndex];
      }
      steer(state, g, target, GOBLIN.PATROL_SPEED_PX_PER_SEC, dt);
      return;
    }

    case 'CHASE': {
      if (distSq(player.pos, g.pos) <= GOBLIN.CONTACT_RADIUS_PX * GOBLIN.CONTACT_RADIUS_PX) {
        enterAttack(state, g);
        return;
      }
      if (canSee(g, player.pos)) {
        g.lastSeenPos = { x: player.pos.x, y: player.pos.y };
        g.loseSightSec = 0;
      } else {
        g.loseSightSec += dt;
        if (g.loseSightSec >= GOBLIN.LOSE_SIGHT_TO_SEARCH_SEC) {
          g.state = 'SEARCH';
          g.searchSec = 0;
          g.stuckSec = 0;
          return;
        }
      }
      const advLen = steer(state, g, g.lastSeenPos, GOBLIN.CHASE_SPEED_PX_PER_SEC, dt);
      if (advLen < NAV.BLOCKED_MIN_ADVANCE_PX_PER_TICK) {
        g.stuckSec += dt;
      } else {
        g.stuckSec = 0;
      }
      if (g.stuckSec >= GOBLIN.CHASE_STUCK_ABORT_SEC) {
        g.state = 'SEARCH';
        g.searchSec = 0;
        g.stuckSec = 0;
        state.stuckAbortCount++;
      }
      return;
    }

    case 'SEARCH': {
      if (canSee(g, player.pos)) {
        g.state = 'CHASE';
        g.lastSeenPos = { x: player.pos.x, y: player.pos.y };
        g.loseSightSec = 0;
        g.stuckSec = 0;
        return;
      }
      g.searchSec += dt;
      if (g.searchSec >= GOBLIN.SEARCH_DURATION_SEC) {
        g.state = 'PATROL';
        g.wpIndex = nearestRouteIndex(route, g.pos);
        return;
      }
      if (distSq(g.lastSeenPos, g.pos) > GOBLIN.SEARCH_ARRIVE_RADIUS_PX * GOBLIN.SEARCH_ARRIVE_RADIUS_PX) {
        steer(state, g, g.lastSeenPos, GOBLIN.PATROL_SPEED_PX_PER_SEC, dt);
      } else {
        const rad = (GOBLIN.SEARCH_TURN_DEG_PER_SEC * dt * Math.PI) / 180;
        g.facing = normalize(rotate(g.facing, rad));
      }
      return;
    }

    case 'ATTACK': {
      g.attackSec -= dt;
      if (g.attackSec <= 0) {
        g.state = 'CHASE';
        g.loseSightSec = 0;
        g.stuckSec = 0;
        if (canSee(g, player.pos)) {
          g.lastSeenPos = { x: player.pos.x, y: player.pos.y };
        }
      }
      return;
    }
  }
}
