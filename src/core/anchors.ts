/**
 * 앵커 배치 — 시드 결정론 (같은 시드 = 같은 코스).
 * 난이도 곡선: x가 커질수록 가로 간격과 세로 흔들림이 TUNING.anchor.rampX까지 벌어진다.
 */
import { Rng } from './rng'
import { TUNING } from './tuning'

export interface Anchor {
  x: number
  y: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export class AnchorField {
  readonly anchors: Anchor[] = []
  private readonly rng: Rng

  constructor(seed: number) {
    this.rng = new Rng(seed)
    this.anchors.push({ ...TUNING.anchor.first })
  }

  /** untilX까지 앵커가 존재하도록 생성 (카메라 전방 확보용) */
  ensure(untilX: number): void {
    const a = TUNING.anchor
    let last = this.anchors[this.anchors.length - 1]!
    while (last.x < untilX) {
      const t = Math.min(1, last.x / a.rampX)
      const gap = lerp(a.gapMin, a.gapMax, t) * this.rng.range(0.85, 1.15)
      const jitter = lerp(a.jitterMin, a.jitterMax, t)
      const y = Math.min(a.yMax, Math.max(a.yMin, a.baseY + this.rng.range(-jitter, jitter)))
      last = { x: last.x + gap, y }
      this.anchors.push(last)
    }
  }
}
