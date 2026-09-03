import { afterEach, describe, expect, it } from 'vitest'
import { continueRun, continuesLeft, createGame, meters, press, releaseInput, selectTarget, sonicChanceAtPx, sonicInSweet, sonicMarker, sonicPendingReady, sonicSweetCenter, threatGap, threatSpeedAt, update } from './game'
import { TUNING } from './tuning'

const STEP = 1 / 120

/** 앵커 idx 바로 아래로 옮겨 잡는다 — 선호점(+130, −150)이 그 앵커에 떨어지게. 로프를 쥔 채면 먼저 놓는다 */
function grabAnchor(g: ReturnType<typeof createGame>, idx: number): void {
  const a = g.field.anchors[idx]!
  if (g.body.anchor) releaseInput(g)
  g.body.pos = { x: a.x - 100, y: a.y + 150 }
  g.body.vel = { x: 200, y: -50 }
  press(g)
  update(g, STEP)
  expect(g.body.anchor).toEqual({ x: a.x, y: a.y })
}

/** 그 해(stage)의 찬스 지점 뒤 첫 앵커 인덱스 — 여기를 잡으면 찬스가 터진다 (D-018) */
function chanceIdx(g: ReturnType<typeof createGame>, stage = 0): number {
  const at = sonicChanceAtPx(g, stage)
  g.field.ensure(at + 2000)
  return g.field.anchors.findIndex((a) => a.x >= at)
}

/** 찬스 앵커를 잡아 찬스를 터뜨린다 */
function grabToChance(g: ReturnType<typeof createGame>, stage = 0): number {
  const idx = chanceIdx(g, stage)
  grabAnchor(g, idx)
  return idx
}

/** 찬스가 터진 뒤 도전 시작 — 히트스톱이 끝날 때까지 기다렸다가 떼고 다시 누른다 (BUILD 24) */
function startChallenge(g: ReturnType<typeof createGame>): void {
  expect(g.sonic.pending).toBe(true)
  for (let i = 0; i < 120 * 0.6; i++) update(g, STEP)
  releaseInput(g)
  press(g)
  expect(g.sonic.pending).toBe(false)
  expect(g.holding).toBe(true)
}

/** 슈퍼 테스트는 찬스 잎에 7.5초 매달린다 — 위협(BUILD 19)에 잡히지 않게 끄고, 끝나면 복구 */
const threatOff = () => {
  ;(TUNING.threat as { enabled: boolean }).enabled = false
}

