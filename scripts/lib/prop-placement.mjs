/**
 * prop-placement.mjs — 소품 배치 규칙(§4.1)의 Node(scripts/) 쪽 구현. 미리보기·기계 검증 전용.
 *
 * 런타임(GameScene.ts)이 실제로 쓰는 원본은 `src/scenes/propPlacement.ts`다 — 그쪽은
 * `src/sim/map.ts`의 `MAP_ROWS`를 직접 import한다(같은 TypeScript 빌드라 가능하다).
 * 이 파일은 Node ESM에서 그 TS를 바로 import할 수 없어(map-data.mjs 주석 참조) 알고리즘을
 * 그대로 복제했다 — `hash2`만은 `tiles.mjs`에서 함수 자체를 가져와 재사용한다(값 복사가
 * 아니라 로직 공유, SPEC_ZONES.md §4.1 "tiles.mjs의 기존 해시 재사용").
 * 두 구현이 갈리면 `src/scenes/propPlacement.ts`가 원본이다.
 */

import { MAP_ROWS } from './map-data.mjs';
import { zoneOfRow } from './zones.mjs';
import { hash2 } from './tiles.mjs';

// SPEC_ZONES.md §4.1 — 밸런스 수치가 아니다. sim이 읽지 않고 playtest가 튜닝하지 않는다.
// balance.ts에 넣지 않는다(스펙이 명시적으로 금지, "map.ts가 밸런스가 아닌 것과 같은 근거").
export const PROP_DENSITY_PCT = 6;
export const ANCHOR_AVOID_TILES = 2;
export const LATTICE_COLS = [6, 18, 30, 42];
export const LATTICE_ROWS = [7, 19, 31];

/** 밸런스가 아닌 임의 상수. floor 스티플(tiles.mjs, 시드 0..3)과 겹치지 않게만 골랐다 —
 * 어떤 고정 시드를 써도 §4.4 R3(결정성)는 성립한다. */
const PROP_HASH_SEED = 9973;

export function tileCharAt(col, row) {
  if (row < 0 || row >= MAP_ROWS.length) return '#';
  const line = MAP_ROWS[row];
  if (col < 0 || col >= line.length) return '#';
  return line[col];
}

/** M/E/P/G 앵커 전체(맵 문자를 스캔해 1회 계산). */
export const ANCHORS = (() => {
  const out = [];
  for (let row = 0; row < MAP_ROWS.length; row++) {
    const line = MAP_ROWS[row];
    for (let col = 0; col < line.length; col++) {
      if (line[col] === 'M' || line[col] === 'E' || line[col] === 'P' || line[col] === 'G') {
        out.push({ col, row });
      }
    }
  }
  return out;
})();

function chebyshev(aCol, aRow, bCol, bRow) {
  return Math.max(Math.abs(aCol - bCol), Math.abs(aRow - bRow));
}

export function nearAnyAnchor(col, row, anchors = ANCHORS) {
  return anchors.some((a) => chebyshev(col, row, a.col, a.row) <= ANCHOR_AVOID_TILES);
}

/**
 * SPEC_ZONES.md §4.1 그대로. 결정적 — 시드·상태 없음(같은 (col,row)는 항상 같은 결과, R3).
 * 반환: { zone, index } 또는 소품이 없으면 null.
 */
export function propAt(col, row) {
  if (tileCharAt(col, row) !== '.') return null;
  if (nearAnyAnchor(col, row)) return null;
  if (LATTICE_COLS.includes(col) || LATTICE_ROWS.includes(row)) return null;
  const h = hash2(col, row, PROP_HASH_SEED);
  if (h % 100 >= PROP_DENSITY_PCT) return null;
  return { zone: zoneOfRow(row), index: (h >>> 8) % 4 };
}

export const MAP_COLS = MAP_ROWS[0].length;
export const MAP_ROWS_COUNT = MAP_ROWS.length;
export { MAP_ROWS };
