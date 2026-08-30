import { describe, expect, it } from 'vitest'
import { seasonAt } from './season'
import { TUNING } from './tuning'

describe('season', () => {
  it('시작은 봄, stepM마다 여름·가을·겨울, 4단계 뒤 다시 봄', () => {
    const S = TUNING.season.stepM
    expect(seasonAt(0).season).toBe('spring')
    expect(seasonAt(S - 1).season).toBe('spring')
    expect(seasonAt(S).season).toBe('summer')
    expect(seasonAt(2 * S).season).toBe('autumn')
    expect(seasonAt(3 * S).season).toBe('winter')
    expect(seasonAt(4 * S).season).toBe('spring')
    expect(seasonAt(4 * S).stage).toBe(4)
  })

  it('경계에서 blendM 동안 직전 계절에서 보간된다', () => {
    const b = TUNING.season.blendM
    expect(seasonAt(0).blend).toBe(1) // 첫 봄은 보간 없음
    const S = TUNING.season.stepM
    const start = seasonAt(S)
    expect(start.prev).toBe('spring')
    expect(start.blend).toBe(0)
    expect(seasonAt(S + b / 2).blend).toBeCloseTo(0.5)
    expect(seasonAt(S + b).blend).toBe(1)
    expect(seasonAt(S + b + 10).blend).toBe(1)
  })

  it('계절 안 진행도는 0→1', () => {
    const S = TUNING.season.stepM
    expect(seasonAt(3 * S).progress).toBe(0)
    expect(seasonAt(3.5 * S).progress).toBeCloseTo(0.5)
    expect(seasonAt(-5).season).toBe('spring')
  })
})