describe('game', () => {
  afterEach(() => {
    ;(TUNING.threat as { enabled: boolean }).enabled = true
  })

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
      if (g.sonic.pending) {
        // 슈퍼 도전 대기(BUILD 24) — 사람처럼 눌러 도전한다
        press(g)
      } else if (b.anchor && g.sonic.chance) {
        // 도전 중 — 장착되고 구간에 들어오면 놓는다 (한 바퀴 전에 놓으면 대기로 돌아가므로 끝까지 간다, BUILD 26)
        if (g.sonic.armed && sonicInSweet(g)) releaseInput(g)
      } else if (b.anchor) {
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
    expect(g.body.pos.x).toBeLessThanOrEqual(deadX) // 죽음이 거리를 주지 않는다
    expect(g.body.pos.y).toBeLessThan(TUNING.killY - 100)
    // 다음 잎이 dy 위·dx 이상 앞 — 첫 잎과 같은 기하
    const next = g.field.anchors.find((a) => a.x > g.body.pos.x)!
    expect(next.y + TUNING.continueSpawn.dy).toBeCloseTo(g.body.pos.y)
    expect(next.x - g.body.pos.x).toBeGreaterThanOrEqual(Math.min(TUNING.continueSpawn.dx, 148))
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

  it('이어하기: 후반(잎 높이 흔들림 최대)에서도 재출발 직후 잡을 잎이 위·사거리 안에 있다', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame(seed)
      press(g)
      g.body.pos = { x: 20000 + seed * 137, y: TUNING.killY + 50 }
      update(g, 1 / 120)
      expect(g.phase).toBe('dead')
      expect(continueRun(g)).toBe(true)
      const t = selectTarget(g)
      expect(t).not.toBeNull()
      // 다음 잎은 dy 위 — 죽은 자리가 기준 잎 바로 뒤면 그 잎(더 높은 쪽)이 타깃일 수도 있다. 어느 쪽이든 위·사거리 안
      const next = g.field.anchors.find((a) => a.x > g.body.pos.x)!
      expect(next.y + TUNING.continueSpawn.dy).toBeCloseTo(g.body.pos.y)
      const a = g.field.anchors[t!]!
      expect(g.body.pos.y - a.y).toBeGreaterThanOrEqual(TUNING.targetMinAbove)
      expect(Math.hypot(a.x - g.body.pos.x, a.y - g.body.pos.y)).toBeLessThanOrEqual(TUNING.reach)
    }
  })

  it('소닉 파워: 그 해의 찬스 지점 뒤 첫 잡기에서만 찬스 — 3바퀴 장착 → 게이지 → 직선 대시 후 일반 비행', () => {
    threatOff()
    const g = createGame(3)
    press(g)
    const at = sonicChanceAtPx(g, 0)
    const { chanceFrom, firstChanceTo, chanceStepM } = TUNING.sonic
    const m = (at - TUNING.startPos.x) / TUNING.pxPerMeter
    expect(m).toBeGreaterThanOrEqual(chanceFrom * chanceStepM)
    expect(m).toBeLessThanOrEqual(firstChanceTo * chanceStepM)
    expect(sonicChanceAtPx(g, 0)).toBe(at) // 시드 결정론
    // 지점 앞에서는 아무리 돌아도 충전되지 않는다
    for (let i = 0; i < 10; i++) update(g, 1 / 120)
    press(g)
    for (let i = 0; i < 120 * 12; i++) update(g, 1 / 120)
    expect(g.sonic.chance).toBe(false)
    expect(g.sonic.loops).toBe(0)
    // 지점 바로 앞 앵커까지도 안 터진다
    const idx = chanceIdx(g)
    grabAnchor(g, idx - 1)
    expect(g.sonic.chance).toBe(false)
    // 지점을 지난 첫 잡기 → 멈춤(알림) → 도전 대기 → 다시 누르면 충전 시작
    grabAnchor(g, idx)
    expect(g.sonic.chance).toBe(true)
    expect(g.sonic.freezeT).toBeGreaterThan(0)
    expect(g.sonic.pending).toBe(true)
    const frozenX = g.body.pos.x
    for (let i = 0; i < 120 * 0.3; i++) update(g, 1 / 120)
    expect(g.body.pos.x).toBe(frozenX) // 멈춤 동안 물리 정지
    startChallenge(g)
    let n = 0
    while (!g.sonic.armed && n++ < 120 * 30 && g.phase === 'playing') update(g, 1 / 120)
    expect(g.sonic.armed).toBe(true)
    // 게이지: 마커가 왕복한다
    g.sonic.gaugeT = 0
    expect(sonicMarker(g)).toBe(0)
    g.sonic.gaugeT = 0.5 / TUNING.sonic.gaugeHz
    expect(sonicMarker(g)).toBeCloseTo(1)
    // 성공 구간은 찬스마다 시드 랜덤 중심 — 마커를 그 중심에 맞춘다 (삼각파 상승 구간: marker = 2·gaugeHz·t)
    const c = g.sonic.sweetCenter
    expect(c).toBeGreaterThanOrEqual(TUNING.sonic.sweetFrom)
    expect(c).toBeLessThanOrEqual(TUNING.sonic.sweetTo)
    expect(sonicSweetCenter(g, 0)).toBe(c)
    g.sonic.gaugeT = c / (2 * TUNING.sonic.gaugeHz)
    expect(sonicMarker(g)).toBeCloseTo(c)
    expect(sonicInSweet(g)).toBe(true)
    g.sonic.gaugeT = (c > 0.5 ? 0.05 : 0.95) / (2 * TUNING.sonic.gaugeHz) // 반대편 끝
    expect(sonicInSweet(g)).toBe(false)
    g.sonic.gaugeT = c / (2 * TUNING.sonic.gaugeHz)
    const x0 = g.body.pos.x
    releaseInput(g)
    expect(g.sonic.dashing).toBe(true)
    expect(g.body.anchor).toBeNull()
    expect(g.sonic.usedStage[0]).toBe(true) // 이 계절의 찬스는 소모
    press(g)
    for (let i = 0; i < 120 * 2; i++) update(g, 1 / 120)
    expect(g.sonic.dashing).toBe(true)
    expect(g.body.anchor).toBeNull()
    expect(Math.abs(g.body.pos.y - TUNING.sonic.cruiseY)).toBeLessThan(5)
    releaseInput(g)
    while (g.sonic.dashing && g.phase === 'playing') update(g, 1 / 120)
    expect(g.sonic.dashing).toBe(false)
    expect(g.sonic.uses).toBe(1)
    expect(g.body.pos.x - x0).toBeGreaterThanOrEqual(TUNING.sonic.dashMeters * TUNING.pxPerMeter - 1)
    expect(g.body.vel.y).toBeLessThan(0)
  })

  it('소닉 찬스: 게이지 밖에서 놓으면 발동 없이 그 계절 찬스가 소모되고, 그 뒤 잡기에선 다시 안 터진다', () => {
    threatOff()
    const g = createGame(5)
    press(g)
    const idx = grabToChance(g)
    expect(g.sonic.chance).toBe(true)
    startChallenge(g)
    let n = 0
    while (!g.sonic.armed && n++ < 120 * 30 && g.phase === 'playing') update(g, 1 / 120)
    g.sonic.gaugeT = (g.sonic.sweetCenter > 0.5 ? 0.02 : 0.98) / (2 * TUNING.sonic.gaugeHz) // 구간 반대편
    expect(sonicInSweet(g)).toBe(false)
    releaseInput(g)
    expect(g.sonic.dashing).toBe(false)
    expect(g.sonic.chance).toBe(false)
    expect(g.sonic.usedStage[0]).toBe(true)
    grabAnchor(g, idx + 1)
    grabAnchor(g, idx + 2)
    expect(g.sonic.chance).toBe(false)
  })

  describe('슈퍼 도전 대기 (BUILD 24)', () => {
    it('찬스가 터지면 멈춘 채 대기 — 놓아도 찬스가 안 사라지고, 히트스톱 중 누름은 무시, 그 뒤 누르면 도전 시작', () => {
      threatOff()
      const g = createGame(3)
      press(g)
      grabToChance(g)
      expect(g.sonic.pending).toBe(true)
      expect(sonicPendingReady(g)).toBe(false) // 히트스톱 중
      // 놀라서 손을 뗐다
      releaseInput(g)
      expect(g.sonic.chance).toBe(true)
      expect(g.sonic.pending).toBe(true)
      expect(g.body.anchor).not.toBeNull()
      // 히트스톱 중의 누름은 무시
      press(g)
      expect(g.sonic.pending).toBe(true)
      expect(g.holding).toBe(false)
      // 히트스톱이 끝나도 세상은 멈춘 채
      for (let i = 0; i < 120 * 3; i++) update(g, STEP)
      expect(sonicPendingReady(g)).toBe(true)
      expect(g.timeSec).toBeGreaterThan(0)
      const x = g.body.pos.x
      for (let i = 0; i < 120; i++) update(g, STEP)
      expect(g.body.pos.x).toBe(x)
      // 다시 누르면 도전 — 회전이 0부터
      press(g)
      expect(g.sonic.pending).toBe(false)
      expect(g.holding).toBe(true)
      expect(g.sonic.loops).toBe(0)
      let n = 0
      while (!g.sonic.armed && n++ < 120 * 30 && g.phase === 'playing') update(g, STEP)
      expect(g.sonic.armed).toBe(true)
    })

    it('3바퀴 전에 놓으면 찬스를 잃지 않고 도전 대기로 돌아간다 — 다시 누르면 회전 0부터 (BUILD 26)', () => {
      threatOff()
      const g = createGame(3)
      press(g)
      grabToChance(g)
      startChallenge(g)
      // 반 바퀴쯤에서 놓는다 (한 바퀴 전)
      let n = 0
      while (Math.abs(g.sonic.spin) < Math.PI && n++ < 120 * 10) update(g, STEP)
      expect(g.sonic.loops).toBe(0)
      releaseInput(g)
      expect(g.sonic.pending).toBe(true)
      expect(g.sonic.chance).toBe(true)
      expect(g.sonic.usedStage[0]).toBeUndefined()
      expect(g.body.anchor).not.toBeNull()
      expect(g.sonic.loops).toBe(0)
      // 세상은 다시 멈춘다
      const x = g.body.pos.x
      for (let i = 0; i < 60; i++) update(g, STEP)
      expect(g.body.pos.x).toBe(x)
      // 다시 누르면 처음부터 — 이번엔 끝까지
      press(g)
      expect(g.sonic.pending).toBe(false)
      n = 0
      while (!g.sonic.armed && n++ < 120 * 30 && g.phase === 'playing') update(g, STEP)
      expect(g.sonic.armed).toBe(true)
    })

    it('한 바퀴 뒤에 놓으면 포기 — 찬스가 소모되고 일반 릴리스 (건너뛰는 길)', () => {
      threatOff()
      const g = createGame(3)
      press(g)
      grabToChance(g)
      startChallenge(g)
      let n = 0
      while (g.sonic.loops < 1 && n++ < 120 * 10) update(g, STEP)
      expect(g.sonic.loops).toBe(1)
      releaseInput(g)
      expect(g.sonic.pending).toBe(false)
      expect(g.sonic.chance).toBe(false)
      expect(g.sonic.usedStage[0]).toBe(true)
      expect(g.body.anchor).toBeNull()
    })

    it('게이지 입력 유예 — 구간을 막 지났어도 inputGraceSec 안이면 성공, 그 뒤면 실패 (BUILD 26)', () => {
      const g = createGame(3)
      const { sweetHalf, gaugeHz, inputGraceSec } = TUNING.sonic
      const speed = gaugeHz * 2 // 칸/초 (삼각파 상승 구간)
      g.sonic.sweetCenter = 0.5
      // 상승 구간에서 구간 오른쪽 끝을 지난 직후
      const edgeT = (0.5 + sweetHalf) / speed
      g.sonic.gaugeT = edgeT + inputGraceSec * 0.6
      expect(Math.abs(sonicMarker(g) - 0.5) <= sweetHalf).toBe(false) // 지금 마커는 구간 밖
      expect(sonicInSweet(g)).toBe(true) // 유예 안
      g.sonic.gaugeT = edgeT + inputGraceSec * 1.5
      expect(sonicInSweet(g)).toBe(false)
      // 구간 안이면 당연히 성공, 구간 한참 전이면 실패
      g.sonic.gaugeT = 0.5 / speed
      expect(sonicInSweet(g)).toBe(true)
      g.sonic.gaugeT = (0.5 - sweetHalf) / speed - inputGraceSec * 2
      expect(sonicInSweet(g)).toBe(false)
    })

    it('게이지 성공 구간 중심은 찬스마다 시드 랜덤 (0.2~0.8), 계절마다 다를 수 있다', () => {
      const g = createGame(9)
      const cs = [0, 1, 2, 3, 4, 5].map((st) => sonicSweetCenter(g, st))
      for (const c of cs) {
        expect(c).toBeGreaterThanOrEqual(TUNING.sonic.sweetFrom)
        expect(c).toBeLessThanOrEqual(TUNING.sonic.sweetTo)
      }
      expect(new Set(cs.map((c) => c.toFixed(3))).size).toBeGreaterThan(1)
      expect(sonicSweetCenter(createGame(9), 2)).toBe(cs[2])
    })
  })

  describe('뒤쫓는 위협 (BUILD 19)', () => {
    it('시작 시 headStartPx 뒤에서 출발하고 매 틱 전진한다', () => {
      const g = createGame(1)
      expect(threatGap(g)).toBeCloseTo(TUNING.threat.headStartPx, 5)
      press(g)
      const x0 = g.threatX
      update(g, STEP)
      expect(g.threatX).toBeGreaterThan(x0)
      expect(g.threatX - x0).toBeCloseTo(threatSpeedAt(x0) * STEP, 3)
    })

    it('속도는 rampX까지 오르고 사계절 주기마다 더 붙되 상한을 넘지 않는다', () => {
      const th = TUNING.threat
      expect(threatSpeedAt(0)).toBe(th.speedMin)
      expect(threatSpeedAt(TUNING.anchor.rampX)).toBeCloseTo(th.speedMax, 5)
      const cycle = TUNING.season.stepM * 4 * TUNING.pxPerMeter
      expect(threatSpeedAt(TUNING.anchor.rampX + cycle)).toBeCloseTo(th.speedMax + th.speedPerCycle, 5)
      expect(threatSpeedAt(1e9)).toBe(th.speedCap)
    })

    it('플레이어보다 maxLeadPx 이상 뒤처지지 않는다 (고무줄)', () => {
      const g = createGame(1)
      press(g)
      g.body.pos.x = 5000
      update(g, STEP)
      expect(threatGap(g)).toBeLessThanOrEqual(TUNING.threat.maxLeadPx + 1)
    })

    it('제자리에 매달려 있으면 잡혀서 죽고, 원인은 caught', () => {
      const g = createGame(1)
      press(g)
      // 첫 잎에 걸린 채 중력·펌프를 꺼서 정지 — 위협만 다가온다
      const a = g.field.anchors[0]!
      g.body.pos = { x: a.x, y: a.y + 150 }
      g.body.vel = { x: 0, y: 0 }
      press(g)
      const gravity = TUNING.gravity
      const pump = TUNING.swingPump
      ;(TUNING as { gravity: number }).gravity = 0
      ;(TUNING as { swingPump: number }).swingPump = 0
      try {
        for (let i = 0; i < 120 * 10 && g.phase === 'playing'; i++) update(g, STEP)
      } finally {
        ;(TUNING as { gravity: number }).gravity = gravity
        ;(TUNING as { swingPump: number }).swingPump = pump
      }
      expect(g.phase).toBe('dead')
      expect(g.cause).toBe('caught')
      expect(g.timeSec).toBeLessThan(5)
    })

    it('추락 사망의 원인은 fall', () => {
      const g = createGame(1)
      press(g)
      for (let i = 0; i < 120 * 10 && g.phase === 'playing'; i++) update(g, STEP)
      expect(g.cause).toBe('fall')
    })

    it('이어하기 뒤엔 위협이 다시 headStartPx 뒤로 밀린다', () => {
      const g = createGame(1)
      press(g)
      for (let i = 0; i < 120 * 10 && g.phase === 'playing'; i++) update(g, STEP)
      expect(continueRun(g)).toBe(true)
      expect(g.cause).toBeNull()
      expect(threatGap(g)).toBeCloseTo(TUNING.threat.headStartPx, 5)
    })

    it('찬스 잎에 매달려 충전하는 동안은 벽괴물이 물러나 멈춘다 — 3바퀴 회전 중 잡히지 않는다 (BUILD 21)', () => {
      const g = createGame(3)
      press(g)
      const idx = chanceIdx(g)
      // 벽괴물을 코앞까지 붙여 두고 찬스 앵커를 잡는다
      const a = g.field.anchors[idx]!
      g.threatX = a.x - 100 - 30
      grabAnchor(g, idx)
      expect(g.sonic.chance).toBe(true)
      expect(a.x - g.threatX).toBeGreaterThanOrEqual(TUNING.threat.chanceBackPx)
      const backX = g.threatX
      startChallenge(g)
      // 회전 3바퀴 + 게이지 — 12초 동안 매달린다
      let n = 0
      while (g.sonic.chance && n++ < 120 * 12 && g.phase === 'playing') update(g, STEP)
      expect(g.phase).toBe('playing')
      expect(g.threatX).toBe(backX)
      // 놓으면 다시 쫓아온다
      releaseInput(g)
      update(g, STEP)
      expect(g.threatX).toBeGreaterThan(backX)
    })

    it('enabled=false면 절대 잡히지 않는다 (?p=nothreat)', () => {
      const th = TUNING.threat as { enabled: boolean }
      th.enabled = false
      try {
        const g = createGame(1)
        press(g)
        g.body.pos.x = -5000
        update(g, STEP)
        expect(g.phase).toBe('playing')
        expect(threatGap(g)).toBe(Infinity)
      } finally {
        th.enabled = true
      }
    })
  })
})
