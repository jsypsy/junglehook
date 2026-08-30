import { describe, expect, it } from 'vitest'
import { AnchorField } from './anchors'
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
    const { gapMin, gapMax, yMin, yMax } = TUNING.anchor
    for (let i = 1; i < f.anchors.length; i++) {
      const gap = f.anchors[i]!.x - f.anchors[i - 1]!.x
      expect(gap).toBeGreaterThanOrEqual(gapMin * 0.85 - 1e-9)
      expect(gap).toBeLessThanOrEqual(gapMax * 1.15 + 1e-9)
      expect(f.anchors[i]!.y).toBeGreaterThanOrEqual(yMin)
      expect(f.anchors[i]!.y).toBeLessThanOrEqual(yMax)
    }
  })

  it('ensure는 요청 지점 너머까지 채운다', () => {
    const f = new AnchorField(1)
    f.ensure(3000)
    expect(f.anchors[f.anchors.length - 1]!.x).toBeGreaterThanOrEqual(3000)
  })
})
