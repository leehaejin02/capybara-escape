/**
 * sim 전용 자체 타입.
 *
 * Phaser의 Math.Vector2 등 Phaser 타입을 절대 재사용하지 않는다 — src/sim/은
 * Phaser를 몰라야 한다. 이 파일이 그 경계의 타입 쪽 절반이다.
 *
 * 이 규칙을 실제로 강제하는 것은 `scripts/check-boundary.mjs` **하나뿐**이다.
 * 특히 `import type { X } from 'phaser'`는 컴파일 후 사라져 런타임 카나리가
 * 절대 못 잡는다 — 타입 전용 import야말로 이 파일이 가장 조심할 형태다.
 *
 * ⚠️ 스캐폴딩 단계: 고블린 FSM·미션·충돌 상태는 아직 없다. 여기 있는 타입은
 * "그릇"이며, 실제 게임 상태 필드는 규칙이 구현될 때 추가된다.
 */

/** 2D 벡터. Phaser.Math.Vector2를 대체하는 sim 자체 타입. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 한 판(에피소드)의 시뮬레이션 상태.
 * 스캐폴딩 단계라 경과 시간만 갖는다. 고블린·미션·플레이어 위치 등은
 * 규칙 구현 시점에 gd/tech가 balance.ts와 함께 확장한다.
 */
export interface SimState {
  /** 라운드 시작 이후 경과 시간 (초). */
  elapsedSec: number;
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

/** 패배 원인. 스캐폴딩 단계에서는 어떤 규칙도 판정하지 않으므로 항상 'none'이다. */
export type LossCause = 'timeout' | 'hp0' | 'none';

/** 한 판(에피소드) 시뮬레이션 결과. */
export interface SimResult {
  /** 탈출(승리) 여부. */
  cleared: boolean;
  /** 종료 시점 남은 시간 (초). */
  timeRemainingSec: number;
  /** 판 동안 피격 횟수. */
  hits: number;
  /** 패배 원인. 승리 시 'none'. */
  lossCause: LossCause;
}
