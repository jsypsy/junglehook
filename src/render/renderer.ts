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
}

const COL = {
  skyTop: '#0a1a10',
  skyBottom: '#123024',
  anchor: '#d8c07a',
  target: '#ffe066',
  rope: '#c9a86a',
  player: '#ff8a3d',
  trail: 'rgba(255,138,61,0.25)',
  hud: '#e8f5ec',
  hudDim: '#9adbb8',
  overlay: 'rgba(4,12,8,0.72)',
}

export class Renderer {
  private trail: Array<{ x: number; y: number }> = []

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  resetTrail(): void {
    this.trail.length = 0
  }

  draw(g: Game, cam: Camera, best: number, w: number, h: number, topInset: number): void {
    const ctx = this.ctx
    const s = h / TUNING.viewH // 세로 스케일 — 월드 y를 화면에 맞춘다
    // 배경
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, COL.skyTop)
    grad.addColorStop(1, COL.skyBottom)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    const toX = (wx: number) => (wx - cam.x) * s
    const toY = (wy: number) => wy * s

    // 앵커
    const list = g.field.anchors
    for (const a of list) {
      const sx = toX(a.x)
      if (sx < -30 || sx > w + 30) continue
      ctx.beginPath()
      ctx.arc(sx, toY(a.y), 7 * s, 0, Math.PI * 2)
      ctx.fillStyle = COL.anchor
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

    // 궤적 트레일
    if (g.phase === 'playing') {
      this.trail.push({ x: g.body.pos.x, y: g.body.pos.y })
      if (this.trail.length > 18) this.trail.shift()
    }
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

    // 플레이어
    ctx.beginPath()
    ctx.arc(toX(g.body.pos.x), toY(g.body.pos.y), 12 * s, 0, Math.PI * 2)
    ctx.fillStyle = COL.player
    ctx.fill()

    // HUD
    const hudY = topInset + 34
    ctx.fillStyle = COL.hud
    ctx.font = `bold ${Math.round(26 * s)}px system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText(`${meters(g)}m`, 16, hudY)
    ctx.fillStyle = COL.hudDim
    ctx.font = `${Math.round(14 * s)}px system-ui, sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText(`BEST ${best}m`, w - 16, hudY)
    ctx.fillText(`B${BUILD}`, w - 8, h - 8)

    if (g.phase === 'ready') this.overlay(w, h, '정글훅', '홀드 = 로프 · 릴리스 = 점프', '탭해서 시작')
    if (g.phase === 'dead') {
      const m = meters(g)
      this.overlay(w, h, '추락!', `${m}m${m > best ? ' — 신기록!' : ''}`, '탭해서 다시')
    }
  }

  private overlay(w: number, h: number, title: string, sub: string, hint: string): void {
    const ctx = this.ctx
    ctx.fillStyle = COL.overlay
    ctx.fillRect(0, 0, w, h)
    ctx.textAlign = 'center'
    ctx.fillStyle = COL.hud
    ctx.font = 'bold 34px system-ui, sans-serif'
    ctx.fillText(title, w / 2, h / 2 - 30)
    ctx.fillStyle = COL.hudDim
    ctx.font = '17px system-ui, sans-serif'
    ctx.fillText(sub, w / 2, h / 2 + 4)
    ctx.font = '15px system-ui, sans-serif'
    ctx.fillText(hint, w / 2, h / 2 + 40)
  }
}
