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
import { createBody, grab, pump, reelIn, release, stepBody } from './physics'
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
  /** 현재 위치 기준 전진 거리 (px) — 뒤로 가면 줄어든다. 점수는 죽은 지점 기준 (과회전의 비용) */
  distancePx: number
  /** 이번 판에 쓴 이어하기 횟수 */
  continues: number
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
    continues: 0,
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
  g.distancePx = Math.max(0, g.body.pos.x - TUNING.startPos.x)
  return true
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
  // 홀드 중 로프 감기 — 윈치가 몸을 앵커 쪽으로 당긴다 (외부에서 일을 넣는 연산이라 투영과 분리, D-006).
  // 이게 없으면 매 사이클 가라앉기만 하다 앵커선이 reach 밖으로 벗어난다 (계측으로 확인)
  if (g.body.anchor) {
    reelIn(g.body, TUNING.reelSpeed * dt, TUNING.minRope, TUNING.reelGain)
    pump(g.body, TUNING.swingPump * dt, TUNING.swingMaxSpeed)
  }
  stepBody(g.body, TUNING.gravity, dt, g.body.anchor ? TUNING.ropeDrag : TUNING.airDrag, TUNING.rigidRope)
  g.distancePx = Math.max(0, g.body.pos.x - TUNING.startPos.x)
  if (g.body.pos.y > TUNING.killY) {
    g.phase = 'dead'
    g.holding = false
    release(g.body)
  }
}
