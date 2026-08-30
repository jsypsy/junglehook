import { describe, expect, it } from 'vitest'
import { createBody, grab, release, stepBody } from './physics'

const G = 2000
const STEP = 1 / 120

describe('physics', () => {
  it('자유 비행은 포물선 — 수평 속도 불변', () => {
    const b = createBody({ x: 0, y: 0 }, { x: 100, y: 0 })
    for (let i = 0; i < 120; i++) stepBody(b, G, STEP)
    expect(b.vel.x).toBe(100)
    expect(b.pos.y).toBeGreaterThan(900) // ~g/2·t² = 1000
    expect(b.pos.y).toBeLessThan(1100)
  })

  it('스윙 중 로프 길이가 늘어나지 않는다', () => {
    const b = createBody({ x: 0, y: 200 }, { x: 300, y: 0 })
    expect(grab(b, { x: 0, y: 0 }, 270)).toBe(true)
    for (let i = 0; i < 600; i++) {
      stepBody(b, G, STEP)
      const d = Math.hypot(b.pos.x - 0, b.pos.y - 0)
      expect(d).toBeLessThanOrEqual(b.ropeLen + 1e-6)
    }
  })

  it('에너지가 폭주하지 않는다 (5초 스윙)', () => {
    const b = createBody({ x: 0, y: 200 }, { x: 300, y: 0 })
    grab(b, { x: 0, y: 0 }, 270)
    const energy = () =>
      0.5 * (b.vel.x ** 2 + b.vel.y ** 2) + G * -b.pos.y
    const e0 = energy()
    for (let i = 0; i < 600; i++) stepBody(b, G, STEP)
    expect(energy()).toBeLessThanOrEqual(e0 + Math.abs(e0) * 0.05 + 1000)
  })

  it('reach 밖 grab은 실패', () => {
    const b = createBody({ x: 0, y: 300 }, { x: 0, y: 0 })
    expect(grab(b, { x: 0, y: 0 }, 270)).toBe(false)
    expect(b.anchor).toBeNull()
  })

  it('release는 속도를 보존한다', () => {
    const b = createBody({ x: 0, y: 200 }, { x: 300, y: 0 })
    grab(b, { x: 0, y: 0 }, 270)
    for (let i = 0; i < 60; i++) stepBody(b, G, STEP)
    const { x, y } = b.vel
    release(b)
    expect(b.vel).toEqual({ x, y })
    expect(b.anchor).toBeNull()
  })

  it('로프가 느슨하면 구속하지 않는다', () => {
    const b = createBody({ x: 0, y: 100 }, { x: 0, y: -500 })
    grab(b, { x: 0, y: 0 }, 270) // ropeLen=100, 위로 상승 → 느슨해짐
    stepBody(b, G, STEP)
    expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThan(100)
  })
})
