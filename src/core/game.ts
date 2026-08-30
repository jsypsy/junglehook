/**
 * 게임 상태머신. 순수 로직 — 입력은 press/releaseInput, 시간은 update(dt)로만 들어온다.
 *
 * 조작 규약 (D-005 예정 — 프로토타입 검증 대상):
 * - 홀드 중 로프가 없으면 매 프레임 타깃을 잡으려 시도한다 (선입력 버퍼링 —
 *   reach 밖에서 미리 누르고 있어도 닿는 순간 잡힌다. 억울한 죽음 방지)
 * - 잡힐 앵커는 매 프레임 계산해 targetIdx로 노출 — 렌더러가 하이라이트한다.
 *   플레이어가 "지금 누르면 어디에 걸리는지" 항상 볼 수 있어야 죽음이 납득된다
 */
import { AnchorField } from './anchors'
import { Rng } from './rng'
import type { Body } from './physics'
import { createBody, grab, pump, reelIn, release, stepBody } from './physics'
import { TUNING } from './tuning'

export type Phase = 'ready' | 'playing' | 'dead'

export interface Game {
  seed: number
  phase: Phase
  body: Body
  field: AnchorField
  holding: boolean
  /** 지금 홀드하면 잡힐 앵커 인덱스 — 없으면 null */
  targetIdx: number | null
  /** 도달 최대 x (px) — 점수의 원천 */
  /** 현재 위치 기준 전진 거리 (px) — 뒤로 가면 줄어든다. 점수는 죽은 지점 기준 (과회전의 비용) */
  distancePx: number
  /** 이번 판에 쓴 이어하기 횟수 */
  continues: number
  /** 소닉 파워 상태 */
  sonic: SonicState
  /** 이번 런 경과 시간 (초) — 세션 길이 계측용 */
  timeSec: number
  /** 뒤쫓는 위협의 앞머리 x (px) — 플레이어가 이보다 뒤면 잡혀서 죽는다 (BUILD 19) */
  threatX: number
  /** 사망 원인 — 추락(내가 놓친 것) / 잡힘(내가 지체한 것) */
  cause: 'fall' | 'caught' | null
}

export interface SonicState {
  /** 현재 앵커에서 누적된 회전각 (rad, 부호 있음) — 잡을 때 0 */
  spin: number
  /** 현재 앵커에서 완주한 바퀴 수 */
  loops: number
  /** 장착됨 — 다음 릴리스에 대시 */
  armed: boolean
  /** 대시 중 */
  dashing: boolean
  /** 남은 대시 거리 (px) */
  dashLeftPx: number
  /** 이번 판 대시 횟수 */
  uses: number
  /** 장착 후 흐른 시간 (s) — 게이지 마커 위치의 근거 */
  gaugeT: number
  /** 계절 단계별로 지금까지 잡은 서로 다른 앵커 수 — k번째에서 찬스가 터진다 (D-015) */
  grabsInStage: Record<number, number>
  /** 마지막으로 잡은 앵커 인덱스 — 같은 앵커 재잡기는 안 센다 */
  lastGrabIdx: number
  /** 찬스를 쓴(잡았다 놓은) 계절 단계 */
  usedStage: Record<number, true>
  /** 지금 찬스 앵커에 매달려 있다 — 이때만 충전된다 */
  chance: boolean
  /** 찬스 앵커에 걸린 순간의 멈춤 (남은 초) */
  freezeT: number
}

export function createSonic(): SonicState {
  return { spin: 0, loops: 0, armed: false, dashing: false, dashLeftPx: 0, uses: 0, gaugeT: 0, grabsInStage: {}, lastGrabIdx: -1, usedStage: {}, chance: false, freezeT: 0 }
}

/** 계절 단계 번호 (거리 기준, season.stepM) */
function stageOfX(x: number): number {
  return Math.floor(Math.max(0, x - TUNING.startPos.x) / (TUNING.season.stepM * TUNING.pxPerMeter))
}

