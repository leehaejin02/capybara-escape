/**
 * propPlacement.ts — 소품 배치 규칙(§4.1). docs/SPEC_ZONES.md §4.1이 원본. GameScene.ts가
 * 실제 게임에서 이 함수를 호출해 어느 프레임을 그릴지만 정한다.
 *
 * 렌더 전용 판단이다. `MAP_ROWS`를 문자 그대로 읽을 뿐 판정하지 않는다 — sim의 게임 규칙을
 * 대체하지 않는다(CLAUDE.md 아키텍처 3). 소품은 충돌에 영향을 주지 않는 순수 장식이고
 * `src/sim/`은 이 파일과 소품의 존재를 모른다(SPEC_ZONES.md §1·§4).
 *
 * `MAP_ROWS`는 `../sim/map`에서 읽기 전용으로 import한다 — CLAUDE.md 하네스가 금지하는 것은
 * "src/sim/ 아래에서 Phaser를 import하는 것"이지 "src/scenes/가 src/sim/을 참조하는 것"이
 * 아니다(GameScene.ts가 이미 MAP_ROWS·EXIT_POINT 등을 이 방식으로 쓴다).
 *
 * Node 생성 스크립트(scripts/lib/prop-placement.mjs)는 이 로직을 복제한다 — vite(ts) 빌드와
 * node(mjs) 빌드가 분리돼 있어 모듈을 공유할 수 없다(scripts/lib/zones.mjs와 같은 이유).
 * 값이 갈리면 이 파일이 원본이다.
 */
import { MAP_ROWS } from '../sim/map';
import { zoneOfRow } from './zones';

// SPEC_ZONES.md §4.1 — 밸런스 수치가 아니다. sim이 읽지 않고 playtest가 튜닝하지 않는다.
// balance.ts에 넣지 않는다(스펙이 명시적으로 금지).
const PROP_DENSITY_PCT = 6;
const ANCHOR_AVOID_TILES = 2;
const LATTICE_COLS: readonly number[] = [6, 18, 30, 42];
const LATTICE_ROWS: readonly number[] = [7, 19, 31];

/** 밸런스가 아닌 임의 상수 — floor 스티플(scripts/lib/tiles.mjs, 시드 0..3)과 겹치지 않게만
 * 골랐다. 어떤 고정 시드를 써도 §4.4 R3(결정성)는 성립한다. scripts/lib/tiles.mjs의 hash2와
 * 동일한 식(값이 아니라 로직 재사용, SPEC_ZONES.md §4.1). */
const PROP_HASH_SEED = 9973;

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2654435761) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

function tileCharAt(col: number, row: number): string {
  if (row < 0 || row >= MAP_ROWS.length) return '#';
  const line = MAP_ROWS[row];
  if (col < 0 || col >= line.length) return '#';
  return line[col];
}

interface Anchor {
  col: number;
  row: number;
}

/** M/E/P/G 앵커 전체(맵 문자를 스캔해 모듈 로드 시 1회 계산). */
const ANCHORS: readonly Anchor[] = (() => {
  const out: Anchor[] = [];
  for (let row = 0; row < MAP_ROWS.length; row++) {
    const line = MAP_ROWS[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === 'M' || ch === 'E' || ch === 'P' || ch === 'G') out.push({ col, row });
    }
  }
  return out;
})();

function chebyshev(aCol: number, aRow: number, bCol: number, bRow: number): number {
  return Math.max(Math.abs(aCol - bCol), Math.abs(aRow - bRow));
}

function nearAnyAnchor(col: number, row: number): boolean {
  return ANCHORS.some((a) => chebyshev(col, row, a.col, a.row) <= ANCHOR_AVOID_TILES);
}

export interface PropPlacement {
  zone: number;
  index: number;
}

/** SPEC_ZONES.md §4.1 그대로. 결정적 — 같은 (col,row)는 항상 같은 결과(시드·상태 없음). */
export function propAt(col: number, row: number): PropPlacement | null {
  if (tileCharAt(col, row) !== '.') return null;
  if (nearAnyAnchor(col, row)) return null;
  if (LATTICE_COLS.includes(col) || LATTICE_ROWS.includes(row)) return null;
  const h = hash2(col, row, PROP_HASH_SEED);
  if (h % 100 >= PROP_DENSITY_PCT) return null;
  return { zone: zoneOfRow(row), index: (h >>> 8) % 4 };
}
