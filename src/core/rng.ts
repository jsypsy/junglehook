/**
 * 시드 난수 (LCG). 품질보다 **재현성**이 목적이다 (슈팅스타 D-005에서 이식) —
 * 런 시드 + 스테이지 번호가 같으면 스테이지 구성이 항상 같아야
 * 저장/복원이 성립한다. Math.random은 core에서 금지.
 */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0 || 1
  }

  /** [0, 1) */
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0
    return this.s / 4294967296
  }

  /** [0, n) 정수 */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** [a, b) 실수 */
  range(a: number, b: number): number {
    return a + this.next() * (b - a)
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('빈 배열에서 pick')
    return arr[this.int(arr.length)]!
  }

  /** 피셔-예이츠 — 원본은 건드리지 않는다 */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      const t = out[i]!
      out[i] = out[j]!
      out[j] = t
    }
    return out
  }
}

/** 런 시드 + 스테이지 번호 → 파생 시드. 스테이지마다 독립이면서 결정적 */
export function stageSeed(runSeed: number, stage: number): number {
  let h = (runSeed ^ Math.imul(stage, 2654435761)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0
  return (h ^ (h >>> 13)) >>> 0
}
