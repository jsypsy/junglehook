/**
 * Canvas 2D 렌더 — 프로토타입은 도형만으로 그린다 (아트 방향은 Phase 1에서).
 * 월드 좌표: x는 카메라로 스크롤, y는 화면과 1:1 (설계 기준 viewH=749를 스케일).
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
  skyTop: '#0a1a10',
  skyBottom: '#123024',
  anchor: '#d8c07a',
  target: '#ffe066',
  rope: '#c9a86a',
  player: '#ff8a3d',
  trail: 'rgba(255,138,61,0.25)',
  anchorDim: 'rgba(216,192,122,0.55)',
  hud: '#e8f5ec',
  hudDim: '#9adbb8',
  overlay: 'rgba(4,12,8,0.72)',
}

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

export class Renderer {
  private trail: Array<{ x: number; y: number }> = []
  private death: DeathFx | null = null

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  resetTrail(): void {
    this.trail.length = 0
  }

  draw(g: Game, cam: Camera, best: number, w: number, h: number, topInset: number, preset: string | null = null): void {
    const ctx = this.ctx
    const s = (h / TUNING.viewH) * cam.zoom // 세로 스케일 — 월드 y를 화면에 맞춘다 (줌 포함)
    const now = performance.now()
    if (g.phase === 'dead' && !this.death) this.death = this.startDeath(g, now)
    if (g.phase !== 'dead') this.death = null
    const dead = this.death
    const deadT = dead ? now - dead.t0 : 0
    // 화면 흔들림 — 추락 직후 0.35초
    ctx.save()
    if (dead && deadT < 350) {
      const k = (1 - deadT / 350) * 9 * s
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k)
    }
    // 배경
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, COL.skyTop)
    grad.addColorStop(1, COL.skyBottom)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    const toX = (wx: number) => (wx - cam.x) * s
    const toY = (wy: number) => h / 2 + (wy - TUNING.viewH / 2) * s // 줌은 화면 세로 중앙 기준

    // 앵커 — 지금 로프가 닿는 것만 밝게, 사거리 밖은 흐리게 ("앵커가 보이는데 왜 안 잡히지" 방지)
    const list = g.field.anchors
    const p = g.body.pos
    for (const a of list) {
      const sx = toX(a.x)
      if (sx < -30 || sx > w + 30) continue
      const reachable =
        a.x >= p.x - TUNING.targetBehindLimit &&
        a.y <= p.y - TUNING.targetMinAbove &&
        Math.hypot(a.x - p.x, a.y - p.y) <= TUNING.reach
      ctx.beginPath()
      ctx.arc(sx, toY(a.y), 7 * s, 0, Math.PI * 2)
      ctx.fillStyle = reachable ? COL.anchor : COL.anchorDim
      ctx.fill()
    }
    // 타깃 하이라이트 — "지금 누르면 여기에 걸린다"
    const target = g.targetIdx !== null ? list[g.targetIdx] : undefined
    if (target) {
      const a = target
      ctx.beginPath()
      ctx.arc(toX(a.x), toY(a.y), 14 * s, 0, Math.PI * 2)
      ctx.strokeStyle = COL.target
      ctx.lineWidth = 3 * s
      ctx.stroke()
    }

    // 시작 화면에선 월드의 공·트레일·로프를 그리지 않는다 (데모 카드 뒤로 비쳐 헷갈림)
    if (g.phase === 'ready') {
      this.drawHud(g, best, w, h, s, topInset, preset)
      this.drawReadyScreen(w, h, s)
      return
    }

    // 궤적 트레일
    if (g.phase === 'playing') {
      this.trail.push({ x: g.body.pos.x, y: g.body.pos.y })
      if (this.trail.length > 18) this.trail.shift()
    }
    if (dead) this.trail.length = 0 // 죽은 뒤 세로로 남는 점선이 결과 카드를 어지럽힌다
    ctx.fillStyle = COL.trail
    for (const t of this.trail) {
      ctx.beginPath()
      ctx.arc(toX(t.x), toY(t.y), 4 * s, 0, Math.PI * 2)
      ctx.fill()
    }

    // 로프
    if (g.body.anchor) {
      ctx.beginPath()
      ctx.moveTo(toX(g.body.anchor.x), toY(g.body.anchor.y))
      ctx.lineTo(toX(g.body.pos.x), toY(g.body.pos.y))
      ctx.strokeStyle = COL.rope
      ctx.lineWidth = 3 * s
      ctx.stroke()
    }

    // 플레이어 — 죽으면 파편으로 흩어진다
    if (!dead) {
      ctx.beginPath()
      ctx.arc(toX(g.body.pos.x), toY(g.body.pos.y), 12 * s, 0, Math.PI * 2)
      ctx.fillStyle = COL.player
      ctx.fill()
    } else {
      this.drawDeathWorld(dead, now, toX, toY, s)
    }
    ctx.restore()

    this.drawHud(g, best, w, h, s, topInset, preset)

    if (dead) this.drawDeathCard(g, best, w, h, s, deadT)
  }

  private startDeath(g: Game, now: number): DeathFx {
    const parts: Particle[] = []
    for (let i = 0; i < 26; i++) {
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
    // 충격파 링 — 0.6초 동안 퍼지며 사라진다
    if (t < 0.6) {
      const q = t / 0.6
      ctx.beginPath()
      ctx.arc(toX(d.x), toY(d.y), (20 + 160 * q) * s, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,138,61,${0.7 * (1 - q)})`
      ctx.lineWidth = (6 - 5 * q) * s
      ctx.stroke()
    }
    const fade = Math.max(0, 1 - t / 1.4)
    for (const p of d.parts) {
      ctx.beginPath()
      ctx.arc(toX(p.x), toY(p.y), p.r * s * (0.4 + 0.6 * fade), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,138,61,${fade})`
      ctx.fill()
    }
  }

  /** 결과 카드 — 플래시 → 스크림 → "추락!" 튀어나옴 → 점수 카운트업 → 신기록 배지 → 재시작 힌트 */
  private drawDeathCard(g: Game, best: number, w: number, h: number, s: number, deadT: number): void {
    const ctx = this.ctx
    // 플래시
    if (deadT < 160) {
      ctx.fillStyle = `rgba(255,220,190,${0.35 * (1 - deadT / 160)})` // 따뜻한 색·짧게 — 붉은 플래시는 GRAC 전체이용가 관점에서 피한다
      ctx.fillRect(0, 0, w, h)
    }
    const scrim = Math.min(1, Math.max(0, (deadT - 250) / 350))
    if (scrim <= 0) return
    ctx.fillStyle = COL.overlay
    ctx.globalAlpha = scrim
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1

    const cx = w / 2
    const cy = h / 2
    ctx.textAlign = 'center'

    // 제목: 크게 튀어나오며 자리 잡는다
    const tp = Math.min(1, Math.max(0, (deadT - 300) / 380))
    if (tp > 0) {
      const sc = 0.6 + 0.4 * easeOutBack(tp)
      ctx.save()
      ctx.translate(cx, cy - 46 * s)
      ctx.scale(sc, sc)
      ctx.globalAlpha = Math.min(1, tp * 2)
      ctx.fillStyle = COL.player
      ctx.font = `900 ${Math.round(44 * s)}px system-ui, sans-serif`
      ctx.fillText('놓쳤다!', 0, 0) // '추락!'은 결과만 말한다 — 놓친 건 내 타이밍이라는 뜻이 담기게 (D-001 내 탓 원칙)
      ctx.restore()
    }

    // 점수 카운트업
    const m = meters(g)
    const cp = Math.min(1, Math.max(0, (deadT - 550) / 650))
    if (cp > 0) {
      const shown = Math.round(m * (1 - Math.pow(1 - cp, 3)))
      ctx.fillStyle = COL.hud
      ctx.font = `bold ${Math.round(52 * s)}px system-ui, sans-serif`
      ctx.fillText(`${shown}m`, cx, cy + 22 * s)
    }

    // 신기록 배지 — 카운트업이 끝난 뒤 펄스
    const isBest = m > best
    const bp = Math.min(1, Math.max(0, (deadT - 1250) / 300))
    if (bp > 0) {
      const pulse = 1 + 0.06 * Math.sin(deadT / 120)
      ctx.save()
      ctx.translate(cx, cy + 62 * s)
      ctx.scale(easeOutBack(bp) * pulse, easeOutBack(bp) * pulse)
      ctx.fillStyle = isBest ? COL.target : COL.hudDim
      ctx.font = `bold ${Math.round(17 * s)}px system-ui, sans-serif`
      ctx.fillText(isBest ? '✦ 신기록! ✦' : `최고 ${best}m`, 0, 0)
      ctx.restore()
    }

    // 재시작 힌트
    const hp = Math.min(1, Math.max(0, (deadT - 1500) / 300))
    if (hp > 0) {
      ctx.globalAlpha = hp * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(deadT / 300)))
      ctx.fillStyle = COL.hud
      ctx.font = `${Math.round(16 * s)}px system-ui, sans-serif`
      ctx.fillText('탭해서 다시', cx, cy + 112 * s)
      ctx.globalAlpha = 1
    }
  }

  private drawHud(g: Game, best: number, w: number, h: number, s: number, topInset: number, preset: string | null): void {
    const ctx = this.ctx
    const hudY = topInset + 34
    ctx.fillStyle = COL.hud
    ctx.font = `bold ${Math.round(26 * s)}px system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText(`${meters(g)}m`, 16, hudY)
    ctx.fillStyle = COL.hudDim
    ctx.font = `${Math.round(14 * s)}px system-ui, sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText(`BEST ${best}m`, w - 16, hudY)
    ctx.fillText(`B${BUILD}${preset ? '·' + preset : ''}`, w - 8, h - 8)
  }

  /** 시작 화면: 제목 + 사용법 루프 데모 (한줄팡 시작 카드와 같은 구조) */
  private drawReadyScreen(w: number, h: number, s: number): void {
    const ctx = this.ctx
    ctx.fillStyle = COL.overlay
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    ctx.textAlign = 'center'
    ctx.fillStyle = COL.hud
    ctx.font = `bold ${Math.round(36 * s)}px system-ui, sans-serif`
    ctx.fillText('정글훅', cx, h * 0.3)

    const demo = { x: cx - 150 * s, y: h * 0.3 + 28 * s, w: 300 * s, h: 190 * s }
    this.roundRect(demo.x, demo.y, demo.w, demo.h, 16 * s)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fill()
    ctx.save()
    this.roundRect(demo.x, demo.y, demo.w, demo.h, 16 * s)
    ctx.clip()
    this.drawStartDemo(demo, s, performance.now())
    ctx.restore()

    const now = performance.now()
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(now / 350))
    ctx.fillStyle = COL.hud
    ctx.globalAlpha = pulse
    ctx.font = `bold ${Math.round(17 * s)}px system-ui, sans-serif`
    ctx.fillText('탭해서 시작', cx, demo.y + demo.h + 44 * s)
    ctx.globalAlpha = 1
  }

  /**
   * 데모 루프(4.6s): ① 손가락이 누르면 공이 로프에 매달려 앞으로 흔들리고 ② 떼면 포물선으로 날아
   * ③ 다시 누르면 다음 앵커에 매달려 스윙한다. 끝에 짧게 페이드해 반복이 자연스럽게 이어진다
   */
  private drawStartDemo(d: { x: number; y: number; w: number; h: number }, s: number, now: number): void {
    const ctx = this.ctx
    const LOOP = 4600
    const t = now % LOOP
    const HOLD_END = 1400 // ① 첫 스윙
    const FLY_END = 2400 // ② 비행
    const HOLD2_END = 4000 // ③ 다음 앵커 스윙
    const rad = (deg: number) => deg * (Math.PI / 180)

    const anchor = { x: d.x + d.w * 0.22, y: d.y + 30 * s }
    const anchor2 = { x: d.x + d.w * 0.78, y: d.y + 36 * s }
    const rope = 64 * s
    const hang = (a: { x: number; y: number }, deg: number) => ({ x: a.x + Math.sin(rad(deg)) * rope, y: a.y + Math.cos(rad(deg)) * rope })

    // ① 첫 스윙: -55°에서 놓인 진자 — 바닥에서 가장 빠르고 올라가며 느려진다(코사인).
    //    정점(+55°)까지 가지 않고 +35°, 아직 빠를 때 놓는다 → 멈칫하지 않고 그대로 날아간다
    const SWING0 = -55
    const REL = 35
    const relPhase = Math.acos(-REL / -SWING0) // θ(φ) = SWING0·cos(φ) 가 REL이 되는 φ
    const swingAngle = (p: number) => SWING0 * Math.cos(relPhase * p)
    // ② 비행 경로: 놓은 지점에서 스윙 접선 방향으로 튀어나가 다음 앵커의 -55° 지점에
    //    떨어지는 2차 베지어 — 출발 방향이 스윙과 이어져야 "던져진" 느낌이 난다.
    //    제어점은 도착점보다 왼쪽에 둔다(80px): 도착 접선(끝점−제어점)이 앞·아래를 향해야
    //    "정점 지나 뒤로 떨어지며 잡히는" 모양이 안 나온다
    const GRAB = -55
    const flyStart = hang(anchor, REL)
    const flyEnd = hang(anchor2, GRAB)
    const tangent = { x: Math.cos(rad(REL)), y: -Math.sin(rad(REL)) } // 로프에 수직, 앞·위쪽
    const ctrl = { x: flyStart.x + tangent.x * 80 * s, y: flyStart.y + tangent.y * 80 * s }
    const arc = (q: number) => {
      const u = 1 - q
      return {
        x: u * u * flyStart.x + 2 * u * q * ctrl.x + q * q * flyEnd.x,
        y: u * u * flyStart.y + 2 * u * q * ctrl.y + q * q * flyEnd.y,
      }
    }

    let ball: { x: number; y: number }
    let ropeTo: { x: number; y: number } | null = null
    let ropeDraw = 1 // 로프가 앵커에서 공까지 뻗어나가는 비율 (잡는 순간 스냅)
    const trail: Array<{ x: number; y: number }> = []
    let stage: 0 | 1 | 2
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
      // 비행 관성을 이어받아 빠르게 출발해 정점에서 느려진다 (ease-out)
      ball = hang(anchor2, GRAB + (GRAB * -1 + 45) * (1 - Math.pow(1 - p, 2.2)))
      ropeTo = anchor2
      ropeDraw = Math.min(1, since / 90)
    }

    // 루프 끝 페이드 (③ 끝난 뒤 0.6s)
    const fade = t > HOLD2_END ? 1 - (t - HOLD2_END) / (LOOP - HOLD2_END) : 1
    ctx.save()
    ctx.globalAlpha = Math.max(0, fade)

    for (const a of [anchor, anchor2]) {
      ctx.beginPath()
      ctx.arc(a.x, a.y, 6 * s, 0, Math.PI * 2)
      ctx.fillStyle = COL.anchor
      ctx.fill()
    }
    // 비행 중엔 다음 앵커에 타깃 링 ("지금 누르면 여기") — 잡는 순간 커지며 사라진다
    const grabFlash = stage === 2 ? Math.max(0, 1 - (t - FLY_END) / 220) : 0
    if (stage === 1 || grabFlash > 0) {
      ctx.beginPath()
      ctx.arc(anchor2.x, anchor2.y, (12 + 10 * (1 - (stage === 1 ? 1 : grabFlash))) * s, 0, Math.PI * 2)
      ctx.strokeStyle = COL.target
      ctx.globalAlpha = Math.max(0, fade) * (stage === 1 ? 1 : grabFlash)
      ctx.lineWidth = 2.5 * s
      ctx.stroke()
      ctx.globalAlpha = Math.max(0, fade)
    }
    if (ropeTo) {
      ctx.beginPath()
      ctx.moveTo(ropeTo.x, ropeTo.y)
      ctx.lineTo(ropeTo.x + (ball.x - ropeTo.x) * ropeDraw, ropeTo.y + (ball.y - ropeTo.y) * ropeDraw)
      ctx.strokeStyle = COL.rope
      ctx.lineWidth = 2.5 * s
      ctx.stroke()
    }
    ctx.fillStyle = COL.trail
    for (const q of trail) {
      ctx.beginPath()
      ctx.arc(q.x, q.y, 3.5 * s, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, 10 * s, 0, Math.PI * 2)
    ctx.fillStyle = COL.player
    ctx.fill()

    // 손가락: 누르는 동안 아래로 내려가고 터치 링이 퍼진다
    const pressed = stage !== 1
    const fx = d.x + d.w * 0.5
    const fy = d.y + d.h - 34 * s + (pressed ? 6 * s : 0)
    if (pressed) {
      const rp = (t % 700) / 700
      ctx.beginPath()
      ctx.arc(fx, fy - 6 * s, (10 + 16 * rp) * s, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,224,102,${0.5 * (1 - rp)})`
      ctx.lineWidth = 2 * s
      ctx.stroke()
    }
    ctx.font = `${Math.round(26 * s)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.globalAlpha = Math.max(0, fade) * (pressed ? 1 : 0.55)
    ctx.fillText('👆', fx, fy + 10 * s)
    ctx.globalAlpha = Math.max(0, fade)

    // 단계 문구
    const copy = ['꾹 누르면 매달리고', '떼면 날아가요', '다시 누르면 다음 앵커에!'][stage]!
    ctx.fillStyle = pressed ? COL.target : COL.hudDim
    ctx.font = `bold ${Math.round(14 * s)}px system-ui, sans-serif`
    ctx.fillText(copy, d.x + d.w / 2, d.y + d.h - 62 * s)
    ctx.restore()
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

}
