/**
 * 진자 + 자유 비행 물리. 순수 로직 — DOM·시간·난수 없음.
 *
 * 로프는 "당길 수만 있는" 구속이다: 앵커에서 ropeLen보다 멀어지려는 순간에만
 * 위치를 원둘레로 투영하고 속도의 바깥 방향 성분을 제거한다 (느슨하면 자유 낙하).
 * 감쇠 없음 — 스윙의 손맛은 순수 에너지 보존에서 온다.
 */
export interface Vec {
  x: number
  y: number
}

export interface Body {
  pos: Vec
  vel: Vec
  /** 로프가 걸린 앵커 — null이면 자유 비행 */
  anchor: Vec | null
  ropeLen: number
}

export function createBody(pos: Vec, vel: Vec): Body {
  return { pos: { ...pos }, vel: { ...vel }, anchor: null, ropeLen: 0 }
}

/** 한 스텝 적분 (semi-implicit Euler + 구속 투영). dt는 작게(≤1/60) 유지할 것 */
export function stepBody(b: Body, gravity: number, dt: number, drag = 0): void {
  const k = Math.exp(-drag * dt)
  b.vel.x *= k
  b.vel.y *= k
  b.vel.y += gravity * dt
  b.pos.x += b.vel.x * dt
  b.pos.y += b.vel.y * dt
  if (!b.anchor) return
  const dx = b.pos.x - b.anchor.x
  const dy = b.pos.y - b.anchor.y
  const d = Math.hypot(dx, dy)
  if (d <= b.ropeLen || d === 0) return
  const nx = dx / d
  const ny = dy / d
  b.pos.x = b.anchor.x + nx * b.ropeLen
  b.pos.y = b.anchor.y + ny * b.ropeLen
  // 바깥(로프를 늘리는) 방향 성분만 제거 — 로프는 밀지 못한다
  const vr = b.vel.x * nx + b.vel.y * ny
  if (vr > 0) {
    b.vel.x -= vr * nx
    b.vel.y -= vr * ny
  }
}

/** 로프 연결. 현재 거리가 그대로 로프 길이가 된다 (reach 밖이면 실패) */
export function grab(b: Body, anchor: Vec, reach: number): boolean {
  const d = Math.hypot(b.pos.x - anchor.x, b.pos.y - anchor.y)
  if (d > reach || d === 0) return false
  b.anchor = { ...anchor }
  b.ropeLen = d
  return true
}

/** 로프 해제 — 속도는 그대로 유지 (관성 발사) */
export function release(b: Body): void {
  b.anchor = null
  b.ropeLen = 0
}
