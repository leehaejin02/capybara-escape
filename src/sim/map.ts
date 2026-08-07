/**
 * map.ts — 맵 데이터(원본) 3종 + 파싱 + 타일 질의 + 맵 불변식(MC1~MC13) 단언 + 라운드별 맵 선택.
 *
 * docs/SPEC_MAPS.md 구현. 맵이 1개(village)뿐이던 시절 이 파일은 `MAP_ROWS` 등을 고정 상수로
 * export했다. 이제 맵이 3개이고 라운드마다 하나를 무작위로 고른다(SPEC_MAPS.md R2) — 그래서
 * `MAP_ROWS`/`ACTIVE_ZONE`/`MISSION_POINTS`/`PLAYER_START`/`EXIT_POINT`/`GOBLIN_ROUTES`는
 * **`let`로 export된 라이브 바인딩**이다. `selectMap()`이 라운드 시작 시 이 값들을 통째로
 * 스왑한다(TS/ESM·CommonJS 양쪽 다 named export가 참조 시점 값을 읽으므로 소비자 쪽 코드는
 * 바뀌지 않는다 — `movement.ts`/`raycast.ts`/`vision.ts`/`goblin.ts`/`bot.ts`가 그대로 동작).
 *
 * 안전성 근거: 이 프로세스는 한 번에 정확히 하나의 에피소드만 진행한다(`src/tools/sim-cli.ts`는
 * 순차 for 루프, `GameScene`은 씬 하나당 `SimState` 하나) — 두 라운드가 동시에 이 값을 읽고
 * 쓰는 경우가 없으므로 전역 가변 상태로도 안전하다. `createInitialState()`(world.ts)가 이
 * 값들을 쓰기 **전에** 반드시 `selectMap()`을 먼저 호출한다(SPEC_MAPS.md §1.4 — 맵 선택이
 * 라운드 RNG의 첫 소비).
 *
 * 맵은 밸런스 수치가 아니므로(SPEC_MAPS.md §8) balance.ts에 두지 않는다. 여기가 유일한 원본이다.
 * 파싱은 모듈 로드 시 1회(맵마다 1회). 매 틱 문자열을 인덱싱하지 않는다.
 *
 * ⚠️ 이 파일 하단의 `assertMapInvariants()` 호출은 **모듈 로드 시 즉시 실행**된다.
 * SPEC_MAPS.md §4의 MC1~MC13을 **세 맵 전부**에 대해 기계로 단언한다(MC11은 forest/cave만,
 * MC12는 세 맵을 한 번에 비교). 깨지면 이 모듈을 import하는 즉시 throw한다(map.ts는
 * world.ts·bot.ts·goblin.ts·movement.ts·raycast.ts·vision.ts 전부가 import하므로 사실상
 * "부팅 시"와 같다). MC6(BFS 연결성)은 gd가 "논증이지 실행이 아니다"로 표시한 항목이라
 * 여기서 실제로 BFS를 돌려 검증한다.
 */
import { WORLD } from '../config/balance';
import type { MissionType, Vec2 } from './types';
import type { RNG } from './rng';

const T = WORLD.TILE_SIZE_PX;

// ── §3 맵 원본 데이터 ────────────────────────────────────────────────────────

