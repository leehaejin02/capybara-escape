/**
 * vision.ts — 고블린 시야 판정 `canSee`. RULES.md §4.3.
 *
 * 5단계, 순서 고정. 싼 것부터 판정해 비싼 레이캐스트를 최대한 건너뛴다.
 */
import { GOBLIN, HIDING } from '../config/balance';
import { rayHitsWall } from './raycast';
import { tileCharAt } from './map';
import type { Goblin, Vec2 } from './types';
import { distSq, dot } from './vec';

/**
 * `VISION_ANGLE_DEG`(상수)의 cos(반각) 캐시. 매 틱 계산하지 않는다.
 * 밸런스 수치가 아니라 balance.ts 값의 파생 캐시이므로 하네스 위반이 아니다(RULES.md §4.3).
 */
export const VISION_COS_LIMIT = Math.cos(((GOBLIN.VISION_ANGLE_DEG / 2) * Math.PI) / 180);

export function canSee(g: Goblin, playerPos: Vec2): boolean {
  // 1. 반경 밖이면 즉시 탈락. 제곱 비교(sqrt 안 쓴다).
  const d2 = distSq(playerPos, g.pos);
  if (d2 > GOBLIN.VISION_RADIUS_PX * GOBLIN.VISION_RADIUS_PX) return false;

  // 2. 완전히 겹침.
  if (d2 < 1e-12) return true;

  // 3. 시야각(부채꼴) 판정.
  const dist = Math.sqrt(d2);
  const u: Vec2 = { x: (playerPos.x - g.pos.x) / dist, y: (playerPos.y - g.pos.y) / dist };
  if (dot(g.facing, u) < VISION_COS_LIMIT) return false;

  // 4. 벽 차폐(레이캐스트).
  if (GOBLIN.VISION_BLOCKED_BY_WALLS && rayHitsWall(g.pos, playerPos)) return false;

  // 5. 은신(수풀/온천). HIDING.ENABLED === false인 동안(MUST 스코프)엔 항상 건너뛴다.
  if (HIDING.ENABLED) {
    const ch = tileCharAt(playerPos);
    if (ch === 'B' || ch === 'S') return false;
  }

  return true;
}
