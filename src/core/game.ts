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
import type { Body } from './physics'
import { createBody, grab, release, stepBody } from './physics'
import { TUNING } from './tuning'

export type Phase = 'ready' | 'playing' | 'dead'

export interface Game {
  phase: Phase
  body: Body
  field: AnchorField
  holding: boolean
  /** 지금 홀드하면 잡힐 앵커 인덱스 — 없으면 null */
  targetIdx: number | null
  /** 도달 최대 x (px) — 점수의 원천 */
  distancePx: number
  /** 이번 런 경과 시간 (초) — 세션 길이 계측용 */
  timeSec: number
}

export function createGame(seed: number): Game {
  const field = new AnchorField(seed)
  field.ensure(TUNING.startPos.x + TUNING.viewW * 2)
  return {
    phase: 'ready',
    body: createBody(TUNING.startPos, TUNING.startVel),
    field,
    holding: false,
    targetIdx: null,
    distancePx: 0,
    timeSec: 0,
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

export function releaseInput(g: Game): void {
  g.holding = false
  if (g.phase === 'playing') release(g.body)
}

export function update(g: Game, dt: number): void {
  if (g.phase !== 'playing') return
  g.timeSec += dt
  g.field.ensure(g.body.pos.x + TUNING.viewW * 2.5)
  g.targetIdx = g.body.anchor ? null : selectTarget(g)
  const target = g.targetIdx !== null ? g.field.anchors[g.targetIdx] : undefined
  if (g.holding && !g.body.anchor && target) {
    grab(g.body, target, TUNING.reach)
  }
  // 홀드 중 로프 감기 — 각운동량 보존으로 속도가 붙어 고도를 회복한다.
  // 이게 없으면 매 사이클 가라앉기만 하다 앵커선이 reach 밖으로 벗어난다 (계측으로 확인)
  if (g.body.anchor) {
    g.body.ropeLen = Math.max(TUNING.minRope, g.body.ropeLen - TUNING.reelSpeed * dt)
  }
  stepBody(g.body, TUNING.gravity, dt, TUNING.airDrag)
  if (g.body.pos.x > g.distancePx) g.distancePx = g.body.pos.x
  if (g.body.pos.y > TUNING.killY) {
    g.phase = 'dead'
    g.holding = false
    release(g.body)
  }
}
