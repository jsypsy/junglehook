/**
 * 앵커 배치 — 시드 결정론 (같은 시드 = 같은 코스).
 * 난이도 곡선: x가 커질수록 가로 간격과 세로 흔들림이 TUNING.anchor.rampX까지 벌어지고(1차),
 * 그 뒤로는 사계절 한 바퀴마다 조금씩 더 벌어져 상한에 닿는다(2차) — "계절이 돌수록 어려워진다".
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

/** x 지점의 기준 간격(랜덤 흔들림 전)과 세로 흔들림 — 1차 램프 + 사계절 주기 2차 램프 */
export function difficultyAt(x: number): { gap: number; jitter: number } {
  const a = TUNING.anchor
  const t = Math.min(1, x / a.rampX)
  const cyclePx = TUNING.season.stepM * 4 * TUNING.pxPerMeter
  const cycles = Math.max(0, x - a.rampX) / cyclePx
  return {
    gap: Math.min(a.gapCap, lerp(a.gapMin, a.gapMax, t) + cycles * a.gapPerCycle),
    jitter: Math.min(a.jitterCap, lerp(a.jitterMin, a.jitterMax, t) + cycles * a.jitterPerCycle),
  }
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
      const { gap: gapBase, jitter } = difficultyAt(last.x)
      const gap = gapBase * this.rng.range(0.85, 1.15)
      const y = Math.min(a.yMax, Math.max(a.yMin, a.baseY + this.rng.range(-jitter, jitter)))
      last = { x: last.x + gap, y }
      this.anchors.push(last)
    }
  }
}
