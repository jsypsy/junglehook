import { describe, expect, it } from 'vitest'
import { PRESETS, TUNING, applyPreset } from './tuning'

describe('tuning presets', () => {
  it('모르는 프리셋은 무시', () => {
    const before = { ...TUNING }
    expect(applyPreset(null)).toBeNull()
    expect(applyPreset('nope')).toBeNull()
    expect(TUNING).toEqual(before)
  })

  it('b4 프리셋은 TUNING 위에 덮어쓴다', () => {
    expect(applyPreset('b4')).toBe('b4')
    for (const [k, v] of Object.entries(PRESETS.b4!)) expect((TUNING as Record<string, unknown>)[k]).toBe(v)
  })
})
