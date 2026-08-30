import { describe, expect, it } from 'vitest'
import { continueRun, continuesLeft, createGame, meters, press, releaseInput, selectTarget, update } from './game'
import { TUNING } from './tuning'

const STEP = 1 / 120

describe('game', () => {
  it('ready에서 press로 시작한다', () => {
    const g = createGame(1)
    expect(g.phase).toBe('ready')
    press(g)
    expect(g.phase).toBe('playing')
  })

  it('입력이 없으면 떨어져 죽고, 거리·시간이 기록된다', () => {
    const g = createGame(1)
    press(g)
    for (let i = 0; i < 120 * 10 && g.phase === 'playing'; i++) update(g, STEP)
    expect(g.phase).toBe('dead')
    expect(g.distancePx).toBeGreaterThan(0)
    expect(g.timeSec).toBeGreaterThan(0)
    expect(g.timeSec).toBeLessThan(5) // 방치 사망은 수 초 안
  })

  it('타깃은 reach 안 + 위쪽 앵커만 고른다', () => {
    const g = createGame(1)
    press(g)
    update(g, STEP)
    const idx = selectTarget(g)
    if (idx !== null) {
      const a = g.field.anchors[idx]!
      const p = g.body.pos
      expect(Math.hypot(a.x - p.x, a.y - p.y)).toBeLessThanOrEqual(TUNING.reach)
      expect(a.y).toBeLessThan(p.y)
    }
  })

  it('홀드 선입력 — reach에 닿는 순간 자동으로 잡힌다', () => {
    const g = createGame(1)
    press(g) // 시작
    press(g) // 즉시 홀드 (아직 타깃이 없을 수 있다)
    let grabbed = false
    for (let i = 0; i < 120 * 3; i++) {
      update(g, STEP)
      if (g.body.anchor) {
        grabbed = true
        break
      }
    }
    expect(grabbed).toBe(true)
  })

  it('간단한 봇이 30초를 살아남고 전진한다 (핵심 루프 성립 검증)', () => {
    const g = createGame(42)
    press(g)
    for (let i = 0; i < 120 * 30 && g.phase === 'playing'; i++) {
      const b = g.body
      if (b.anchor) {
        // 낮을수록 더 강하게 상승 중일 때만 놓는다 (고도 회복 우선)
        const need = b.pos.y > 380 ? -350 : -80
        if (b.pos.x > b.anchor.x && b.vel.y < need && b.vel.x > 150) releaseInput(g)
      } else if (!g.holding && b.vel.y > -20) {
        press(g) // 정점을 지나면 다음 로프를 예약
      }
      update(g, STEP)
    }
    expect(g.phase).toBe('playing')
    expect(meters(g)).toBeGreaterThan(30)
  })

  it('거리는 현재 위치 기준 — 뒤로 가면 줄어든다', () => {
    const g = createGame(1)
    press(g)
    g.body.pos.x = TUNING.startPos.x + 500
    update(g, 1 / 120)
    expect(meters(g)).toBe(10)
    g.body.pos.x = TUNING.startPos.x + 250
    update(g, 1 / 120)
    expect(meters(g)).toBe(5)
    g.body.pos.x = 0
    update(g, 1 / 120)
    expect(meters(g)).toBe(0)
  })

  it('이어하기: 죽은 뒤 마지막 앵커 앞에서 재출발, 판당 maxContinues회', () => {
    const g = createGame(7)
    press(g)
    // 아무것도 안 잡고 떨어져 죽는다
    for (let i = 0; i < 120 * 5 && g.phase === 'playing'; i++) update(g, 1 / 120)
    expect(g.phase).toBe('dead')
    expect(continuesLeft(g)).toBe(TUNING.maxContinues)
    const deadX = g.body.pos.x
    expect(continueRun(g)).toBe(true)
    expect(g.phase).toBe('playing')
    expect(g.continues).toBe(1)
    expect(g.body.anchor).toBeNull()
    expect(g.body.vel.y).toBeLessThan(0) // 위로 던져진다
    expect(g.body.pos.x).toBeLessThanOrEqual(deadX + TUNING.continueSpawn.dx)
    expect(g.body.pos.y).toBeLessThan(TUNING.killY - 100)
    // 살아 있는 동안은 거부
    expect(continueRun(g)).toBe(false)
    for (let n = 1; n < TUNING.maxContinues; n++) {
      for (let i = 0; i < 120 * 5 && g.phase === 'playing'; i++) update(g, 1 / 120)
      expect(continueRun(g)).toBe(true)
    }
    for (let i = 0; i < 120 * 5 && g.phase === 'playing'; i++) update(g, 1 / 120)
    expect(g.phase).toBe('dead')
    expect(continuesLeft(g)).toBe(0)
    expect(continueRun(g)).toBe(false)
  })
})
