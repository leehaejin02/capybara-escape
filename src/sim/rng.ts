/**
 * 시드 고정 PRNG (mulberry32).
 *
 * 무의존 자체 구현. `Math.random()`은 시드를 고정할 수 없어 재현성이 깨지므로
 * sim 어디에서도 쓰지 않는다 — 반드시 이 RNG를 통해서만 난수를 뽑는다.
 */

export interface RNG {
  /** 다음 난수를 [0, 1) 범위로 반환한다. */
  next(): number;
  /** [0, maxExclusive) 범위의 정수를 반환한다. */
  nextInt(maxExclusive: number): number;
}

/** mulberry32 알고리즘으로 시드 고정 RNG를 생성한다. 같은 seed는 항상 같은 수열을 낸다. */
export function createRng(seed: number): RNG {
  let a = seed >>> 0;

  function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(maxExclusive: number): number {
    return Math.floor(next() * maxExclusive);
  }

  return { next, nextInt };
}