export interface MapDef {
  readonly index: number;
  readonly name: 'village' | 'forest' | 'cave';
  /**
   * 렌더 테마 상수. `src/scenes/zones.ts`의 `ZONE_FOREST`(0)/`ZONE_VILLAGE`(1)/`ZONE_CAVE`(2)와
   * 반드시 같은 값이어야 한다(값 중복 — scenes는 Phaser 빌드로 분리돼 있어 여기서 import할 수
   * 없다. `scripts/lib/map-data.mjs`가 `MAP_ROWS`를 복제하는 것과 같은 이유). sim은 이 값을
   * 게임 규칙 판정에 쓰지 않는다 — 렌더가 타일 프레임 인덱스를 고르는 데만 쓴다(SPEC_MAPS.md §5).
   */
  readonly zone: number;
  readonly rows: readonly string[];
  /**
   * 고블린 순찰 웨이포인트. index = 스캔 순서(goblin 0/1/2)와 같다. 각 배열은 4개 격자 노드의
   * **닫힌 루프**(마지막 → 처음도 이동 구간)다. RULES.md §2.7 / SPEC_MAPS.md §4 MC7.
   */
  readonly goblinRoutes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

/** §3.1 MAPS[0] — 고블린 집터(village). 기존 MAP_ROWS와 완전히 동일, 한 글자도 바꾸지 않았다. */
const VILLAGE_ROWS: readonly string[] = [
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

/** §3.2 MAPS[1] — 숲(forest). SPEC_MAPS.md §3.2 ASCII 그대로(프로그램으로 추출해 옮김). */
const FOREST_ROWS: readonly string[] = [
  '##################################################',
  '#................................................#',
  '#.###.........###.........###.........###........#',
  '#.###...###...###...###...###...###...###.....E..#',
  '#.......###.........###.........###..............#',
  '#.....M.....................M......BB............#',
  '#..................................BB............#',
  '#.....G.......................G..................#',
  '#..................#####.........................#',
  '####.........###M........###.........###.........#',
  '####...###...###...###...###...###...###...###...#',
  '#......###.........###.........###.........###...#',
  '#................................SS..............#',
  '#...................#####........SS..............#',
  '#..###.........###.........###.........###.......#',
  '#..###...###...###...###...###...###...###...###.#',
  '#........###.........###.........###.........###.#',
  '#.......................BB..................M....#',
  '#.......................BB.......................#',
  '#.................G..............................#',
  '#.......#####....................................#',
  '#.###.........###...M.....###.........###........#',
  '#.###...###...###...###...###...###...###........#',
  '#.......###.........###.........###.........###..#',
  '#............SS..................................#',
  '#............SS................#####.............#',
  '####.........###.........###.........###.........#',
  '####...###...###...###...###...###...###...###...#',
  '#......###.........###.........###.........###...#',
  '#.........BB....................M................#',
  '#....P....BB.....................................#',
  '#................................................#',
  '#...................#####........................#',
  '#..###.........###.........###.........###..M....#',
  '#..###...###...###...###...###...###...###...###.#',
  '#........###.........###.........###.........###.#',
  '##################################################',
];

/** §3.3 MAPS[2] — 동굴(cave). SPEC_MAPS.md §3.3 ASCII 그대로(프로그램으로 추출해 옮김). */
const CAVE_ROWS: readonly string[] = [
  '##################################################',
  '#........#####....................#####..........#',
  '#.###....#####....................#####..........#',
  '#.###....#####....................#####.......E..#',
  '#.....................######.....................#',
  '#...............M.....######................##...#',
  '#.....................######................##...#',
  '#.................G..............................#',
  '#...........................................BB...#',
  '#...M...#####...............M....######.....BB...#',
  '#.###...#####....................######..........#',
  '#.###...#####....................######..........#',
  '#.###...#####....................######..........#',
  '#.###................#####.......................#',
  '#.###................#####..................###..#',
  '#........SS..####....#####..................###..#',
  '#........SS..####....#####..................###..#',
  '#............####....#####..............M...###..#',
  '#................................................#',
  '#.....G..........................................#',
  '#................................................#',
  '#.............BBM...######.......................#',
  '#.###.........BB....######.........#####.........#',
  '#.###...............######.........#####.........#',
  '#.###...............######.........#####.........#',
  '#.###..............................#####.........#',
  '#.###...#####...............................####.#',
  '#.......#####.............####....SS........####.#',
  '#.......#####.............####....SS........####.#',
  '#.......#####.............####..M...........####.#',
  '#....P...........................................#',
  '#.............................G..................#',
  '#................................................#',
  '#........######.....BB...........######.....M....#',
  '#.###....######.....BB######.....######..........#',
  '#.###.................######.....................#',
  '##################################################',
];

// §2.7 고블린 순찰로 원본(격자 노드 tile 좌표, 4개 웨이포인트의 닫힌 루프). 스캔 순서(goblin
// index)와 배열 순서가 같아야 한다 — MC7이 로드 시 이걸 단언한다.
const VILLAGE_ROUTES: MapDef['goblinRoutes'] = [
  [
    [42, 7],
    [42, 19],
    [30, 19],
    [30, 7],
  ], // goblin[0] — ROUTE_EAST
  [
    [6, 19],
    [6, 7],
    [18, 7],
    [18, 19],
  ], // goblin[1] — ROUTE_NORTHWEST
  [
    [42, 31],
    [18, 31],
    [18, 19],
    [42, 19],
  ], // goblin[2] — ROUTE_SOUTH
];

const FOREST_ROUTES: MapDef['goblinRoutes'] = [
  [
    [6, 7],
    [18, 7],
    [18, 19],
    [6, 19],
  ],
  [
    [30, 7],
    [42, 7],
    [42, 31],
    [30, 31],
  ],
  [
    [18, 19],
    [30, 19],
    [30, 31],
    [18, 31],
  ],
];

const CAVE_ROUTES: MapDef['goblinRoutes'] = [
  [
    [18, 7],
    [42, 7],
    [42, 19],
    [18, 19],
  ],
  [
    [6, 19],
    [6, 7],
    [18, 7],
    [18, 19],
  ],
  [
    [30, 31],
    [42, 31],
    [42, 19],
    [30, 19],
  ],
];

/**
 * §1.1: `MAPS[0]`이 반드시 검증 이력이 있는 village여야 한다 — 되돌림(SPEC_MAPS.md §7)이
 * "배열에서 원소를 빼는 것"으로 끝나려면 앞에서부터 잘랐을 때 남는 것이 village여야 한다.
 */
export const MAPS: readonly MapDef[] = [
  { index: 0, name: 'village', zone: 1, rows: VILLAGE_ROWS, goblinRoutes: VILLAGE_ROUTES },
  { index: 1, name: 'forest', zone: 0, rows: FOREST_ROWS, goblinRoutes: FOREST_ROUTES },
  { index: 2, name: 'cave', zone: 2, rows: CAVE_ROWS, goblinRoutes: CAVE_ROUTES },
];

// ── §1.3 세 맵이 공유하는 상수 ────────────────────────────────────────────────

const LATTICE_COLS: readonly number[] = [6, 18, 30, 42];
const LATTICE_ROWS: readonly number[] = [7, 19, 31];

/** §5.5 고정 배정: 지점 index → 타입. 세 맵이 공유한다(SPEC_MAPS.md §1.3). */
export const MISSION_TYPES: readonly MissionType[] = ['M1', 'M2', 'M3', 'M1', 'M2', 'M3', 'M1'];

export interface MissionAnchor {
  index: number;
  pos: Vec2;
  type: MissionType;
}

/** 타일 (col,row)의 중심 픽셀. 맵과 무관한 순수 함수. */
export function tileCenter(col: number, row: number): Vec2 {
  return { x: col * T + 16, y: row * T + 16 };
}

interface ScannedPoint {
  col: number;
  row: number;
}

// ── §2.5/§2.7 스캔: row 오름차순 → 같은 row 안 col 오름차순 ──────────────────
function scanChar(rows: readonly string[], ch: string): ScannedPoint[] {
  const out: ScannedPoint[] = [];
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length; col++) {
      if (line[col] === ch) out.push({ col, row });
    }
  }
  return out;
}

