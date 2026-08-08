/**
 * mission.ts — 미션 진행(§5.3, §5.4)과 활성 5곳 선정(§5.6).
 *
 * sim은 미니게임을 재현하지 않는다(§5.1). "정해진 초를 소비하는 행위"로만 추상화한다.
 */
import { MISSION } from '../config/balance';
import type { RNG } from './rng';
import type { MissionPoint, MissionType, Player, SimInput, SimState } from './types';
import { distSq } from './vec';

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

/**
 * §5.3/§5.4. 매 틱 호출한다.
 * 반환값 `true`는 "이 틱에 자발적으로 미션을 중단했다"는 뜻이다 — 호출부(world.ts)는
 * 이 경우 §5.4 bullet 2 "이 틱은 여기서 종료(이동은 다음 틱부터)"를 지키기 위해
 * missionIndex가 null이 되었어도 이번 틱 플레이어 이동을 건너뛰어야 한다.
 */
export function handleMissionTick(state: SimState, input: SimInput, dt: number): boolean {
  const player = state.player;

  if (player.missionIndex !== null) {
    // §5.4 진행 중 — 1. 이동 입력 무시(호출부가 missionIndex!=null을 보고 스스로 건너뛴다)
    // 2. 자발적 중단
    if (Math.abs(input.moveX) > 1e-6 || Math.abs(input.moveY) > 1e-6) {
      if (MISSION.CANCEL_RESETS_PROGRESS) player.missionSec = 0;
      player.missionIndex = null;
      return true;
    }
    // 3. 진행
    player.missionSec += dt;
    // 4. 완료 판정
    const point = state.missions[player.missionIndex];
    if (player.missionSec >= durationOf(point.type)) {
      point.done = true;
      state.completedCount += 1;
      player.missionIndex = null;
      player.missionSec = 0;
    }
    return false;
  }

  // §5.3 시작 조건
  if (!input.interact) return false;

  const bestIndex = findInteractableMission(state);
  if (bestIndex === null) return false;

  player.missionIndex = bestIndex;
  player.missionSec = 0;
  return false;
}

/**
 * §5.3 후보 탐색(3번째 줄) — 활성 && 미완료 && `MISSION.INTERACT_RADIUS_PX` 이내에서
 * 제곱거리 최소(동률이면 index 작은 쪽)인 미션 지점의 index. 없으면 `null`.
 *
 * `input.interact` 여부는 이 함수의 관심사가 아니다 — 호출부(`handleMissionTick`)가 실제 시작에
 * 쓰고, `world.ts`는 "지금 E를 누르면 시작될 지점"을 `state.interactableMissionIndex`로 노출하는 데
 * **같은 이 함수**를 다시 쓴다. 새 거리 상수를 만들지 않는다.
 */
export function findInteractableMission(state: SimState): number | null {
  const player = state.player;
  let bestIndex = -1;
  let bestD2 = Infinity;
  for (const p of state.missions) {
    if (!p.active || p.done) continue;
    const d2 = distSq(player.pos, p.pos);
    if (d2 <= MISSION.INTERACT_RADIUS_PX * MISSION.INTERACT_RADIUS_PX && d2 < bestD2) {
      bestD2 = d2;
      bestIndex = p.index;
    }
  }
  return bestIndex === -1 ? null : bestIndex;
}

/**
 * §5.6 활성 5곳 선정. **정확히 이 호출 순서**로만 `rng`를 소비한다(총 5회 — 3+2).
 * 순서가 바뀌면 같은 시드가 다른 판을 만든다.
 */
export function selectActiveMissions(missions: MissionPoint[], rng: RNG): void {
  const selected: number[] = [];

  // 1단계 — 각 타입 최소 1개 보장. 3회 호출.
  const types: MissionType[] = ['M1', 'M2', 'M3'];
  for (const t of types) {
    const candidates = missions.filter((m) => m.type === t).map((m) => m.index); // 오름차순
    selected.push(candidates[rng.nextInt(candidates.length)]);
  }

  // 2단계 — 나머지를 부분 Fisher-Yates로 채운다. need(2)회 호출.
  const remaining = missions.map((m) => m.index).filter((i) => !selected.includes(i)); // 오름차순
  const need = MISSION.ACTIVE_COUNT - selected.length;
  for (let i = 0; i < need; i++) {
    const j = i + rng.nextInt(remaining.length - i);
    const tmp = remaining[i];
    remaining[i] = remaining[j];
    remaining[j] = tmp;
    selected.push(remaining[i]);
  }

  // 3단계
  selected.sort((a, b) => a - b);
  for (const idx of selected) missions[idx].active = true;

  // tech 필수 단언(§5.6): 선정 결과가 5개이고 M1·M2·M3가 각각 1개 이상.
  const activeCount = missions.filter((m) => m.active).length;
  if (activeCount !== MISSION.ACTIVE_COUNT) {
    throw new Error(`[mission.ts] 활성 미션 개수가 ${MISSION.ACTIVE_COUNT}가 아니다 (${activeCount})`);
  }
  for (const t of types) {
    if (!missions.some((m) => m.active && m.type === t)) {
      throw new Error(`[mission.ts] 활성 미션에 타입 ${t}가 하나도 없다`);
    }
  }
}

/** 미션 수행 중인지(=이동을 이 틱에 무조건 건너뛰어야 하는지) 조회. §6.1 step4용. */
export function isMissionActive(player: Player): boolean {
  return player.missionIndex !== null;
}
