/**
 * 계절 나무 (design/trees, 2026-08-30) — 나무 하나 = 가지 뼈대(시드 결정론, 항상 그림) + 잎덩어리(가지 마디에 원,
 * 반지름·개수는 잎 밀도 0~1). 겨울 0은 앙상한 가지만, 여름 1은 원이 겹쳐 가지를 덮는다. 계절 경계에선 밀도와 색만 보간.
 * 카툰 문법 그대로: 잉크 패스(가지 굵기+외곽선·원 반지름+외곽선) → 밑동 → 가지 채움 → 원 채움(아래→위) → 반사광.
 * 뼈대는 높이 1 기준 정규 좌표로 한 번만 만들어 캐시한다 — 매 프레임 난수를 돌리지 않는다.
 */
import { Rng } from '../core/rng'

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  w: number
  d: number
}
interface Node {
  x: number
  y: number
  d: number
}
interface Skeleton {
  segs: Seg[]
  nodes: Node[]
  /** 줄기 밑동 반폭 (높이 1 기준) */
  w0: number
  depth: number
}

const cache = new Map<string, Skeleton>()

/** 가지 뼈대 — 원점(0,0)이 땅, y는 위가 음수, 높이 1. depth 4 = 중간 나무, 3 = 먼 나무(가볍게) */
export function skeleton(seed: number, depth: number): Skeleton {
  const key = `${seed}:${depth}`
  const hit = cache.get(key)
  if (hit) return hit
  const rng = new Rng((seed * 2654435761) >>> 0)
  const segs: Seg[] = []
  const nodes: Node[] = []
  const grow = (px: number, py: number, ang: number, len: number, w: number, d: number): void => {
    const ex = px + Math.cos(ang) * len
    const ey = py - Math.sin(ang) * len
    segs.push({ x1: px, y1: py, x2: ex, y2: ey, w, d })
    nodes.push({ x: ex, y: ey, d })
    if (d === 0) return
    const spread = rng.range(0.45, 0.8)
    for (const side of [1, -1]) {
      const a = ang + side * spread * rng.range(0.7, 1.15) + rng.range(-0.08, 0.08)
      grow(ex, ey, a, len * rng.range(0.6, 0.74), w * 0.6, d - 1)
    }
    if (rng.next() < 0.55) grow(ex, ey, ang + rng.range(-0.2, 0.2), len * rng.range(0.55, 0.7), w * 0.5, d - 1)
  }
  grow(0, 0, Math.PI / 2 + rng.range(-0.08, 0.08), 0.42, 0.085, depth)
  const sk = { segs, nodes, w0: 0.085, depth }
  cache.set(key, sk)
  return sk
}

/** 뼈대 경계 (높이 1 기준): 가장 높은 마디 + 최대 잎덩어리 반지름, 좌우 반폭 */
const boundsCache = new WeakMap<Skeleton, { top: number; halfW: number }>()
function boundsOf(sk: Skeleton): { top: number; halfW: number } {
  const hit = boundsCache.get(sk)
  if (hit) return hit
  let top = 0
  let halfW = 0
  for (const n of sk.nodes) {
    const r = LOBE_R[Math.min(3, n.d)]! // 밀도 1일 때 반지름 — 가장 큰 경우
    top = Math.max(top, -n.y + r)
    halfW = Math.max(halfW, Math.abs(n.x) + r)
  }
  const out = { top, halfW }
  boundsCache.set(sk, out)
  return out
}

/** 굵기 버킷 (높이 1 기준 0.004 단위로 양자화) — 뼈대마다 한 번 만들어 캐시 */
const bucketCache = new WeakMap<Skeleton, Array<[number, Seg[]]>>()
function bucketsOf(sk: Skeleton): Array<[number, Seg[]]> {
  const hit = bucketCache.get(sk)
  if (hit) return hit
  const m = new Map<number, Seg[]>()
  for (const s of sk.segs) {
    const q = Math.round(s.w / 0.004) * 0.004
    const list = m.get(q)
    if (list) list.push(s)
    else m.set(q, [s])
  }
  const out = [...m.entries()].sort((a, b) => b[0] - a[0])
  bucketCache.set(sk, out)
  return out
}

/** 마디 깊이별 원 반지름 (높이 대비) — 줄기 가까운 마디가 크다 */
const LOBE_R: Record<number, number> = { 3: 0.3, 2: 0.24, 1: 0.17, 0: 0.12 }

export interface TreeColors {
  ink: string
  trunk: string
  /** 잎덩어리 3톤: 아래 dark · 가운데 base · 위 hi */
  dark: string
  base: string
  hi: string
}

