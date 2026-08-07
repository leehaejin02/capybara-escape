/**
 * zones.ts — 맵 세로 3분할(구역). docs/SPEC_ZONES.md §5.1이 원본.
 *
 * 렌더 전용이다. `src/sim/`은 구역의 존재를 모른다(SPEC_ZONES.md §1, CLAUDE.md 하네스 1) —
 * 이 파일은 src/scenes/에서만 쓴다. 생성 스크립트(scripts/)에서 쓰는 동일 로직은
 * `scripts/lib/zones.mjs`에 따로 있다 — node(mjs) 빌드와 vite(ts) 빌드가 분리돼 있어
 * 모듈을 공유할 수 없어 부득이하게 중복한다. 값이 갈리면 SPEC_ZONES.md §5.1이 원본이다.
 */

export const ZONE_FOREST = 0;
export const ZONE_VILLAGE = 1;
export const ZONE_CAVE = 2;
export const ZONE_COUNT = 3;

/** SPEC_ZONES.md §5.1: `zoneOfRow(row) = row < 13 ? 숲 : (row < 25 ? 마을 : 동굴)`. */
export function zoneOfRow(row: number): number {
  if (row < 13) return ZONE_FOREST;
  if (row < 25) return ZONE_VILLAGE;
  return ZONE_CAVE;
}
