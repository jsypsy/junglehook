import { describe, expect, it } from 'vitest'
import { hexToOklab, mixHex, oklabToHex } from './color'

describe('color', () => {
  it('hex → oklab → hex 왕복', () => {
    for (const h of ['#000000', '#ffffff', '#ff7f3f', '#1f3a2a', '#bfe8f5', '#a9dc8e']) {
      expect(oklabToHex(hexToOklab(h))).toBe(h)
    }
  })
  it('보간: 끝점은 그대로, 중간은 두 색 사이', () => {
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000')
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff')
    const mid = mixHex('#a9dc8e', '#dfe9ec', 0.5)
    const [L] = hexToOklab(mid)
    const [La] = hexToOklab('#a9dc8e')
    const [Lb] = hexToOklab('#dfe9ec')
    expect(L).toBeGreaterThan(Math.min(La, Lb))
    expect(L).toBeLessThan(Math.max(La, Lb))
  })
})