/**
 * 한 그루를 그린다. (cx, gy) = 밑동이 닿는 땅, height = 픽셀 높이, leaf = 잎 밀도 0~1.
 * far면 한 색 실루엣(색은 colors.base)·얇은 외곽선·반사광 없음
 */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  cx: number,
  gy: number,
  height: number,
  seed: number,
  leaf: number,
  colors: TreeColors,
  outline: number,
  far: boolean,
): void {
  const sk = skeleton(seed, far ? 3 : 4)
  const X = (x: number) => cx + x * height
  const Y = (y: number) => gy + y * height
  // 잎덩어리 후보 — 밀도가 낮아지면 **개수가 준다**. 예전엔 반지름만 줄이고 개수는 그대로여서, 가을 내내
  // "조금 작아진 잎"이다가 0.2 밑에서 통째로 사라져 "겨울 되자마자 훅" 없어졌다 (사용자, BUILD 31).
  // 마디마다 시드로 고정된 문턱을 두고 밀도가 그 아래로 내려가면 그 잎이 진다 — 가지가 하나씩 드러난다.
  // 안쪽(굵은) 마디의 문턱을 낮게 잡아 바깥 잔가지 잎부터 떨어지게 한다
  const lobes: Array<{ x: number; y: number; r: number }> = []
  if (leaf > 0.02) {
    const scale = 0.62 + 0.38 * leaf // 남은 덩어리는 크게 — 개수로 표현하므로 반지름은 덜 줄인다
    const lr = new Rng((seed ^ 0x9e3779b9) >>> 0)
    sk.nodes.forEach((n) => {
      if (n.d === sk.depth) return // 줄기 꼭대기 마디는 위 마디들이 덮는다
      const inner = 1 - Math.min(3, n.d) / 3 // 0(잔가지) ~ 1(굵은 가지)
      const th = lr.next() * (0.95 - 0.45 * inner)
      if (leaf <= th) return
      const base = LOBE_R[Math.min(3, n.d)]!
      lobes.push({ x: X(n.x), y: Y(n.y), r: base * height * scale })
    })
  }
  // 가지 선은 굵기별로 묶어 한 패스씩 — 선마다 stroke 하면 나무 하나에 100번이 넘는다
  const strokeSegs = (extra: number): void => {
    for (const [wq, list] of bucketsOf(sk)) {
      ctx.lineWidth = wq * height + extra
      ctx.beginPath()
      for (const s of list) {
        ctx.moveTo(X(s.x1), Y(s.y1))
        ctx.lineTo(X(s.x2), Y(s.y2))
      }
      ctx.stroke()
    }
  }
  // 잉크 패스
  ctx.strokeStyle = colors.ink
  ctx.lineCap = 'round'
  strokeSegs(outline * 2)
  if (lobes.length) {
    ctx.fillStyle = colors.ink
    ctx.beginPath()
    for (const l of lobes) {
      ctx.moveTo(l.x + l.r + outline, l.y)
      ctx.arc(l.x, l.y, l.r + outline, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  // 밑동 — 땅으로 벌어진다
  const w0 = sk.w0 * height
  ctx.beginPath()
  ctx.moveTo(cx - w0 * 1.6, gy + 4)
  ctx.quadraticCurveTo(cx - w0 * 0.6, gy - height * 0.05, cx - w0 * 0.5, gy - height * 0.12)
  ctx.lineTo(cx + w0 * 0.5, gy - height * 0.12)
  ctx.quadraticCurveTo(cx + w0 * 0.6, gy - height * 0.05, cx + w0 * 1.6, gy + 4)
  ctx.closePath()
  ctx.fillStyle = far ? colors.base : colors.trunk
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = outline
  ctx.stroke()
  // 가지 채움
  ctx.strokeStyle = far ? colors.base : colors.trunk
  strokeSegs(0)
  // 원 채움 — 아래쪽 마디는 진하게, 위쪽은 밝게 (아래부터 그려 위가 덮는다)
  if (lobes.length) {
    let top = Infinity
    let bot = -Infinity
    for (const l of lobes) {
      if (l.y < top) top = l.y
      if (l.y > bot) bot = l.y
    }
    const span = Math.max(1, bot - top)
    lobes.sort((a, b) => b.y - a.y)
    for (const l of lobes) {
      const t = (l.y - top) / span
      ctx.fillStyle = far ? colors.base : t > 0.66 ? colors.dark : t > 0.28 ? colors.base : colors.hi
      ctx.beginPath()
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2)
      ctx.fill()
    }
    if (!far && leaf >= 0.6) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      for (const l of lobes) {
        if ((l.y - top) / span < 0.28 && l.r > 24 * (height / 250)) {
          ctx.beginPath()
          ctx.arc(l.x - l.r * 0.28, l.y - l.r * 0.3, l.r * 0.42, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }
}

/**
 * 스프라이트 캐시 — 나무는 계절(색·잎 밀도)이 바뀔 때만 달라지므로 오프스크린 캔버스에 한 번 그려 두고 찍는다.
 * 가지 100여 개를 매 프레임 stroke 하면 맥에서도 5ms/프레임(여름·가을)이라 폰에선 위험하다.
 * 키에 색이 들어가므로 계절 경계 보간 중엔 호출부가 blend를 양자화해 재생성 횟수를 줄인다
 */
const sprites = new Map<string, HTMLCanvasElement>()
const SPRITE_CAP = 40

export function drawTreeSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  gy: number,
  height: number,
  seed: number,
  leaf: number,
  colors: TreeColors,
  outline: number,
  far: boolean,
): void {
  const scale = ctx.getTransform().a || 1
  // 스프라이트 크기는 뼈대의 실제 경계에서 — 1.2×높이로 잡았더니 가지+잎덩어리 윗부분이 잘렸다 (BUILD 26)
  const b = boundsOf(skeleton(seed, far ? 3 : 4))
  const W = Math.ceil(height * (b.halfW + 0.05) * 2)
  const H = Math.ceil(height * (b.top + 0.05) + 8)
  const key = `${seed}|${Math.round(height)}|${leaf.toFixed(2)}|${colors.trunk}|${colors.dark}|${colors.base}|${colors.hi}|${outline.toFixed(1)}|${far ? 1 : 0}|${scale}`
  let sp = sprites.get(key)
  if (!sp) {
    sp = document.createElement('canvas')
    sp.width = Math.ceil(W * scale)
    sp.height = Math.ceil(H * scale)
    const c = sp.getContext('2d')!
    c.setTransform(scale, 0, 0, scale, 0, 0)
    drawTree(c, W / 2, H - 8, height, seed, leaf, colors, outline, far)
    if (sprites.size >= SPRITE_CAP) sprites.delete(sprites.keys().next().value!)
    sprites.set(key, sp)
  }
  ctx.drawImage(sp, cx - W / 2, gy - (H - 8), W, H)
}