interface MapDerived {
  missionPoints: MissionAnchor[];
  playerStart: Vec2;
  exitPoint: Vec2;
  goblinRoutesTiles: ReadonlyArray<readonly Vec2[]>;
}

/** 맵 정의(rows·goblinRoutes) → 런타임에서 실제로 쓰는 형태(픽셀 좌표)로 1회 변환. */
function deriveMap(def: MapDef): MapDerived {
  const scannedM = scanChar(def.rows, 'M');
  const scannedP = scanChar(def.rows, 'P');
  const scannedE = scanChar(def.rows, 'E');
  const missionPoints: MissionAnchor[] = scannedM.map((p, i) => ({
    index: i,
    pos: tileCenter(p.col, p.row),
    type: MISSION_TYPES[i],
  }));
  const playerStart = scannedP.length === 1 ? tileCenter(scannedP[0].col, scannedP[0].row) : { x: 0, y: 0 };
  const exitPoint = scannedE.length === 1 ? tileCenter(scannedE[0].col, scannedE[0].row) : { x: 0, y: 0 };
  const goblinRoutesTiles: ReadonlyArray<readonly Vec2[]> = def.goblinRoutes.map((route) =>
    route.map(([c, r]) => tileCenter(c, r))
  );
  return { missionPoints, playerStart, exitPoint, goblinRoutesTiles };
}

