/**
 * Canvas 2D 렌더 — 밝은 카툰 정글 (D-008). `design/` 설계도를 이미지 없이 도형·그라데이션으로 재현한다.
 *
 * 좌표계: 월드 x는 카메라로 스크롤, y는 설계 기준 viewH=749를 화면에 스케일(줌 포함, 배율 `s`).
 * 배경 장식·HUD·카드는 줌과 무관하게 화면 크기 배율 `u`로 그린다.
 * 문법: 굵은 외곽선(#1f3a2a)·평면 색·둥근 형태·흰 카드 + 오프셋 그림자. 웹폰트 없음.
 */
import type { Game } from '../core/game'
import { meters } from '../core/game'
import { TUNING } from '../core/tuning'
import { BUILD } from '../version'

export interface Camera {
  x: number
  /** 1 = 기본. 작을수록 줌아웃 (화면 세로 중앙 기준) */
  zoom: number
}

const COL = {
  ink: '#1f3a2a',
  inkSoft: '#4f7f62',
  skyTop: '#bfe8f5',
  skyBottom: '#eaf7d6',
  sun: '#ffe680',
  sunGlow: '#fff3b0',
  cloud: '#ffffff',
  forestFar: '#a9dc8e',
  forestMid: '#5fbf6e',
  forestNear: '#2f8f4e',
  leaf: '#1f6b3c',
  vine: '#2f8f4e',
  anchor: '#a0662f',
  rope: '#c98c4b',
  target: '#ffcc33',
  player: '#ff7f3f',
  playerHi: '#ffd7b3',
  card: '#ffffff',
  cardTint: '#eaf7d6',
  scrim: 'rgba(31,58,42,0.35)',
}
const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

/** 사망 연출 상태 — 추락 지점 파편·충격파·흔들림·플래시, 이후 결과 카드 */
interface DeathFx {
  t0: number
  x: number
  y: number
  parts: Particle[]
  lastNow: number
}

