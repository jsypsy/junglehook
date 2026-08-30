import { describe, expect, it } from 'vitest'
import { createBody, grab, pump, reelIn, release, stepBody } from './physics'

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

  it('진자가 감쇠하지 않는다 — 30초 뒤에도 진폭 유지 (수직 정지 상태 방지, D-006)', () => {
    const len = 90
    const a0 = (60 * Math.PI) / 180
    const b = createBody({ x: len * Math.sin(a0), y: len * Math.cos(a0) }, { x: 0, y: 0 })
    grab(b, { x: 0, y: 0 }, 1000)
    let lateAmp = 0
    for (let i = 0; i < 120 * 30; i++) {
      stepBody(b, G, STEP)
      if (i > 120 * 27) lateAmp = Math.max(lateAmp, Math.abs(Math.atan2(b.pos.x, b.pos.y)))
    }
    expect((lateAmp * 180) / Math.PI).toBeGreaterThan(55)
  })

  it('감기: 로프가 줄고 몸이 앵커 쪽으로 당겨진다 (gain 0이면 속력 유지)', () => {
    const b = createBody({ x: 0, y: 200 }, { x: 300, y: 0 })
    grab(b, { x: 0, y: 0 }, 270)
    reelIn(b, 50, 90, 0)
    expect(b.ropeLen).toBe(150)
    expect(b.pos.y).toBeCloseTo(150)
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(300)
    reelIn(b, 1000, 90, 1)
    expect(b.ropeLen).toBe(90)
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(300 * (150 / 90))
  })

  it('펌프: 진행 방향으로 속력이 붙되 상한을 넘지 않는다', () => {
    const b = createBody({ x: 0, y: 0 }, { x: 300, y: 400 })
    pump(b, 100, 1100)
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(600)
    expect(b.vel.x / b.vel.y).toBeCloseTo(300 / 400)
    pump(b, 10000, 1100)
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(1100)
    pump(b, 100, 1100)
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(1100)
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
