import { describe, expect, it } from 'vitest'
import { Rng, stageSeed } from './rng'

describe('Rng', () => {
  it('같은 시드는 같은 수열을 낸다 (저장/복원의 전제)', () => {
    const a = new Rng(1234)
    const b = new Rng(1234)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('다른 시드는 다른 수열', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    const same = Array.from({ length: 20 }, () => a.next() === b.next())
    expect(same.every(Boolean)).toBe(false)
  })

  it('next는 [0,1) 범위', () => {
    const r = new Rng(99)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('시드 0도 살아난다 (0이면 LCG가 고정될 수 있어 1로 치환)', () => {
    const r = new Rng(0)
    expect(r.next()).not.toBe(r.next())
  })

  it('shuffle은 원본을 보존하고 순열을 만든다', () => {
    const src = [1, 2, 3, 4, 5]
    const out = new Rng(7).shuffle(src)
    expect(src).toEqual([1, 2, 3, 4, 5])
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('stageSeed는 스테이지마다 다르고 재현된다', () => {
    expect(stageSeed(42, 1)).toBe(stageSeed(42, 1))
    expect(stageSeed(42, 1)).not.toBe(stageSeed(42, 2))
    expect(stageSeed(42, 1)).not.toBe(stageSeed(43, 1))
  })
})