/** 세 맵 각각의 파생 데이터. 모듈 로드 시 1회 계산 — 라운드마다 다시 스캔하지 않는다. */
const MAP_DERIVED: readonly MapDerived[] = MAPS.map(deriveMap);

// ── §1.4 라운드별 활성 맵(live binding) ─────────────────────────────────────
// selectMap() 호출 전 기본값은 MAPS[0](village) — 모듈을 직접 import만 하고 아직 라운드를
// 시작하지 않은 상태(예: 도구 스크립트)에서도 기존 동작과 같은 값을 준다.

/** 현재 라운드가 고른 맵의 문자 격자. */
export let MAP_ROWS: readonly string[] = MAPS[0].rows;
/** 현재 라운드가 고른 맵의 렌더 테마 상수(SPEC_MAPS.md §5). 게임 규칙 판정에는 쓰이지 않는다. */
export let ACTIVE_ZONE: number = MAPS[0].zone;
export let MISSION_POINTS: readonly MissionAnchor[] = MAP_DERIVED[0].missionPoints;
export let PLAYER_START: Vec2 = MAP_DERIVED[0].playerStart;
export let EXIT_POINT: Vec2 = MAP_DERIVED[0].exitPoint;
export let GOBLIN_ROUTES: ReadonlyArray<readonly Vec2[]> = MAP_DERIVED[0].goblinRoutesTiles;

export interface MapSelection {
  mapIndex: number;
  map: MapDef;
}

/**
 * §1.4: 라운드 시작 시 맵을 고른다. **라운드 RNG의 첫 소비여야 한다**(world.ts가 이 호출
 * 순서를 보장한다).
 *
 * `forceIndex`(SPEC_MAPS.md O2, `sim-cli --map=N`)가 주어지면 그 맵을 강제로 활성화한다.
 * 다만 `rng.nextInt()` 호출 자체는 **강제 여부와 무관하게 항상 실행한다** — 그래야 이후
 * 미션 선정(RULES.md §5.6)이 소비하는 난수 위치가 강제하지 않을 때와 같아져, `--map`로 잰
 * 값이 "그 맵이 실제로 뽑혔을 때"와 같은 rng 소비 패턴을 재현한다. `MAPS.length === 1`이어도
 * 이 호출은 그대로 한다(SPEC_MAPS.md §1.4 — 되돌림이 "다른 게임"이 되지 않게 하는 장치).
 */
export function selectMap(rng: RNG, forceIndex?: number): MapSelection {
  const drawn = rng.nextInt(MAPS.length);
  const mapIndex = forceIndex !== undefined ? forceIndex : drawn;
  const def = MAPS[mapIndex];
  const derived = MAP_DERIVED[mapIndex];
  MAP_ROWS = def.rows;
  ACTIVE_ZONE = def.zone;
  MISSION_POINTS = derived.missionPoints;
  PLAYER_START = derived.playerStart;
  EXIT_POINT = derived.exitPoint;
  GOBLIN_ROUTES = derived.goblinRoutesTiles;
  return { mapIndex, map: def };
}

// ── 타일 질의 — 항상 "지금 활성 맵"(MAP_ROWS) 기준 ───────────────────────────

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

/** 픽셀 좌표가 속한 타일 문자('.', '#', 'B', 'S', ...). HIDING 판정용(§4.3 5단계). */
export function tileCharAt(p: Vec2): string {
  const col = Math.floor(p.x / T);
  const row = Math.floor(p.y / T);
  if (row < 0 || row >= MAP_ROWS.length) return '#';
  const rowStr = MAP_ROWS[row];
  if (col < 0 || col >= rowStr.length) return '#';
  return rowStr[col];
}

// ── §2.6 순찰 격자(waypoint lattice) — 12노드, N/E/S/W 고정 순서 인접 ─────────
// 세 맵이 격자 좌표를 공유하므로(SPEC_MAPS.md §1.3) 맵 선택과 무관한 전역 상수다.

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

// ── 맵 불변식 단언(MC1~MC13, SPEC_MAPS.md §4) ────────────────────────────────
// 아래는 전부 "지금 활성 맵"이 아니라 `MAPS`(정적 정의) 자체를 검사한다 — 라운드가 어느 맵을
// 고르든 그 맵은 이미 부팅 시 검증을 통과한 상태다.