/**
 * 이 계절 단계에서 찬스가 터지는 "몇 번째 잡기"인가 — 시드+단계로 결정되는 랜덤 (D-015).
 * 앵커 위치가 아니라 잡기 순서에 걸려 있어 찬스는 계절마다 반드시 손에 들어온다 (앵커를 k개 이상 잡는 한)
 */
export function sonicChanceK(g: Game, stage: number): number {
  const { chanceGrabMin, chanceGrabMax } = TUNING.sonic
  const r = new Rng((g.seed ^ (stage * 7919 + 13)) >>> 0)
  return chanceGrabMin + r.int(chanceGrabMax - chanceGrabMin + 1)
}

/** 게이지 마커 위치 0~1 — 삼각파로 왕복 */
export function sonicMarker(g: Game): number {
  const x = (g.sonic.gaugeT * TUNING.sonic.gaugeHz * 2) % 2
  return 1 - Math.abs(x - 1)
}

/** 지금 놓으면 발동하는가 — 마커가 가운데 성공 구간 안 */
export function sonicInSweet(g: Game): boolean {
  return Math.abs(sonicMarker(g) - 0.5) <= TUNING.sonic.sweetHalf
}

/** 앵커 기준 각도 (아래 = 0, 앞쪽이 +) */
function swingAngle(g: Game): number {
  const b = g.body
  if (!b.anchor) return 0
  return Math.atan2(b.pos.x - b.anchor.x, b.pos.y - b.anchor.y)
}

export function createGame(seed: number): Game {
  const field = new AnchorField(seed)
  field.ensure(TUNING.startPos.x + TUNING.viewW * 2)
  return {
    seed,
    phase: 'ready',
    body: createBody(TUNING.startPos, TUNING.startVel),
    field,
    holding: false,
    targetIdx: null,
    distancePx: 0,
    continues: 0,
    sonic: createSonic(),
    timeSec: 0,
    threatX: TUNING.startPos.x - TUNING.threat.headStartPx,
    cause: null,
  }
}

/** 위협 속도 (px/s) — 위협의 현재 x 기준: 1차 램프(rampX) + 사계절 한 바퀴마다 가속, 상한 */
export function threatSpeedAt(x: number): number {
  const th = TUNING.threat
  const a = TUNING.anchor
  const t = Math.min(1, Math.max(0, x) / a.rampX)
  const cyclePx = TUNING.season.stepM * 4 * TUNING.pxPerMeter
  const cycles = Math.max(0, x - a.rampX) / cyclePx
  return Math.min(th.speedCap, th.speedMin + (th.speedMax - th.speedMin) * t + cycles * th.speedPerCycle)
}

/** 플레이어와 위협 사이 거리 (px, 클수록 안전). 위협이 꺼져 있으면 Infinity */
export function threatGap(g: Game): number {
  return TUNING.threat.enabled ? g.body.pos.x - g.threatX : Infinity
}

/** 위협 전진 + 고무줄 + 잡힘 판정. 찬스 멈춤(freeze) 중엔 호출하지 않는다 */
function updateThreat(g: Game, dt: number): void {
  const th = TUNING.threat
  if (!th.enabled) return
  g.threatX += threatSpeedAt(g.threatX) * dt
  g.threatX = Math.max(g.threatX, g.body.pos.x - th.maxLeadPx)
  if (g.body.pos.x <= g.threatX) {
    g.phase = 'dead'
    g.cause = 'caught'
    g.holding = false
    release(g.body)
  }
}

/** 미터 점수 (표시용) */
export function meters(g: Game): number {
  return Math.floor(g.distancePx / TUNING.pxPerMeter)
}

/**
 * 타깃 선택: reach 안 + 충분히 위 + 너무 뒤가 아닌 앵커 중,
 * 전방·위쪽 선호 지점(targetBias)에 가장 가까운 것
 */
