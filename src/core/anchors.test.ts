import { describe, expect, it } from 'vitest'
import { AnchorField, difficultyAt } from './anchors'
import { TUNING } from './tuning'

describe('AnchorField', () => {
  it('같은 시드 = 같은 배치', () => {
    const a = new AnchorField(42)
    const b = new AnchorField(42)
    a.ensure(5000)
    b.ensure(5000)
    expect(a.anchors).toEqual(b.anchors)
  })

  it('x 단조 증가 + 간격·세로 범위 준수', () => {
    const f = new AnchorField(7)
    f.ensure(12000)
    const { gapMin, gapCap, yMin, yMax } = TUNING.anchor
    for (let i = 1; i < f.anchors.length; i++) {
      const gap = f.anchors[i]!.x - f.anchors[i - 1]!.x
      expect(gap).toBeGreaterThanOrEqual(gapMin * 0.85 - 1e-9)
      expect(gap).toBeLessThanOrEqual(gapCap * 1.15 + 1e-9)
      expect(f.anchors[i]!.y).toBeGreaterThanOrEqual(yMin)
      expect(f.anchors[i]!.y).toBeLessThanOrEqual(yMax)
    }
  })

  it('ensure는 요청 지점 너머까지 채운다', () => {
    const f = new AnchorField(1)
    f.ensure(3000)
    expect(f.anchors[f.anchors.length - 1]!.x).toBeGreaterThanOrEqual(3000)
  })

  it('2차 램프: 사계절이 돌수록 간격·흔들림이 더 벌어지고 상한에서 멈춘다', () => {
    const a = TUNING.anchor
    const cyclePx = TUNING.season.stepM * 4 * TUNING.pxPerMeter
    const atRamp = difficultyAt(a.rampX)
    expect(atRamp.gap).toBeCloseTo(a.gapMax)
    expect(atRamp.jitter).toBeCloseTo(a.jitterMax)
    const oneCycle = difficultyAt(a.rampX + cyclePx)
    expect(oneCycle.gap).toBeCloseTo(a.gapMax + a.gapPerCycle)
    expect(oneCycle.jitter).toBeCloseTo(a.jitterMax + a.jitterPerCycle)
    const far = difficultyAt(a.rampX + cyclePx * 50)
    expect(far.gap).toBe(a.gapCap)
    expect(far.jitter).toBe(a.jitterCap)
    // 간격 상한은 사거리 안 — 닿을 수 없는 배치는 만들지 않는다
    expect(a.gapCap * 1.15).toBeLessThan(TUNING.reach)
  })
})
