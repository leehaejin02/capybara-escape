import { ROUND, SIM } from '../config/balance';
import type { SimResult, SimState } from './types';
import type { RNG } from './rng';

/**
 * world — 상태 생성 + 고정 timestep step() 루프 골격.
 *
 * ⚠️ 스캐폴딩 단계: 고블린 FSM·미션·충돌·승패 판정이 전부 아직 없다.
 * `runEpisode()`는 정해진 시간만큼 틱을 돌리고 끝날 뿐, 어떤 규칙도 판정하지 않는다.
 * 그 결과 모든 판이 "판정 없음"(cleared: false, lossCause: 'none')으로 끝난다 —
 * 이게 정상이다. 게임 규칙이 들어오기 전까지 이 결과를 밸런스 근거로 쓰지 마라
 * (docs/DECISIONS.md "playtest 명시적 생략" 참조).
 *
 * ── timestep 소스 ──
 * `SIM.TICKS_PER_SEC`와 `SIM.TIMESTEP_SEC` 둘 다 balance.ts에 있으나(파생식 금지 규칙 때문에
 * 서로 어긋날 수 있다), 이 sim은 **`SIM.TIMESTEP_SEC`만을 진실로 삼는다**. `TICKS_PER_SEC`는
 * 여기서 참조하지 않는다.
 */

/** 한 판 시작 시점의 초기 상태를 만든다. */
export function createInitialState(): SimState {
  return {
    elapsedSec: 0,
  };
}

/** 상태를 한 틱(`dtSec`) 만큼 전진시킨다. 스캐폴딩 단계라 경과 시간만 갱신한다. */
export function step(state: SimState, dtSec: number): void {
  state.elapsedSec += dtSec;
}

/**
 * 한 판(에피소드)을 끝까지 시뮬레이션한다.
 * 제한시간(`ROUND.TIME_LIMIT_SEC`)만큼 고정 timestep으로 틱을 돌린 뒤 종료한다.
 * `rng`는 봇/난수 배치가 sim에 들어올 때 쓰기 위해 시그니처에 이미 반영해 둔다
 * (스캐폴딩 단계에서는 사용하지 않는다).
 */
export function runEpisode(_rng: RNG): SimResult {
  const state = createInitialState();
  const totalTicks = Math.round(ROUND.TIME_LIMIT_SEC / SIM.TIMESTEP_SEC);

  for (let i = 0; i < totalTicks; i++) {
    step(state, SIM.TIMESTEP_SEC);
  }

  return {
    cleared: false,
    timeRemainingSec: Math.max(ROUND.TIME_LIMIT_SEC - state.elapsedSec, 0),
    hits: 0,
    lossCause: 'none',
  };
}