export function selectTarget(g: Game): number | null {
  const p = g.body.pos
  const bx = p.x + TUNING.targetBias.x
  const by = p.y + TUNING.targetBias.y
  let best: number | null = null
  let bestScore = Infinity
  const list = g.field.anchors
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (!a) continue
    if (a.x < p.x - TUNING.targetBehindLimit) continue
    if (a.x > p.x + TUNING.reach) break // x 정렬 전제 — 이후는 전부 reach 밖
    if (a.y > p.y - TUNING.targetMinAbove) continue
    if (Math.hypot(a.x - p.x, a.y - p.y) > TUNING.reach) continue
    const score = Math.hypot(a.x - bx, a.y - by)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

/** 누름 — ready면 시작, playing이면 홀드 시작. dead에서의 재시작은 호출부가 createGame으로 */
export function press(g: Game): void {
  if (g.phase === 'ready') {
    g.phase = 'playing'
    g.holding = false
    return
  }
  if (g.phase === 'playing') g.holding = true
}

export function continuesLeft(g: Game): number {
  return Math.max(0, TUNING.maxContinues - g.continues)
}

/**
 * 이어하기 — 마지막으로 지나친 앵커 앞에서 정상 릴리스와 같은 궤적으로 다시 던져진다.
 * 로프를 쥔 채 살리면 버튼 탭의 pointerup이 곧바로 놓아 버려 궤적이 운에 좌우된다 → 자유 비행으로 시작.
 * 거리는 현재 위치 기준이라 살짝 줄어든 채 이어진다 (점수 규칙 그대로)
 */
export function continueRun(g: Game): boolean {
  if (g.phase !== 'dead' || continuesLeft(g) <= 0) return false
  const list = g.field.anchors
  let base = list[0]!
  for (const a of list) if (a.x <= g.body.pos.x && a.x >= base.x) base = a
  const sp = TUNING.continueSpawn
  g.body = createBody({ x: base.x + sp.dx, y: base.y + sp.dy }, { x: sp.vx, y: sp.vy })
  g.continues += 1
  g.holding = false
  g.phase = 'playing'
  g.cause = null
  g.threatX = g.body.pos.x - TUNING.threat.headStartPx
  g.distancePx = Math.max(0, g.body.pos.x - TUNING.startPos.x)
  return true
}

export function releaseInput(g: Game): void {
  g.holding = false
  if (g.phase !== 'playing') return
  const s = g.sonic
  if (g.body.anchor && s.chance) {
    // 찬스 앵커를 놓는 순간 이 계절의 찬스는 끝 (성공이든 실패든)
    s.usedStage[stageOfX(g.body.anchor.x)] = true
    s.chance = false
  }
  if (g.body.anchor && s.armed) {
    const hit = sonicInSweet(g)
    s.armed = false
    s.loops = 0
    s.spin = 0
    s.gaugeT = 0
    if (!hit) {
      // 타이밍 실패 — 일반 릴리스, 충전은 사라진다
      release(g.body)
      return
    }
    // 소닉 대시 시작 — 규칙 무시: 중력·잡기 없이 앞으로 직진
    release(g.body)
    s.dashing = true
    s.dashLeftPx = TUNING.sonic.dashMeters * TUNING.pxPerMeter
    s.uses += 1
    g.body.vel = { x: TUNING.sonic.dashSpeed, y: 0 }
    return
  }
  release(g.body)
}

/** 대시 진행 — 순항 고도로 떠오르며 직진, 거리를 다 쓰면 일반 비행으로 이어진다 */
function updateDash(g: Game, dt: number): void {
  const s = g.sonic
  const b = g.body
  const step = TUNING.sonic.dashSpeed * dt
  b.pos.x += step
  b.pos.y += (TUNING.sonic.cruiseY - b.pos.y) * Math.min(1, dt * 3)
  b.vel.x = TUNING.sonic.dashSpeed
  b.vel.y = 0
  s.dashLeftPx -= step
  if (s.dashLeftPx <= 0) {
    s.dashing = false
    b.vel = { ...TUNING.sonic.exitVel }
  }
}

export function update(g: Game, dt: number): void {
  if (g.phase !== 'playing') return
  g.timeSec += dt
  g.field.ensure(g.body.pos.x + TUNING.viewW * 2.5)
  if (g.sonic.dashing) {
    g.targetIdx = null
    updateDash(g, dt)
    g.distancePx = Math.max(0, g.body.pos.x - TUNING.startPos.x)
    updateThreat(g, dt)
    return
  }
  if (g.sonic.freezeT > 0) {
    // 소닉 찬스 알림 — 세상이 잠깐 멈춘다 (입력은 그대로 받는다)
    g.sonic.freezeT = Math.max(0, g.sonic.freezeT - dt)
    return
  }
  const hadAnchor = g.body.anchor
  const angBefore = swingAngle(g)
  g.targetIdx = g.body.anchor ? null : selectTarget(g)
  const target = g.targetIdx !== null ? g.field.anchors[g.targetIdx] : undefined
  if (g.holding && !g.body.anchor && target) {
    grab(g.body, target, TUNING.reach)
  }
  // 홀드 중 로프 감기 — 윈치가 몸을 앵커 쪽으로 당긴다 (외부에서 일을 넣는 연산이라 투영과 분리, D-006).
  // 이게 없으면 매 사이클 가라앉기만 하다 앵커선이 reach 밖으로 벗어난다 (계측으로 확인)
  if (g.body.anchor) {
    reelIn(g.body, TUNING.reelSpeed * dt, TUNING.minRope, TUNING.reelGain)
    pump(g.body, TUNING.swingPump * dt, TUNING.swingMaxSpeed)
  }
  stepBody(g.body, TUNING.gravity, dt, g.body.anchor ? TUNING.ropeDrag : TUNING.airDrag, TUNING.rigidRope)
  g.distancePx = Math.max(0, g.body.pos.x - TUNING.startPos.x)
  // 소닉 충전: 같은 앵커에서 누적 회전각으로 바퀴 수를 센다 (새로 잡으면 0부터)
  const s = g.sonic
  if (g.body.anchor) {
    if (!hadAnchor) {
      s.spin = 0
      s.loops = 0
      // 이 계절에서 k번째로 잡은 (서로 다른) 앵커면 찬스 — 알림 + 충전 허용 (D-015)
      const idx = g.field.anchors.findIndex((a) => a.x === g.body.anchor!.x && a.y === g.body.anchor!.y)
      const stage = stageOfX(g.body.anchor.x)
      if (idx !== s.lastGrabIdx) {
        s.grabsInStage[stage] = (s.grabsInStage[stage] ?? 0) + 1
        s.lastGrabIdx = idx
      }
      s.chance = !s.usedStage[stage] && s.grabsInStage[stage] === sonicChanceK(g, stage)
      if (s.chance) {
        s.freezeT = TUNING.sonic.freezeSec
        // 폭풍은 찬스에 놀라 물러난다 — 매달려 충전하는 동안(chance) 전진·잡힘 판정 모두 멈춘다 (BUILD 21)
        g.threatX = Math.min(g.threatX, g.body.anchor.x - TUNING.threat.chanceBackPx)
      }
    } else if (s.chance) {
      let d = swingAngle(g) - angBefore
      if (d > Math.PI) d -= Math.PI * 2
      if (d < -Math.PI) d += Math.PI * 2
      s.spin += d
      s.loops = Math.floor(Math.abs(s.spin) / (Math.PI * 2))
      if (!s.armed && s.loops >= TUNING.sonic.loopsToArm) {
        s.armed = true
        s.gaugeT = 0
      }
      if (s.armed) s.gaugeT += dt
    }
  } else if (!s.armed) {
    s.spin = 0
    s.loops = 0
  }
  if (g.body.pos.y > TUNING.killY) {
    g.phase = 'dead'
    g.cause = 'fall'
    g.holding = false
    release(g.body)
    return
  }
  // 찬스 잎에 매달린 동안은 폭풍이 멈춘다 — 3바퀴 충전이 고무줄 여유보다 길다
  if (!s.chance) updateThreat(g, dt)
}