function fail(mapName: string, msg: string): never {
  throw new Error(`[map.ts] 맵 불변식 위반 (${mapName}): ${msg}`);
}

function isSolidIn(rows: readonly string[], col: number, row: number): boolean {
  if (row < 0 || row >= rows.length) return true;
  const line = rows[row];
  if (col < 0 || col >= line.length) return true;
  return line[col] === '#';
}

function manhattan(aCol: number, aRow: number, bCol: number, bRow: number): number {
  return Math.abs(aCol - bCol) + Math.abs(aRow - bRow);
}

/** 축정렬 선분(a-b, 같은 행 또는 같은 열)까지의 체비쇼프 거리. MC8/MC10이 쓴다. */
function chebyshevToSegment(
  pCol: number,
  pRow: number,
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  if (a[1] === b[1]) {
    const row = a[1];
    const cMin = Math.min(a[0], b[0]);
    const cMax = Math.max(a[0], b[0]);
    const dCol = Math.max(0, cMin - pCol, pCol - cMax);
    return Math.max(dCol, Math.abs(pRow - row));
  }
  const col = a[0];
  const rMin = Math.min(a[1], b[1]);
  const rMax = Math.max(a[1], b[1]);
  const dRow = Math.max(0, rMin - pRow, pRow - rMax);
  return Math.max(dRow, Math.abs(pCol - col));
}

/** BFS — `#`이 아닌 타일만 밟고 `start`에서 도달 가능한 모든 (col,row)의 집합. MC6. */
function bfsReachable(rows: readonly string[], start: ScannedPoint): Set<string> {
  const visited = new Set<string>();
  const queue: ScannedPoint[] = [start];
  visited.add(`${start.col},${start.row}`);
  const deltas: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (const [dc, dr] of deltas) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (nr < 0 || nr >= rows.length) continue;
      const line = rows[nr];
      if (nc < 0 || nc >= line.length) continue;
      if (line[nc] === '#') continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ col: nc, row: nr });
    }
  }
  return visited;
}

