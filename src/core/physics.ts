/**
 * 진자 + 자유 비행 물리. 순수 로직 — DOM·시간·난수 없음.
 *
 * 로프는 "당길 수만 있는" 구속이다: 앵커에서 ropeLen보다 멀어지려는 순간에만
 * 위치를 원둘레로 투영하고 속도의 바깥 방향 성분을 제거한다 (느슨하면 자유 낙하).
 * 감쇠 없음 — 스윙의 손맛은 순수 에너지 보존에서 온다 (투영 시 속력 보존으로 수치 감쇠도 막는다).
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

/**
 * 한 스텝 적분 (semi-implicit Euler + 구속 투영). dt는 작게(≤1/60) 유지할 것.
 * rigid=true면 로프를 막대처럼 다룬다(밀 수도 있음): 90° 위에서도 느슨해지지 않아
 * 펌프로 천천히 차올라 한 바퀴를 넘길 수 있다 (D-006 BUILD 5 "충전기")
 */
export function stepBody(b: Body, gravity: number, dt: number, drag = 0, rigid = false): void {
  const k = Math.exp(-drag * dt)
  b.vel.x *= k
  b.vel.y *= k
  // 스텝 시작 에너지 기준값 (드래그 적용 후) — 구속 중엔 스텝 전체에 걸쳐 이 에너지를 보존한다
  const speed0sq = b.vel.x * b.vel.x + b.vel.y * b.vel.y
  const y0 = b.pos.y
  b.vel.y += gravity * dt
  b.pos.x += b.vel.x * dt
  b.pos.y += b.vel.y * dt
  if (!b.anchor) return
  const dx = b.pos.x - b.anchor.x
  const dy = b.pos.y - b.anchor.y
  const d = Math.hypot(dx, dy)
  if (d === 0 || (!rigid && d <= b.ropeLen)) return
  const nx = dx / d
  const ny = dy / d
  b.pos.x = b.anchor.x + nx * b.ropeLen
  b.pos.y = b.anchor.y + ny * b.ropeLen
  // 바깥(로프를 늘리는) 방향 성분만 제거 — 로프는 밀지 못한다 (강체면 안쪽 성분도 제거)
  const vr = b.vel.x * nx + b.vel.y * ny
  if (vr > 0 || rigid) {
    b.vel.x -= vr * nx
    b.vel.y -= vr * ny
  }
  // 에너지 보존: 성분 제거만 하면 적분기 오차(스텝당 -½g²dt²)가 상쇄되지 못하고 누적돼
  // 진자가 수 초 만에 멈춘다 (계측: 60°→2°/15s → "수직 정지" 상태, D-006).
  // 스텝 시작 에너지에서 높이 변화를 반영한 속력(v0² + 2gΔy)으로 맞춰 무감쇠 진자로 만든다
  // 배율은 [0.5, 2]로 클램프 — 정지점(접선 속도≈0)에서 잔여분을 부풀리면 부호가 못 뒤집혀
  // 90° 위에 붙어 기어오르는 인공물이 생긴다 (계측). 정상 스윙에서 배율은 1±0.01
  const target2 = speed0sq + 2 * gravity * (b.pos.y - y0)
  const vt = Math.hypot(b.vel.x, b.vel.y)
  if (vt > 1e-6 && target2 > 0) {
    const k2 = Math.min(2, Math.max(0.5, Math.sqrt(target2) / vt))
    b.vel.x *= k2
    b.vel.y *= k2
  }
}

/**
 * 로프 감기 — 로프를 amount만큼 줄이고 몸을 앵커 쪽으로 당긴다 (최소 minLen).
 * 접선 속력은 (r_old/r_new)^gain 배: gain 0 = 속력 유지(윈치가 상승분만 일함), 1 = 각운동량 보존
 */
export function reelIn(b: Body, amount: number, minLen: number, gain: number): void {
  if (!b.anchor) return
  const newLen = Math.max(minLen, b.ropeLen - amount)
  if (newLen >= b.ropeLen) return
  const dx = b.pos.x - b.anchor.x
  const dy = b.pos.y - b.anchor.y
  const d = Math.hypot(dx, dy)
  if (d > 1e-6) {
    b.pos.x = b.anchor.x + (dx / d) * newLen
    b.pos.y = b.anchor.y + (dy / d) * newLen
  }
  const k = Math.pow(b.ropeLen / newLen, gain)
  b.vel.x *= k
  b.vel.y *= k
  b.ropeLen = newLen
}

/** 스윙 펌프 — 진행 방향으로 속력을 dv만큼 더한다 (그네를 구르듯 오래 매달릴수록 붙는 힘) */
export function pump(b: Body, dv: number, maxSpeed: number): void {
  const sp = Math.hypot(b.vel.x, b.vel.y)
  if (sp < 1e-6 || dv <= 0 || sp >= maxSpeed) return
  const k = Math.min(maxSpeed, sp + dv) / sp
  b.vel.x *= k
  b.vel.y *= k
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
