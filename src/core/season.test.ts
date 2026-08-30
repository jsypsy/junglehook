import { describe, expect, it } from 'vitest'
import { seasonAt } from './season'
import { TUNING } from './tuning'

describe('season', () => {
  it('시작은 봄, 250m마다 여름·가을·겨울, 1000m에 다시 봄', () => {
    expect(seasonAt(0).season).toBe('spring')
    expect(seasonAt(249).season).toBe('spring')
    expect(seasonAt(250).season).toBe('summer')
    expect(seasonAt(500).season).toBe('autumn')
    expect(seasonAt(750).season).toBe('winter')
    expect(seasonAt(1000).season).toBe('spring')
    expect(seasonAt(1000).stage).toBe(4)
  })

  it('경계에서 blendM 동안 직전 계절에서 보간된다', () => {
    const b = TUNING.season.blendM
    expect(seasonAt(0).blend).toBe(1) // 첫 봄은 보간 없음
    const start = seasonAt(250)
    expect(start.prev).toBe('spring')
    expect(start.blend).toBe(0)
    expect(seasonAt(250 + b / 2).blend).toBeCloseTo(0.5)
    expect(seasonAt(250 + b).blend).toBe(1)
    expect(seasonAt(300).blend).toBe(1)
  })

  it('계절 안 진행도는 0→1', () => {
    expect(seasonAt(750).progress).toBe(0)
    expect(seasonAt(875).progress).toBeCloseTo(0.5)
    expect(seasonAt(-5).season).toBe('spring')
  })
})