/** 4-연결 성분 목록(주어진 bounds 안에서만). MC5(B/S 모양)·MC11(내부 벽 직사각형)이 공용한다. */
function connectedComponents(
  match: (col: number, row: number) => boolean,
  bounds: { rowMin: number; rowMax: number; colMin: number; colMax: number }
): ScannedPoint[][] {
  const visited = new Set<string>();
  const comps: ScannedPoint[][] = [];
  const deltas: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let row = bounds.rowMin; row <= bounds.rowMax; row++) {
    for (let col = bounds.colMin; col <= bounds.colMax; col++) {
      if (!match(col, row)) continue;
      const key = `${col},${row}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const queue: ScannedPoint[] = [{ col, row }];
      const cells: ScannedPoint[] = [];
      let qi = 0;
      while (qi < queue.length) {
        const cur = queue[qi++];
        cells.push(cur);
        for (const [dc, dr] of deltas) {
          const nc = cur.col + dc;
          const nr = cur.row + dr;
          if (nr < bounds.rowMin || nr > bounds.rowMax || nc < bounds.colMin || nc > bounds.colMax) continue;
          if (!match(nc, nr)) continue;
          const nk = `${nc},${nr}`;
          if (visited.has(nk)) continue;
          visited.add(nk);
          queue.push({ col: nc, row: nr });
        }
      }
      comps.push(cells);
    }
  }
  return comps;
}

function isSquare2x2(cells: readonly ScannedPoint[]): boolean {
  if (cells.length !== 4) return false;
  const cols = cells.map((c) => c.col);
  const rws = cells.map((c) => c.row);
  return Math.max(...cols) - Math.min(...cols) === 1 && Math.max(...rws) - Math.min(...rws) === 1;
}

function assertMapInvariants(): void {
  // MC13(기존 §1 그대로): 두 원본(WORLD 픽셀 크기 vs 문자열 격자) 어긋남 검사. 맵과 무관.
  if (WORLD.MAP_WIDTH_PX / T !== 50) {
    throw new Error(`[map.ts] MC13 위반: WORLD.MAP_WIDTH_PX / TILE_SIZE_PX !== 50 (실제 ${WORLD.MAP_WIDTH_PX / T})`);
  }
  if (WORLD.MAP_HEIGHT_PX / T !== 37) {
    throw new Error(`[map.ts] MC13 위반: WORLD.MAP_HEIGHT_PX / TILE_SIZE_PX !== 37 (실제 ${WORLD.MAP_HEIGHT_PX / T})`);
  }

  const wallCounts: number[] = [];

  for (const def of MAPS) {
    const rows = def.rows;
    const name = def.name;

    // MC1
    if (rows.length !== 37) fail(name, `행 수가 37이 아니다 (${rows.length})`);
    for (let row = 0; row < rows.length; row++) {
      if (rows[row].length !== 50) fail(name, `row ${row}의 길이가 50이 아니다 (${rows[row].length})`);
    }

    // MC2
    for (let col = 0; col < 50; col++) {
      if (rows[0][col] !== '#') fail(name, `row 0 col ${col}이 벽이 아니다`);
      if (rows[36][col] !== '#') fail(name, `row 36 col ${col}이 벽이 아니다`);
    }
    for (let row = 0; row < rows.length; row++) {
      if (rows[row][0] !== '#') fail(name, `row ${row} col 0이 벽이 아니다`);
      if (rows[row][49] !== '#') fail(name, `row ${row} col 49가 벽이 아니다`);
    }

    // MC3 — SPEC_MAPS.md가 "가장 위험한 항목"으로 지목.
    for (const col of LATTICE_COLS) {
      for (let row = 1; row <= 35; row++) {
        if (isSolidIn(rows, col, row)) fail(name, `격자 열 col=${col} row=${row}에 벽이 있다`);
      }
    }
    for (const row of LATTICE_ROWS) {
      for (let col = 1; col <= 48; col++) {
        if (isSolidIn(rows, col, row)) fail(name, `격자 행 row=${row} col=${col}에 벽이 있다`);
      }
    }

    // MC4
    const scannedM = scanChar(rows, 'M');
    const scannedG = scanChar(rows, 'G');
    const scannedP = scanChar(rows, 'P');
    const scannedE = scanChar(rows, 'E');
    if (scannedM.length !== 7) fail(name, `M 개수가 7이 아니다 (${scannedM.length})`);
    if (scannedG.length !== 3) fail(name, `G 개수가 3이 아니다 (${scannedG.length})`);
    if (scannedP.length !== 1) fail(name, `P 개수가 1이 아니다 (${scannedP.length})`);
    if (scannedE.length !== 1) fail(name, `E 개수가 1이 아니다 (${scannedE.length})`);

    // MC5
    const fullBounds = { rowMin: 0, rowMax: 36, colMin: 0, colMax: 49 };
    const bComps = connectedComponents((c, r) => rows[r][c] === 'B', fullBounds);
    const sComps = connectedComponents((c, r) => rows[r][c] === 'S', fullBounds);
    if (bComps.length !== 3 || !bComps.every(isSquare2x2)) {
      fail(name, `B 패치가 2×2 정사각형 3개가 아니다 (성분 ${bComps.length}개)`);
    }
    if (sComps.length !== 2 || !sComps.every(isSquare2x2)) {
      fail(name, `S 패치가 2×2 정사각형 2개가 아니다 (성분 ${sComps.length}개)`);
    }

    // MC6 — BFS 실측(gd가 "논증이지 실행이 아니다"로 표시한 항목, SPEC_MAPS.md §9).
    const reachable = bfsReachable(rows, scannedP[0]);
    if (!reachable.has(`${scannedE[0].col},${scannedE[0].row}`)) {
      fail(name, `BFS(P→E) 도달 불가`);
    }
    for (const m of scannedM) {
      if (!reachable.has(`${m.col},${m.row}`)) fail(name, `BFS(P→M) 도달 불가 (${m.col},${m.row})`);
    }
    for (const g of scannedG) {
      if (!reachable.has(`${g.col},${g.row}`)) fail(name, `BFS(P→G) 도달 불가 (${g.col},${g.row})`);
    }

    // MC7
    for (let i = 0; i < 3; i++) {
      const route = def.goblinRoutes[i];
      const g = scannedG[i];
      if (route[0][0] !== g.col || route[0][1] !== g.row) {
        fail(name, `goblinRoutes[${i}][0]이 스캔된 goblin[${i}] 좌표와 다르다`);
      }
      for (const [c, r] of route) {
        if (!LATTICE_COLS.includes(c) || !LATTICE_ROWS.includes(r)) {
          fail(name, `goblinRoutes[${i}]의 웨이포인트 (${c},${r})가 격자 노드가 아니다`);
        }
      }
      for (let k = 0; k < route.length; k++) {
        const a = route[k];
        const b = route[(k + 1) % route.length];
        if (a[0] !== b[0] && a[1] !== b[1]) {
          fail(name, `goblinRoutes[${i}]의 인접 웨이포인트 (${a[0]},${a[1]})↔(${b[0]},${b[1]})가 같은 행/열이 아니다`);
        }
      }
    }

    // MC8/MC9/MC10이 공유하는 순찰 선분 목록(닫힌 루프, wrap-around 포함).
    const segments: Array<readonly [readonly [number, number], readonly [number, number]]> = [];
    for (const route of def.goblinRoutes) {
      for (let k = 0; k < route.length; k++) {
        segments.push([route[k], route[(k + 1) % route.length]]);
      }
    }

    // MC8
    for (const m of scannedM) {
      const minD = Math.min(...segments.map(([a, b]) => chebyshevToSegment(m.col, m.row, a, b)));
      if (minD > 2) fail(name, `M(${m.col},${m.row})이 어떤 순찰 선분과도 체비쇼프 ≤2가 아니다 (최소 ${minD})`);
    }

    // MC9
    for (let i = 0; i < scannedM.length; i++) {
      for (let j = i + 1; j < scannedM.length; j++) {
        const d = manhattan(scannedM[i].col, scannedM[i].row, scannedM[j].col, scannedM[j].row);
        if (d < 12) fail(name, `M ${i}·${j}의 맨해튼 거리가 12 미만이다 (${d})`);
      }
    }

    // MC10
    const pMinSeg = Math.min(...segments.map(([a, b]) => chebyshevToSegment(scannedP[0].col, scannedP[0].row, a, b)));
    if (pMinSeg < 8) fail(name, `P→순찰 선분 체비쇼프 거리가 8 미만이다 (${pMinSeg})`);
    const pMinM = Math.min(...scannedM.map((m) => manhattan(scannedP[0].col, scannedP[0].row, m.col, m.row)));
    if (pMinM < 12) fail(name, `P→M 맨해튼 거리가 12 미만이다 (${pMinM})`);

    // MC11 — forest/cave만. village는 이 조항 이전에 만들어졌고 이미 검증 이력이 있어 소급하지 않는다.
    if (name !== 'village') {
      const interiorBounds = { rowMin: 1, rowMax: 35, colMin: 1, colMax: 48 };
      const wallComps = connectedComponents((c, r) => rows[r][c] === '#', interiorBounds);
      for (const cells of wallComps) {
        const cols = cells.map((c) => c.col);
        const rws = cells.map((c) => c.row);
        const cMin = Math.min(...cols);
        const cMax = Math.max(...cols);
        const rMin = Math.min(...rws);
        const rMax = Math.max(...rws);
        const area = (cMax - cMin + 1) * (rMax - rMin + 1);
        if (area !== cells.length) {
          fail(
            name,
            `내부 벽 성분이 축정렬 직사각형이 아니다 (bbox col ${cMin}-${cMax} × row ${rMin}-${rMax}, area ${area}, cells ${cells.length})`
          );
        }
      }
    }

    // MC12 재료 — 내부 벽 수 집계(row 1..35 × col 1..48).
    let wallCount = 0;
    for (let row = 1; row <= 35; row++) {
      for (let col = 1; col <= 48; col++) {
        if (rows[row][col] === '#') wallCount++;
      }
    }
    wallCounts.push(wallCount);
  }

  // MC12 — 세 맵을 한 번에(평균 대비 ±10%).
  const avgWallCount = wallCounts.reduce((a, b) => a + b, 0) / wallCounts.length;
  MAPS.forEach((def, i) => {
    const deviation = Math.abs(wallCounts[i] - avgWallCount) / avgWallCount;
    if (deviation > 0.1) {
      fail(def.name, `내부 벽 수(${wallCounts[i]})가 평균(${avgWallCount.toFixed(1)})에서 ±10%를 벗어났다`);
    }
  });
}

assertMapInvariants();
