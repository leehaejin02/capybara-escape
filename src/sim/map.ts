/**
 * map.ts — 맵 데이터(원본) + 파싱 + 타일 질의 + 맵 불변식 단언.
 *
 * RULES.md §1, §2 구현.
 * 맵은 밸런스 수치가 아니므로(§2.1) balance.ts에 두지 않는다. 여기가 유일한 원본이다.
 * 파싱은 모듈 로드 시 1회. 매 틱 문자열을 인덱싱하지 않는다.
 *
 * ⚠️ 이 파일 하단의 `assertMapInvariants()` 호출은 **모듈 로드 시 즉시 실행**된다.
 * gd가 "실행 검증 아님"으로 표시한 맵 불변식(§9.4) — 37행×50자 / col 6,18,30,42·row 7,19,31
 * 벽 0개 / M7·G3·P1·E1 — 을 여기서 기계적으로 단언한다. 깨지면 이 모듈을 import하는 즉시 throw한다
 * (map.ts는 world.ts·bot.ts·raycast.ts 전부가 import하므로 사실상 "부팅 시"와 같다).
 */
import { WORLD } from '../config/balance';
import type { MissionType, Vec2 } from './types';

/** §2.4 맵 원본 데이터. RULES.md에서 그대로 옮긴 것 — 새로 그리지 않는다. */
export const MAP_ROWS: readonly string[] = [
  '##################################################',
  '#...........#...........#...........#............#',
  '#........BB.#...........#...........#............#',
  '#.###....BB.#.###.......#.###.......#.###.....E..#',
  '#.......#...#.......#...#.......#...#.......#....#',
  '#....M..#...#.......#...#.....M.#...#.......#....#',
  '#.......#...........#...........#...........#....#',
  '#.........................................G......#',
  '#..###......#..###......#..###......#..###.......#',
  '#........##.#........##.#........##.#........##..#',
  '#...........#...........#...........#............#',
  '#...........#...........#...........#............#',
  '######..##########..##########..##########..######',
  '#...........#...........#...........#............#',
  '#...........#...........#...........#............#',
  '#.###.......#.###.......#.###.......#.###........#',
  '#.......#...#.......#...#.......#...#.......#....#',
  '#.......#SS.#.......#...#.......#...#.......#....#',
  '#....M..#SS.........#.........M.#..........M#....#',
  '#.....G..........................................#',
  '#..###......#..###......#..###......#..###.......#',
  '#........##.#........##.#........##.#........##..#',
  '#...........#...........#..BB.......#.SS.........#',
  '#...........#...........#..BB.......#.SS.........#',
  '######..##########..##########..##########..######',
  '#...........#...........#...........#............#',
  '#...........#...........#...........#............#',
  '#.###.......#.###.......#.###.......#.###........#',
  '#.......#...#.......#...#.......#...#.......#....#',
  '#.......#...#.......#...#.......#...#.......#....#',
  '#....P..#.........M.#...........#..........M#....#',
  '#.........................................G......#',
  '#..###......#..###......#..###......#..###.......#',
  '#........##.#........##.#........##.#........##..#',
  '#...........#.BB........#...........#............#',
  '#...........#.BB........#...........#............#',
  '##################################################',
];

const T = WORLD.TILE_SIZE_PX;

/** §2.2: `#`만 solid. 맵 밖 좌표도 true(테두리 밖으로 못 나가게). */
export function isSolid(col: number, row: number): boolean {
  if (row < 0 || row >= MAP_ROWS.length) return true;
  const rowStr = MAP_ROWS[row];
  if (col < 0 || col >= rowStr.length) return true;
  return rowStr[col] === '#';
}

/** 픽셀 좌표가 속한 타일이 solid인가. */
export function isSolidAtPixel(p: Vec2): boolean {
  return isSolid(Math.floor(p.x / T), Math.floor(p.y / T));
}

/** 타일 (col,row)의 중심 픽셀. */
export function tileCenter(col: number, row: number): Vec2 {
  return { x: col * T + 16, y: row * T + 16 };
}

/** 픽셀 좌표가 속한 타일 문자('.', '#', 'B', 'S', ...). HIDING 판정용(§4.3 5단계). */
export function tileCharAt(p: Vec2): string {
  const col = Math.floor(p.x / T);
  const row = Math.floor(p.y / T);
  if (row < 0 || row >= MAP_ROWS.length) return '#';
  const rowStr = MAP_ROWS[row];
  if (col < 0 || col >= rowStr.length) return '#';
  return rowStr[col];
}

// ── §2.5/§2.7 스캔: row 오름차순 → 같은 row 안 col 오름차순 ──────────────────

interface ScannedPoint {
  col: number;
  row: number;
}

