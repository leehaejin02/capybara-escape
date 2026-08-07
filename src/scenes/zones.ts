/**
 * zones.ts — 렌더 테마 상수. docs/SPEC_MAPS.md §5가 원본(이전 docs/SPEC_ZONES.md §5.1을 대체).
 *
 * ✅ 2026-08-07: `zoneOfRow(row)` 폐기(SPEC_MAPS.md R4). 맵이 3개가 되면서 "행 범위로 구역을
 * 나누는" 방식은 더 이상 쓰지 않는다 — 맵마다 테마가 하나로 고정되고, 그 값은
 * `src/sim/map.ts`의 `MapDef.zone`(라운드 중엔 `ACTIVE_ZONE` 라이브 바인딩)이 원본이다.
 * 렌더 씬(`GameScene.ts`·`propPlacement.ts`)은 그 값을 그대로 읽는다.
 *
 * 이 파일에는 이제 zone id 상수만 남는다. `scripts/lib/zones.mjs`가 Node(art 생성/미리보기
 * 스크립트) 쪽 동일 상수를 별도로 갖는다 — vite(ts)와 node(mjs) 빌드가 분리돼 있어 모듈을
 * 공유할 수 없다(기존과 같은 이유). 값이 갈리면 이 문서(SPEC_MAPS.md §5)가 원본이고 `src/sim/map.ts`의
 * `MAPS[i].zone`과도 일치해야 한다.
 */

export const ZONE_FOREST = 0;
export const ZONE_VILLAGE = 1;
export const ZONE_CAVE = 2;
export const ZONE_COUNT = 3;
