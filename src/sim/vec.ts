/**
 * vec.ts — Vec2 순수 수학 헬퍼.
 *
 * 밸런스 수치가 아니라 벡터 연산 유틸이므로 balance.ts와 무관하다.
 * `1e-6` 류의 부동소수 안정성 상수는 RULES.md §0 계약 2의 예외 조항에 따라
 * 코드에 직접 쓴다(밸런스 수치가 아니다).
 */
import type { Vec2 } from './types';

export const EPS_LEN = 1e-6;

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function lengthSq(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function length(a: Vec2): number {
  return Math.sqrt(lengthSq(a));
}

export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 길이가 EPS_LEN 미만이면 (0,0)을 반환한다(정규화 불능 방어). */
export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  if (len < EPS_LEN) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

/** 벡터 v를 반시계 기준 rad(라디안)만큼 회전한다. */
export function rotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
