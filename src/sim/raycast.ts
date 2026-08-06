/**
 * raycast.ts — DDA(Amanatides–Woo) 레이캐스트. RULES.md §4.4.
 *
 * sim 전체에서 벽 차폐 판정은 이 함수 하나만 쓴다(§4.4 마지막 줄, §7.2, §7.3).
 * 고블린 시야(vision.ts)·봇 위험 인지(bot.ts)·봇 네비게이션(bot.ts)이 전부 이걸 공유한다.
 *
 * ⚠️ 이 파일은 `docs/RULES.md` §8 위험#2("부호 하나 틀리면 고블린과 봇이 동시에 미친다")의
 * 방어 장치를 담는다. 모듈 로드 시(=이 파일을 처음 import하는 순간, 사실상 부팅 시)
 * 하드코딩 8케이스를 검사해 실패하면 즉시 throw한다. 맵이 고정이므로 가능한 방식이다.
 */
import { WORLD } from '../config/balance';
import { isSolid, tileCenter } from './map';
import type { Vec2 } from './types';

const T = WORLD.TILE_SIZE_PX;

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/**
 * a→b 선분이 solid 타일을 지나는지 판정한다. RULES.md §4.4 pseudocode 그대로.
 * - 시작 타일도 검사한다(고블린이 벽 안에 있으면 아무것도 못 보는 게 맞다).
 * - tMaxX === tMaxY(정확히 모서리를 지나는 경우) 이면 Y를 먼저 밟는다 — `else` 분기가 Y다.
 * - `t > 1`이면 선분 끝을 지나쳤다는 뜻이므로 false로 종료(무한 루프 방지).
 */
export function rayHitsWall(a: Vec2, b: Vec2): boolean {
  let cx = Math.floor(a.x / T);
  let cy = Math.floor(a.y / T);
  const ex = Math.floor(b.x / T);
  const ey = Math.floor(b.y / T);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepX = sign(dx);
  const stepY = sign(dy);

  let tDeltaX: number;
  let tMaxX: number;
  if (dx !== 0) {
    tDeltaX = Math.abs(T / dx);
    const nextBoundaryX = stepX > 0 ? (cx + 1) * T : cx * T;
    tMaxX = (nextBoundaryX - a.x) / dx;
  } else {
    tDeltaX = Infinity;
    tMaxX = Infinity;
  }

  let tDeltaY: number;
  let tMaxY: number;
  if (dy !== 0) {
    tDeltaY = Math.abs(T / dy);
    const nextBoundaryY = stepY > 0 ? (cy + 1) * T : cy * T;
    tMaxY = (nextBoundaryY - a.y) / dy;
  } else {
    tDeltaY = Infinity;
    tMaxY = Infinity;
  }

  while (true) {
    if (isSolid(cx, cy)) return true;
    if (cx === ex && cy === ey) return false;
    if (tMaxX < tMaxY) {
      if (tMaxX > 1) return false;
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      if (tMaxY > 1) return false;
      cy += stepY;
      tMaxY += tDeltaY;
    }
  }
}

// ── §8 위험#2 방어: 부팅 시 하드코딩 8케이스 단언 ────────────────────────────
// 좌표는 고정 맵(map.ts)의 실측 구조에서 뽑았다(scratchpad 스크립트로 실제 DDA 실행 결과 확인,
// tech가 직접 계산). 아래 8케이스는 "벽 너머가 안 보이는 케이스"(3,4) / "뻥 뚫린 복도가 보이는
// 케이스"(1,2,5) / "대각선"(6,7) / "경계"(8)를 모두 포함한다.
interface RaycastCase {
  name: string;
  a: [number, number]; // 타일 (col,row)
  b: [number, number];
  expectHitsWall: boolean;
}

const BOOT_CASES: readonly RaycastCase[] = [
  { name: '격자 행 라인(row 7) 전 구간 개방', a: [6, 7], b: [42, 7], expectHitsWall: false },
  { name: '격자 열 라인(col 6) 전 구간 개방', a: [6, 7], b: [6, 31], expectHitsWall: false },
  { name: '방 경계벽(row5, 문 아닌 col12) 차단', a: [5, 5], b: [30, 5], expectHitsWall: true },
  { name: '방 경계벽(row12, 문 아닌 col15) 차단', a: [15, 10], b: [15, 15], expectHitsWall: true },
  { name: '문(row6, col12 통과) 개방', a: [10, 6], b: [14, 6], expectHitsWall: false },
  { name: '대각선 — 개방된 방 내부', a: [1, 4], b: [4, 7], expectHitsWall: false },
  { name: '대각선 — 차폐물에 막힘', a: [5, 5], b: [9, 9], expectHitsWall: true },
  { name: '경계 — 맵 밖 좌표는 solid 취급', a: [1, 5], b: [-1, 5], expectHitsWall: true },
];

function assertRaycastBootCases(): void {
  for (const c of BOOT_CASES) {
    const a = tileCenter(c.a[0], c.a[1]);
    const b = tileCenter(c.b[0], c.b[1]);
    const actual = rayHitsWall(a, b);
    if (actual !== c.expectHitsWall) {
      throw new Error(
        `[raycast.ts] DDA 부팅 단언 실패: "${c.name}" — (${c.a})↔(${c.b}) 기대 hitsWall=${c.expectHitsWall}, 실제=${actual}`
      );
    }
  }
}

assertRaycastBootCases();
