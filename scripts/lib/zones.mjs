/**
 * zones.mjs — 맵 세로 3분할(구역). docs/SPEC_ZONES.md §5.1이 원본.
 *
 * 렌더/생성 전용이다. `src/sim/`은 구역의 존재를 모른다(SPEC_ZONES.md §1) —
 * 이 파일은 타일·소품 생성 스크립트(scripts/)에서만 쓰고, sim 판정에 절대 쓰지 않는다.
 * 런타임(GameScene.ts)에서 쓰는 동일 로직은 `src/scenes/zones.ts`에 따로 있다 —
 * scripts/(node, mjs)와 src/(vite, ts)는 별도 빌드라 모듈을 공유할 수 없어 부득이하게
 * 중복한다. 값이 갈리면 이 문서(SPEC_ZONES.md §5.1)가 원본이고 둘 다 거기 맞춘다.
 */

export const ZONE_FOREST = 0;
export const ZONE_VILLAGE = 1;
export const ZONE_CAVE = 2;
export const ZONE_COUNT = 3;

/** SPEC_ZONES.md §5.1: `zoneOfRow(row) = row < 13 ? 숲 : (row < 25 ? 마을 : 동굴)`. */
export function zoneOfRow(row) {
  if (row < 13) return ZONE_FOREST;
  if (row < 25) return ZONE_VILLAGE;
  return ZONE_CAVE;
}