const easeOutBack = (p: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** 배경 구름 배치 — 월드 x 주기 CLOUD_PERIOD마다 반복 (설계도 좌표) */
const CLOUD_PERIOD = 620
const CLOUDS = [
  { x: 40, y: 160, k: 1 },
  { x: 350, y: 214, k: 0.8 },
]

export class Renderer {
  private trail: Array<{ x: number; y: number }> = []
  private death: DeathFx | null = null

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  resetTrail(): void {
    this.trail.length = 0
  }

  draw(g: Game, cam: Camera, best: number, w: number, h: number, topInset: number, preset: string | null = null): void {
    const ctx = this.ctx
    const u = h / TUNING.viewH // 화면 배율 (줌 무관) — 장식·HUD·카드
    const s = u * cam.zoom // 월드 배율 (줌 포함)
    const now = performance.now()
    if (g.phase === 'dead' && !this.death) this.death = this.startDeath(g, now)
    if (g.phase !== 'dead') this.death = null
    const dead = this.death
    const deadT = dead ? now - dead.t0 : 0

    ctx.save()
    if (dead && deadT < 350) {
      const k = (1 - deadT / 350) * 9 * u
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k)
    }
    this.drawBackground(cam, w, h, u, topInset)

    const toX = (wx: number) => (wx - cam.x) * s
    const toY = (wy: number) => h / 2 + (wy - TUNING.viewH / 2) * s // 줌은 화면 세로 중앙 기준

    // 시작 화면: 무대(배경)만 두고 카드로 간다 — 월드 덩굴이 제목을 가로지르면 어수선하다
    if (g.phase === 'ready') {
      ctx.restore()
      this.drawForeground(cam, w, h, u)
      this.drawHud(g, best, w, h, u, topInset, preset)
      this.drawReadyScreen(w, h, u, now)
      return
    }

    // 덩굴 + 앵커 — 지금 로프가 닿는 것만 진하게, 사거리 밖은 흐리게
    const list = g.field.anchors
    const p = g.body.pos
    const target = g.targetIdx !== null ? list[g.targetIdx] : undefined
    for (const a of list) {
      const sx = toX(a.x)
      if (sx < -40 || sx > w + 40) continue
      const reachable =
        a.x >= p.x - TUNING.targetBehindLimit &&
        a.y <= p.y - TUNING.targetMinAbove &&
        Math.hypot(a.x - p.x, a.y - p.y) <= TUNING.reach
      this.drawVine(sx, toY(a.y), s, a.x)
      ctx.globalAlpha = reachable || a === target ? 1 : 0.5
      this.outlinedCircle(sx, toY(a.y), 8 * s, COL.anchor, 2.5 * s)
      ctx.globalAlpha = 1
    }
    // 타깃 링 — "지금 누르면 여기에 걸린다"
    if (target) {
      ctx.beginPath()
      ctx.arc(toX(target.x), toY(target.y), 17 * s, 0, Math.PI * 2)
      ctx.strokeStyle = COL.target
      ctx.lineWidth = 4 * s
      ctx.stroke()
      ctx.strokeStyle = COL.ink
      ctx.lineWidth = 1.2 * s
      ctx.stroke()
    }

    // 궤적
    if (g.phase === 'playing') {
      this.trail.push({ x: g.body.pos.x, y: g.body.pos.y })
      if (this.trail.length > 16) this.trail.shift()
    }
    if (dead) this.trail.length = 0
    this.trail.forEach((t, i) => {
      const q = (i + 1) / this.trail.length
      ctx.globalAlpha = 0.15 + 0.55 * q
      this.outlinedCircle(toX(t.x), toY(t.y), (2.5 + 3.5 * q) * s, COL.player, 1.2 * s)
    })
    ctx.globalAlpha = 1

    // 로프
    if (g.body.anchor) {
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(toX(g.body.anchor.x), toY(g.body.anchor.y))
      ctx.lineTo(toX(g.body.pos.x), toY(g.body.pos.y))
      ctx.strokeStyle = COL.rope
      ctx.lineWidth = 4 * s
      ctx.stroke()
      ctx.strokeStyle = 'rgba(31,58,42,0.5)'
      ctx.lineWidth = 1 * s
      ctx.stroke()
    }

    // 플레이어 — 죽으면 파편으로 흩어진다
    if (!dead) {
      this.drawPlayer(toX(g.body.pos.x), toY(g.body.pos.y), 15 * s, s, g.body.vel.x, g.holding)
    } else {
      this.drawDeathWorld(dead, now, toX, toY, s)
    }
    ctx.restore()

    this.drawForeground(cam, w, h, u)
    this.drawHud(g, best, w, h, u, topInset, preset)
    if (dead) this.drawDeathCard(g, best, w, h, u, deadT)
  }

  // ── 배경 ─────────────────────────────────────────────────────────

  /** 하늘·태양·구름·3겹 숲 — 화면 공간, 카메라 x로 패럴랙스 */
  private drawBackground(cam: Camera, w: number, h: number, u: number, topInset: number): void {
    const ctx = this.ctx
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, COL.skyTop)
    grad.addColorStop(1, COL.skyBottom)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // 태양 (고정)
    const sunX = w - 75 * u
    const sunY = topInset + 96 * u
    ctx.beginPath()
    ctx.arc(sunX, sunY, 54 * u, 0, Math.PI * 2)
    ctx.fillStyle = COL.sunGlow
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.globalAlpha = 1
    this.outlinedCircle(sunX, sunY, 40 * u, COL.sun, 3 * u)

    // 구름 (패럴랙스 0.15, 주기 반복)
    const period = CLOUD_PERIOD * u
    const off = ((-cam.x * 0.15 * u) % period + period) % period
    for (let k = -1; k * period + off < w + period; k++) {
      for (const c of CLOUDS) {
        this.drawCloud(k * period + off + c.x * u, topInset * 0.4 + c.y * u, c.k * u)
      }
    }

    // 숲 3겹 — 화면 아래에서 솟는 물결. 멀수록 연하고 느리다
    this.drawForestBand(cam, w, h, u, 0.694, 0.3, 22, 95, COL.forestFar)
    this.drawForestBand(cam, w, h, u, 0.775, 0.5, 20, 80, COL.forestMid)
    this.drawForestBand(cam, w, h, u, 0.855, 0.75, 18, 70, COL.forestNear)
  }

  private drawCloud(x: number, y: number, k: number): void {
    const ctx = this.ctx
    // 세 원의 합집합 — 굵은 외곽선을 먼저 그리고 흰 몸통으로 안쪽 선을 덮는다
    const lobes = [
      { dx: 22, dy: 6, r: 22 },
      { dx: 56, dy: -6, r: 28 },
      { dx: 92, dy: 8, r: 20 },
    ]
    const pass = (fill: string, grow: number) => {
      ctx.fillStyle = fill
      for (const l of lobes) {
        ctx.beginPath()
        ctx.arc(x + l.dx * k, y + l.dy * k, l.r * k + grow, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.beginPath()
      this.roundRect(x + 2 * k - grow, y + 6 * k, 110 * k + grow * 2, 22 * k + grow, 10 * k)
      ctx.fill()
    }
    pass(COL.ink, 3 * k)
    pass(COL.cloud, 0)
  }

  private drawForestBand(
    cam: Camera,
    w: number,
    h: number,
    u: number,
    baseFrac: number,
    parallax: number,
    amp: number,
    wave: number,
    fill: string,
  ): void {
    const ctx = this.ctx
    const base = h * baseFrac
    const phase = cam.x * parallax * u
    ctx.beginPath()
    ctx.moveTo(-10, h + 10)
    for (let x = -10; x <= w + 10; x += 8) {
      const t = (x + phase) / (wave * u)
      const y = base + Math.sin(t) * amp * u + Math.sin(t * 2.3 + 1.2) * amp * 0.4 * u
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w + 10, h + 10)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 3 * u
    ctx.stroke()
  }

  /** 앞쪽 잎 — 화면 아래 모서리, 플레이어보다 앞에 그려 깊이를 만든다 */
  private drawForeground(cam: Camera, w: number, h: number, u: number): void {
    const ctx = this.ctx
    const period = 520 * u
    const off = ((-cam.x * 1.15 * u) % period + period) % period
    ctx.fillStyle = COL.leaf
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 3 * u
    ctx.lineJoin = 'round'
    for (let k = -1; k * period + off < w + period; k++) {
      const x0 = k * period + off
      for (const leaf of [
        { x: 30, rx: 48, ry: 30, rot: -0.5 },
        { x: 250, rx: 40, ry: 24, rot: 0.6 },
        { x: 400, rx: 44, ry: 26, rot: -0.3 },
      ]) {
        ctx.beginPath()
        ctx.ellipse(x0 + leaf.x * u, h + 6 * u, leaf.rx * u, leaf.ry * u, leaf.rot, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  }

  /** 앵커까지 화면 위에서 내려오는 덩굴 + 잎 한 장 */
  private drawVine(sx: number, ay: number, s: number, seed: number): void {
    const ctx = this.ctx
    const bend = (Math.sin(seed * 0.37) * 10 + 8) * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx + bend * 0.3, -10)
    ctx.bezierCurveTo(sx + bend, ay * 0.35, sx - bend, ay * 0.7, sx, ay - 8 * s)
    ctx.strokeStyle = COL.vine
    ctx.lineWidth = 4 * s
    ctx.stroke()
    const ly = ay * 0.45
    ctx.beginPath()
    ctx.ellipse(sx + bend * 0.6 + 6 * s, ly, 10 * s, 5 * s, -0.5, 0, Math.PI * 2)
    ctx.fillStyle = COL.forestMid
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 2 * s
    ctx.stroke()
  }

  // ── 플레이어·연출 ─────────────────────────────────────────────────

  private drawPlayer(x: number, y: number, r: number, s: number, velX: number, holding: boolean): void {
    const ctx = this.ctx
    this.outlinedCircle(x, y, r, COL.player, 3 * s)
    ctx.beginPath()
    ctx.arc(x - r * 0.4, y - r * 0.4, r * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = COL.playerHi
    ctx.fill()
    // 눈은 진행 방향으로 살짝 쏠린다. 홀드 중엔 힘주는 표정(눈 가늘게)
    const look = Math.max(-1, Math.min(1, velX / 600)) * r * 0.12
    ctx.fillStyle = COL.ink
    for (const dx of [-0.28, 0.32]) {
      ctx.beginPath()
      if (holding) ctx.ellipse(x + dx * r + look, y + r * 0.12, r * 0.13, r * 0.08, 0, 0, Math.PI * 2)
      else ctx.arc(x + dx * r + look, y + r * 0.12, r * 0.13, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(x - r * 0.2 + look, y + r * 0.45)
    ctx.quadraticCurveTo(x + look, y + r * 0.65, x + r * 0.25 + look, y + r * 0.45)
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = Math.max(1, r * 0.12)
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  private startDeath(g: Game, now: number): DeathFx {
    const parts: Particle[] = []
    for (let i = 0; i < 24; i++) {
      const a = Math.PI + Math.random() * Math.PI // 위쪽 반원으로 튄다
      const sp = 220 + Math.random() * 520
      parts.push({
        x: g.body.pos.x,
        y: Math.min(g.body.pos.y, TUNING.killY),
        vx: Math.cos(a) * sp + g.body.vel.x * 0.25,
        vy: Math.sin(a) * sp,
        r: 3 + Math.random() * 5,
      })
    }
    return { t0: now, x: g.body.pos.x, y: Math.min(g.body.pos.y, TUNING.killY), parts, lastNow: now }
  }

  /** 추락 지점의 충격파 + 파편 (월드 좌표) */
  private drawDeathWorld(
    d: DeathFx,
    now: number,
    toX: (x: number) => number,
    toY: (y: number) => number,
    s: number,
  ): void {
    const ctx = this.ctx
    const dt = Math.min(0.05, (now - d.lastNow) / 1000)
    d.lastNow = now
    const t = (now - d.t0) / 1000
    for (const p of d.parts) {
      p.vy += TUNING.gravity * 0.9 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    if (t < 0.6) {
      const q = t / 0.6
      ctx.beginPath()
      ctx.arc(toX(d.x), toY(d.y), (20 + 160 * q) * s, 0, Math.PI * 2)
      ctx.strokeStyle = COL.player
      ctx.globalAlpha = 0.8 * (1 - q)
      ctx.lineWidth = (7 - 5 * q) * s
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    const fade = Math.max(0, 1 - t / 1.4)
    ctx.globalAlpha = fade
    for (const p of d.parts) {
      this.outlinedCircle(toX(p.x), toY(p.y), p.r * s * (0.4 + 0.6 * fade), COL.player, 1.5 * s)
    }
    ctx.globalAlpha = 1
  }

  /** 결과 카드 — 플래시 → 스크림 → "끝" 별 배지 → 점수 카운트업 → 신기록/최고 → 재시작 */
  private drawDeathCard(g: Game, best: number, w: number, h: number, u: number, deadT: number): void {
    const ctx = this.ctx
    if (deadT < 160) {
      ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - deadT / 160)})`
      ctx.fillRect(0, 0, w, h)
    }
    const scrim = clamp01((deadT - 250) / 350)
    if (scrim <= 0) return
    ctx.fillStyle = COL.scrim
    ctx.globalAlpha = scrim
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1

    const cx = w / 2
    const cy = h / 2
    const cardW = 300 * u
    const cardH = 150 * u
    const cardY = cy - 40 * u

    // "끝" 별 배지 — 튀어나오며 자리 잡는다
    const tp = clamp01((deadT - 300) / 380)
    if (tp > 0) {
      ctx.save()
      ctx.translate(cx, cardY - 56 * u)
      const sc = 0.5 + 0.5 * easeOutBack(tp)
      ctx.scale(sc, sc)
      ctx.rotate(-6 * (Math.PI / 180))
      ctx.globalAlpha = Math.min(1, tp * 2)
      this.starburst(0, 0, 100 * u, 62 * u, 12)
      ctx.fillStyle = COL.target
      ctx.fill()
      ctx.strokeStyle = COL.ink
      ctx.lineWidth = 3 * u
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.fillStyle = COL.ink
      ctx.font = `900 ${Math.round(44 * u)}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('끝', 0, 2 * u)
      ctx.restore()
    }

    // 카드
    const cp = clamp01((deadT - 450) / 300)
    if (cp <= 0) return
    ctx.save()
    ctx.globalAlpha = cp
    ctx.translate(0, (1 - cp) * 20 * u)
    this.card(cx - cardW / 2, cardY, cardW, cardH, 20 * u, 4 * u)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = COL.inkSoft
    ctx.font = `800 ${Math.round(14 * u)}px ${FONT}`
    ctx.fillText('이번 기록', cx, cardY + 32 * u)
    const m = meters(g)
    const countP = clamp01((deadT - 550) / 650)
    const shown = Math.round(m * (1 - Math.pow(1 - countP, 3)))
    ctx.fillStyle = COL.ink
    ctx.font = `900 ${Math.round(56 * u)}px ${FONT}`
    ctx.fillText(`${shown}m`, cx, cardY + 88 * u)
    const isBest = m > best
    const bp = clamp01((deadT - 1250) / 300)
    if (bp > 0) {
      ctx.save()
      ctx.translate(cx, cardY + 122 * u)
      const pulse = isBest ? 1 + 0.05 * Math.sin(deadT / 120) : 1
      ctx.scale(easeOutBack(bp) * pulse, easeOutBack(bp) * pulse)
      this.pill(isBest ? '신기록!' : `최고 ${best}m`, 0, 0, `800 ${Math.round(14 * u)}px ${FONT}`, COL.target, COL.ink, 12 * u, 0, u, true)
      ctx.restore()
    }
    ctx.restore()

    // 재시작 힌트
    const hp = clamp01((deadT - 1500) / 300)
    if (hp > 0) {
      ctx.save()
      ctx.globalAlpha = hp
      ctx.translate(cx, cardY + cardH + 46 * u)
      const pulse = 1 + 0.03 * Math.sin(deadT / 260)
      ctx.scale(pulse, pulse)
      this.pill('탭해서 다시', 0, 0, `900 ${Math.round(17 * u)}px ${FONT}`, COL.player, '#ffffff', 34 * u, 4 * u, u, false, 46 * u)
      ctx.restore()
    }
  }

  // ── HUD·시작 화면 ─────────────────────────────────────────────────

  private drawHud(g: Game, best: number, w: number, h: number, u: number, topInset: number, preset: string | null): void {
    const ctx = this.ctx
    const top = topInset + 14 * u
    ctx.textBaseline = 'alphabetic'
    // 거리 칩 (왼쪽 위)
    ctx.font = `900 ${Math.round(26 * u)}px ${FONT}`
    const dist = `${meters(g)}m`
    const dw = ctx.measureText(dist).width + 30 * u
    const dh = 44 * u
    this.chip(14 * u, top, dw, dh, COL.card, 3 * u)
    ctx.fillStyle = COL.ink
    ctx.textAlign = 'left'
    ctx.fillText(dist, 14 * u + 15 * u, top + dh / 2 + 9 * u)
    // 최고 기록 칩 (오른쪽 위) — 별 + 숫자
    ctx.font = `800 ${Math.round(14 * u)}px ${FONT}`
    const bestText = `${best}m`
    const bw = ctx.measureText(bestText).width + 44 * u
    const bh = 32 * u
    const bx = w - 14 * u - bw
    const by = top + 6 * u
    this.chip(bx, by, bw, bh, COL.target, 3 * u)
    this.star(bx + 18 * u, by + bh / 2, 7 * u)
    ctx.fillStyle = COL.ink
    ctx.textAlign = 'left'
    ctx.fillText(bestText, bx + 30 * u, by + bh / 2 + 5 * u)
    // 빌드 표식
    ctx.font = `700 ${Math.round(12 * u)}px ${FONT}`
    ctx.textAlign = 'right'
    ctx.globalAlpha = 0.5
    ctx.fillText(`B${BUILD}${preset ? '·' + preset : ''}`, w - 10 * u, h - 8 * u)
    ctx.globalAlpha = 1
  }

  /** 시작 화면: 제목 + 사용법 루프 데모 카드 + CTA (스크림 없음 — 무대가 그대로 보인다) */
  private drawReadyScreen(w: number, h: number, u: number, now: number): void {
    const ctx = this.ctx
    const cx = w / 2
    const cardW = 320 * u
    const cardH = 200 * u
    const cardY = h * 0.5 - cardH / 2 - 10 * u

    // 제목 — 주황 글자에 굵은 외곽선
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `900 ${Math.round(54 * u)}px ${FONT}`
    ctx.lineJoin = 'round'
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 7 * u
    ctx.strokeText('정글훅', cx, cardY - 52 * u)
    ctx.fillStyle = COL.player
    ctx.fillText('정글훅', cx, cardY - 52 * u)
    this.pill('얼마나 멀리 갈 수 있을까?', cx, cardY - 24 * u, `800 ${Math.round(14 * u)}px ${FONT}`, COL.card, COL.ink, 12 * u, 0, u, true)

    // 데모 카드
    const cardX = cx - cardW / 2
    this.card(cardX, cardY, cardW, cardH, 20 * u, 4 * u)
    ctx.save()
    this.roundRect(cardX + 2 * u, cardY + 2 * u, cardW - 4 * u, cardH - 4 * u, 18 * u)
    ctx.clip()
    ctx.fillStyle = COL.cardTint
    ctx.fillRect(cardX, cardY, cardW, cardH)
    ctx.beginPath()
    ctx.moveTo(cardX, cardY + cardH)
    for (let x = 0; x <= cardW; x += 8 * u) {
      ctx.lineTo(cardX + x, cardY + cardH * 0.78 + Math.sin(x / (60 * u)) * 8 * u)
    }
    ctx.lineTo(cardX + cardW, cardY + cardH)
    ctx.closePath()
    ctx.fillStyle = COL.forestFar
    ctx.fill()
    this.drawStartDemo({ x: cardX, y: cardY, w: cardW, h: cardH }, u, now)
    ctx.restore()

    // CTA
    ctx.save()
    ctx.translate(cx, cardY + cardH + 48 * u)
    const pulse = 1 + 0.03 * Math.sin(now / 260)
    ctx.scale(pulse, pulse)
    this.pill('탭해서 시작', 0, 0, `900 ${Math.round(17 * u)}px ${FONT}`, COL.player, '#ffffff', 34 * u, 4 * u, u, false, 46 * u)
    ctx.restore()
  }

  /**
   * 데모 루프(4.6s): ① 누르면 공이 로프에 매달려 앞으로 흔들리고 ② 떼면 포물선으로 날아
   * ③ 다시 누르면 다음 앵커에 매달려 스윙한다. 끝에 짧게 페이드해 반복이 자연스럽게 이어진다
   */
  private drawStartDemo(d: { x: number; y: number; w: number; h: number }, u: number, now: number): void {
    const ctx = this.ctx
    const LOOP = 4600
    const t = now % LOOP
    const HOLD_END = 1400
    const FLY_END = 2400
    const HOLD2_END = 4000
    const rad = (deg: number) => deg * (Math.PI / 180)

    const anchor = { x: d.x + d.w * 0.22, y: d.y + 30 * u }
    const anchor2 = { x: d.x + d.w * 0.78, y: d.y + 36 * u }
    const rope = 64 * u
    const hang = (a: { x: number; y: number }, deg: number) => ({ x: a.x + Math.sin(rad(deg)) * rope, y: a.y + Math.cos(rad(deg)) * rope })

    const SWING0 = -55
    const REL = 35
    const relPhase = Math.acos(-REL / -SWING0)
    const swingAngle = (p: number) => SWING0 * Math.cos(relPhase * p)
    const GRAB = -55
    const flyStart = hang(anchor, REL)
    const flyEnd = hang(anchor2, GRAB)
    const tangent = { x: Math.cos(rad(REL)), y: -Math.sin(rad(REL)) }
    const ctrl = { x: flyStart.x + tangent.x * 80 * u, y: flyStart.y + tangent.y * 80 * u }
    const arc = (q: number) => {
      const v = 1 - q
      return {
        x: v * v * flyStart.x + 2 * v * q * ctrl.x + q * q * flyEnd.x,
        y: v * v * flyStart.y + 2 * v * q * ctrl.y + q * q * flyEnd.y,
      }
    }

    let ball: { x: number; y: number }
    let ropeTo: { x: number; y: number } | null = null
    let ropeDraw = 1
    const trail: Array<{ x: number; y: number }> = []
    let stage: 0 | 1 | 2
    let velX = 1
    if (t < HOLD_END) {
      stage = 0
      ball = hang(anchor, swingAngle(t / HOLD_END))
      ropeTo = anchor
    } else if (t < FLY_END) {
      stage = 1
      const p = (t - HOLD_END) / (FLY_END - HOLD_END)
      ball = arc(p)
      for (let i = 1; i <= 6; i++) {
        const q = p - i * 0.06
        if (q > 0) trail.push(arc(q))
      }
    } else {
      stage = 2
      const since = t - FLY_END
      const p = Math.min(1, since / (HOLD2_END - FLY_END))
      ball = hang(anchor2, GRAB + (-GRAB + 45) * (1 - Math.pow(1 - p, 2.2)))
      ropeTo = anchor2
      ropeDraw = Math.min(1, since / 90)
    }
    const fade = t > HOLD2_END ? 1 - (t - HOLD2_END) / (LOOP - HOLD2_END) : 1
    ctx.save()
    ctx.globalAlpha = Math.max(0, fade)

    // 덩굴 + 앵커
    for (const a of [anchor, anchor2]) {
      ctx.beginPath()
      ctx.moveTo(a.x, d.y - 4 * u)
      ctx.quadraticCurveTo(a.x + 5 * u, (d.y + a.y) / 2, a.x, a.y - 7 * u)
      ctx.strokeStyle = COL.vine
      ctx.lineWidth = 3.5 * u
      ctx.lineCap = 'round'
      ctx.stroke()
      this.outlinedCircle(a.x, a.y, 7 * u, COL.anchor, 2.5 * u)
    }
    const grabFlash = stage === 2 ? Math.max(0, 1 - (t - FLY_END) / 220) : 0
    if (stage === 1 || grabFlash > 0) {
      ctx.beginPath()
      ctx.arc(anchor2.x, anchor2.y, (14 + 10 * (1 - (stage === 1 ? 1 : grabFlash))) * u, 0, Math.PI * 2)
      ctx.strokeStyle = COL.target
      ctx.globalAlpha = Math.max(0, fade) * (stage === 1 ? 1 : grabFlash)
      ctx.lineWidth = 3.5 * u
      ctx.stroke()
      ctx.globalAlpha = Math.max(0, fade)
    }
    if (ropeTo) {
      ctx.beginPath()
      ctx.moveTo(ropeTo.x, ropeTo.y)
      ctx.lineTo(ropeTo.x + (ball.x - ropeTo.x) * ropeDraw, ropeTo.y + (ball.y - ropeTo.y) * ropeDraw)
      ctx.strokeStyle = COL.rope
      ctx.lineWidth = 3.5 * u
      ctx.stroke()
    }
    trail.forEach((q, i) => {
      ctx.globalAlpha = Math.max(0, fade) * (0.6 - i * 0.08)
      this.outlinedCircle(q.x, q.y, 3.5 * u, COL.player, 1 * u)
    })
    ctx.globalAlpha = Math.max(0, fade)
    this.drawPlayer(ball.x, ball.y, 13 * u, u, velX * 300, stage !== 1)

    // 손가락: 누르는 동안 아래로 내려가고 터치 링이 퍼진다
    const pressed = stage !== 1
    const fx = d.x + d.w * 0.5
    const fy = d.y + d.h - 24 * u + (pressed ? 5 * u : 0)
    if (pressed) {
      const rp = (t % 700) / 700
      ctx.beginPath()
      ctx.arc(fx, fy - 8 * u, (10 + 16 * rp) * u, 0, Math.PI * 2)
      ctx.strokeStyle = COL.target
      ctx.globalAlpha = Math.max(0, fade) * 0.7 * (1 - rp)
      ctx.lineWidth = 2.5 * u
      ctx.stroke()
      ctx.globalAlpha = Math.max(0, fade)
    }
    this.drawFinger(fx, fy, u, pressed)

    // 단계 문구 — 노란 칩
    const copy = ['꾹 누르면 매달리고', '떼면 날아가요', '다시 누르면 다음 앵커에!'][stage]!
    this.pill(copy, d.x + d.w / 2, d.y + d.h - 74 * u, `800 ${Math.round(14 * u)}px ${FONT}`, COL.target, COL.ink, 12 * u, 0, u, true)
    ctx.restore()
  }

  /** 손가락 아이콘 — 위로 뻗은 검지 + 주먹, 외곽선 */
  private drawFinger(x: number, y: number, u: number, pressed: boolean): void {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha *= pressed ? 1 : 0.6
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 2 * u
    ctx.lineJoin = 'round'
    ctx.beginPath()
    this.roundRect(x - 12 * u, y - 2 * u, 24 * u, 18 * u, 8 * u)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    this.roundRect(x - 8 * u, y - 22 * u, 9 * u, 24 * u, 4.5 * u)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // ── 도형 유틸 ─────────────────────────────────────────────────────

  private outlinedCircle(x: number, y: number, r: number, fill: string, lw: number): void {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = lw
    ctx.stroke()
  }

  /** 흰 카드 — 2px 외곽선 + 오프셋 그림자 */
  private card(x: number, y: number, w: number, h: number, r: number, shadow: number): void {
    const ctx = this.ctx
    ctx.fillStyle = COL.ink
    this.roundRect(x + shadow, y + shadow, w, h, r)
    ctx.fill()
    this.roundRect(x, y, w, h, r)
    ctx.fillStyle = COL.card
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 2 * (shadow > 0 ? shadow / 4 : 1) + 0.5
    ctx.stroke()
  }

  private chip(x: number, y: number, w: number, h: number, fill: string, shadow: number): void {
    const ctx = this.ctx
    if (shadow > 0) {
      ctx.fillStyle = COL.ink
      this.roundRect(x + shadow, y + shadow, w, h, h / 2)
      ctx.fill()
    }
    this.roundRect(x, y, w, h, h / 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = Math.max(1.5, shadow * 0.66)
    ctx.stroke()
  }

  /** 글자 칩 (가운데 정렬). height 생략 시 글자 크기에서 계산 */
  private pill(
    text: string,
    cx: number,
    cy: number,
    font: string,
    fill: string,
    color: string,
    padX: number,
    shadow: number,
    u: number,
    thin: boolean,
    height?: number,
  ): void {
    const ctx = this.ctx
    ctx.font = font
    const tw = ctx.measureText(text).width
    const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '14')
    const h = height ?? size + 12 * u
    const w = tw + padX * 2
    this.chip(cx - w / 2, cy - h / 2, w, h, fill, shadow)
    if (thin) {
      ctx.strokeStyle = COL.ink
      ctx.lineWidth = 2 * u
      this.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2)
      ctx.stroke()
    }
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, cy + 1 * u)
    ctx.textBaseline = 'alphabetic'
  }

  private star(cx: number, cy: number, r: number): void {
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const x = cx + Math.cos(a) * rr
      const y = cy + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  private starburst(cx: number, cy: number, rx: number, ry: number, points: number): void {
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i < points * 2; i++) {
      const k = i % 2 === 0 ? 1 : 0.78
      const a = -Math.PI / 2 + (i * Math.PI) / points
      const x = cx + Math.cos(a) * rx * k
      const y = cy + Math.sin(a) * ry * k
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }
}