function scanChar(ch: string): ScannedPoint[] {
  const out: ScannedPoint[] = [];
  for (let row = 0; row < MAP_ROWS.length; row++) {
    const line = MAP_ROWS[row];
    for (let col = 0; col < line.length; col++) {
      if (line[col] === ch) out.push({ col, row });
    }
  }
  return out;
}

const scannedMissions = scanChar('M');
const scannedGoblins = scanChar('G');
const scannedPlayers = scanChar('P');
const scannedExits = scanChar('E');

/** §5.5 고정 배정: 지점 index → 타입. */
export const MISSION_TYPES: readonly MissionType[] = ['M1', 'M2', 'M3', 'M1', 'M2', 'M3', 'M1'];

export interface MissionAnchor {
  index: number;
  pos: Vec2;
  type: MissionType;
}

export const MISSION_POINTS: readonly MissionAnchor[] = scannedMissions.map((p, i) => ({
  index: i,
  pos: tileCenter(p.col, p.row),
  type: MISSION_TYPES[i],
}));

export const PLAYER_START: Vec2 =
  scannedPlayers.length === 1 ? tileCenter(scannedPlayers[0].col, scannedPlayers[0].row) : { x: 0, y: 0 };

export const EXIT_POINT: Vec2 =
  scannedExits.length === 1 ? tileCenter(scannedExits[0].col, scannedExits[0].row) : { x: 0, y: 0 };

// ── §2.7 고블린 순찰로 — 스캔으로 자동 추론 불가. 인덱스 순서대로 상수 배열. ─────

/** goblin[0] — ROUTE_EAST: 우상단 4개 방 + 탈출구 접근로. */
const ROUTE_EAST_TILES: ReadonlyArray<[number, number]> = [
  [42, 7],
  [42, 19],
  [30, 19],
  [30, 7],
];

/** goblin[1] — ROUTE_NORTHWEST: 좌상단 4개 방. */
const ROUTE_NORTHWEST_TILES: ReadonlyArray<[number, number]> = [
  [6, 19],
  [6, 7],
  [18, 7],
  [18, 19],
];

/** goblin[2] — ROUTE_SOUTH: 하단 + 중앙 오른쪽. */
const ROUTE_SOUTH_TILES: ReadonlyArray<[number, number]> = [
  [42, 31],
  [18, 31],
  [18, 19],
  [42, 19],
];

/** GOBLIN_ROUTES[i][0]이 스캔으로 찾은 i번째 G 좌표와 같아야 한다(로드 시 단언). */
export const GOBLIN_ROUTES: ReadonlyArray<readonly Vec2[]> = [
  ROUTE_EAST_TILES,
  ROUTE_NORTHWEST_TILES,
  ROUTE_SOUTH_TILES,
].map((tiles) => tiles.map(([c, r]) => tileCenter(c, r)));

// ── §2.6 순찰 격자(waypoint lattice) — 12노드, N/E/S/W 고정 순서 인접 ─────────

const LATTICE_COLS: readonly number[] = [6, 18, 30, 42];
const LATTICE_ROWS: readonly number[] = [7, 19, 31];

export interface LatticeNode {
  id: number;
  colIndex: number;
  rowIndex: number;
  pos: Vec2;
}

export const LATTICE_NODES: readonly LatticeNode[] = (() => {
  const nodes: LatticeNode[] = [];
  for (let rowIndex = 0; rowIndex < LATTICE_ROWS.length; rowIndex++) {
    for (let colIndex = 0; colIndex < LATTICE_COLS.length; colIndex++) {
      const id = colIndex + 4 * rowIndex;
      nodes[id] = {
        id,
        colIndex,
        rowIndex,
        pos: tileCenter(LATTICE_COLS[colIndex], LATTICE_ROWS[rowIndex]),
      };
    }
  }
  return nodes;
})();

function nodeIdAt(colIndex: number, rowIndex: number): number | null {
  if (colIndex < 0 || colIndex >= LATTICE_COLS.length) return null;
  if (rowIndex < 0 || rowIndex >= LATTICE_ROWS.length) return null;
  return colIndex + 4 * rowIndex;
}

/** 노드 id → 이웃 노드 id 배열. 순서 고정: 북 → 동 → 남 → 서 (BFS 동률 결정성). */
export const LATTICE_NEIGHBORS: ReadonlyArray<readonly number[]> = LATTICE_NODES.map((node) => {
  const neighbors: number[] = [];
  const north = nodeIdAt(node.colIndex, node.rowIndex - 1);
  const east = nodeIdAt(node.colIndex + 1, node.rowIndex);
  const south = nodeIdAt(node.colIndex, node.rowIndex + 1);
  const west = nodeIdAt(node.colIndex - 1, node.rowIndex);
  if (north !== null) neighbors.push(north);
  if (east !== null) neighbors.push(east);
  if (south !== null) neighbors.push(south);
  if (west !== null) neighbors.push(west);
  return neighbors;
});

