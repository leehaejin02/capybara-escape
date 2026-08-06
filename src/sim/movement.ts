/**
 * movement.ts — AABB vs 타일 그리드, 축별 분리 충돌 해결(슬라이딩). RULES.md §3.3.
 *
 * 플레이어·고블린·피격 넉백이 전부 이 두 함수를 공유한다(§3.3 서두 — "이 모델이
 * 재사용된다"는 명시는 없지만, RULES.md 전체가 "타일 그리드 vs AABB 하나"를 전제로
 * 쓰였고 §4.6·§6.3이 동일한 축별 분리 해결을 참조한다).
 */
import { NAV, WORLD } from '../config/balance';
import { isSolid } from './map';
import type { Vec2 } from './types';

const T = WORLD.TILE_SIZE_PX;
const EPS = NAV.COLLISION_EPSILON_PX;

/**
 * X축 이동 + 충돌 해결. `pos`를 직접 변형한다(참조 전달).
 * r(행)이 바깥 루프, c(열)이 안쪽 루프 — dx>0이면 c 오름차순, dx<0이면 내림차순(§3.3).
 */
export function moveAxisX(pos: Vec2, dx: number, hw: number, hh: number): void {
  pos.x += dx;
  if (dx === 0) return;

  const c0 = Math.floor((pos.x - hw) / T);
  const c1 = Math.floor((pos.x + hw - EPS) / T);
  const r0 = Math.floor((pos.y - hh) / T);
  const r1 = Math.floor((pos.y + hh - EPS) / T);

  for (let r = r0; r <= r1; r++) {
    if (dx > 0) {
      for (let c = c0; c <= c1; c++) {
        if (isSolid(c, r)) {
          pos.x = c * T - hw - EPS;
          return;
        }
      }
    } else {
      for (let c = c1; c >= c0; c--) {
        if (isSolid(c, r)) {
          pos.x = (c + 1) * T + hw + EPS;
          return;
        }
      }
    }
  }
}

/**
 * Y축 이동 + 충돌 해결. `pos`를 직접 변형한다(참조 전달).
 * c(열)이 바깥 루프, r(행)이 안쪽 루프 — dy>0이면 r 오름차순, dy<0이면 내림차순(§3.3).
 */
export function moveAxisY(pos: Vec2, dy: number, hw: number, hh: number): void {
  pos.y += dy;
  if (dy === 0) return;

  const c0 = Math.floor((pos.x - hw) / T);
  const c1 = Math.floor((pos.x + hw - EPS) / T);
  const r0 = Math.floor((pos.y - hh) / T);
  const r1 = Math.floor((pos.y + hh - EPS) / T);

  for (let c = c0; c <= c1; c++) {
    if (dy > 0) {
      for (let r = r0; r <= r1; r++) {
        if (isSolid(c, r)) {
          pos.y = r * T - hh - EPS;
          return;
        }
      }
    } else {
      for (let r = r1; r >= r0; r--) {
        if (isSolid(c, r)) {
          pos.y = (r + 1) * T + hh + EPS;
          return;
        }
      }
    }
  }
}
