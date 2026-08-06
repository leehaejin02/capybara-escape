import type { SimInput, SimState } from './types';
import type { RNG } from './rng';

/**
 * 봇 정책 인터페이스. GDD 7장 "봇 100회 시뮬"의 봇이 구현할 계약.
 *
 * ⚠️ 스캐폴딩 단계: 본체는 스텁이다. 실제 회피·미션 판단 로직은
 * 고블린 FSM·미션이 sim에 들어온 뒤 tech가 채운다.
 */
export interface BotPolicy {
  /** 현재 상태를 보고 다음 틱에 넣을 입력을 결정한다. */
  decide(state: SimState, rng: RNG): SimInput;
}

/** 아무 행동도 하지 않는 스텁 정책. world의 step() 골격을 돌리는 용도로만 쓴다. */
export const stubBotPolicy: BotPolicy = {
  decide(): SimInput {
    return { moveX: 0, moveY: 0, interact: false, dash: false };
  },
};