// ── 맵 불변식 단언 (gd 수동 검증 항목을 기계 검증으로 굳힌다, §9.4) ────────────

function fail(msg: string): never {
  throw new Error(`[map.ts] 맵 불변식 위반: ${msg}`);
}

function assertMapInvariants(): void {
  // §1: 두 원본(WORLD 픽셀 크기 vs 문자열 격자) 어긋남 검사.
  if (WORLD.MAP_WIDTH_PX / T !== 50) {
    fail(`WORLD.MAP_WIDTH_PX / TILE_SIZE_PX !== 50 (실제 ${WORLD.MAP_WIDTH_PX / T})`);
  }
  if (WORLD.MAP_HEIGHT_PX / T !== MAP_ROWS.length) {
    fail(`WORLD.MAP_HEIGHT_PX / TILE_SIZE_PX !== 맵 행 수 (실제 ${WORLD.MAP_HEIGHT_PX / T} vs ${MAP_ROWS.length})`);
  }

  // §9.4-1: 37행 × 각 행 50자.
  if (MAP_ROWS.length !== 37) fail(`행 수가 37이 아니다 (${MAP_ROWS.length})`);
  for (let row = 0; row < MAP_ROWS.length; row++) {
    if (MAP_ROWS[row].length !== 50) fail(`row ${row}의 길이가 50이 아니다 (${MAP_ROWS[row].length})`);
  }

  // §9.4-2 / §2.6: col 6/18/30/42 → row 1~35 벽 없음. row 7/19/31 → col 1~48 벽 없음.
  for (const col of LATTICE_COLS) {
    for (let row = 1; row <= 35; row++) {
      if (isSolid(col, row)) fail(`격자 열 col=${col} row=${row}에 벽이 있다`);
    }
  }
  for (const row of LATTICE_ROWS) {
    for (let col = 1; col <= 48; col++) {
      if (isSolid(col, row)) fail(`격자 행 row=${row} col=${col}에 벽이 있다`);
    }
  }

  // §9.4-3: M7·G3·P1·E1 개수 + 좌표.
  const EXPECTED_MISSION_TILES: ReadonlyArray<[number, number]> = [
    [5, 5],
    [30, 5],
    [5, 18],
    [30, 18],
    [43, 18],
    [18, 30],
    [43, 30],
  ];
  if (scannedMissions.length !== EXPECTED_MISSION_TILES.length) {
    fail(`미션 지점 개수가 ${EXPECTED_MISSION_TILES.length}가 아니다 (${scannedMissions.length})`);
  }
  scannedMissions.forEach((p, i) => {
    const [ec, er] = EXPECTED_MISSION_TILES[i];
    if (p.col !== ec || p.row !== er) {
      fail(`미션 지점 ${i}의 스캔 좌표 (${p.col},${p.row})가 기대값 (${ec},${er})과 다르다`);
    }
  });

  const EXPECTED_GOBLIN_TILES: ReadonlyArray<[number, number]> = [
    [42, 7],
    [6, 19],
    [42, 31],
  ];
  if (scannedGoblins.length !== EXPECTED_GOBLIN_TILES.length) {
    fail(`고블린 시작점 개수가 ${EXPECTED_GOBLIN_TILES.length}가 아니다 (${scannedGoblins.length})`);
  }
  scannedGoblins.forEach((p, i) => {
    const [ec, er] = EXPECTED_GOBLIN_TILES[i];
    if (p.col !== ec || p.row !== er) {
      fail(`고블린 ${i}의 스캔 좌표 (${p.col},${p.row})가 기대값 (${ec},${er})과 다르다`);
    }
    const routeStart = GOBLIN_ROUTES[i][0];
    const expectedPos = tileCenter(ec, er);
    if (routeStart.x !== expectedPos.x || routeStart.y !== expectedPos.y) {
      fail(`GOBLIN_ROUTES[${i}][0]이 스캔된 goblin[${i}] 시작 좌표와 다르다`);
    }
  });

  if (scannedPlayers.length !== 1) fail(`플레이어 시작점 개수가 1이 아니다 (${scannedPlayers.length})`);
  if (scannedPlayers[0].col !== 5 || scannedPlayers[0].row !== 30) {
    fail(`플레이어 시작점이 (5,30)이 아니다 (${scannedPlayers[0].col},${scannedPlayers[0].row})`);
  }

  if (scannedExits.length !== 1) fail(`탈출구 개수가 1이 아니다 (${scannedExits.length})`);
  if (scannedExits[0].col !== 46 || scannedExits[0].row !== 3) {
    fail(`탈출구가 (46,3)이 아니다 (${scannedExits[0].col},${scannedExits[0].row})`);
  }
}

assertMapInvariants();
