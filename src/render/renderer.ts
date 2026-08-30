/**
 * Canvas 2D 렌더 — 밝은 카툰 정글 (D-008). `design/` 설계도를 이미지 없이 도형·그라데이션으로 재현한다.
 *
 * 좌표계: 월드 x는 카메라로 스크롤, y는 설계 기준 viewH=749를 화면에 스케일(줌 포함, 배율 `s`).
 * 배경 장식·HUD·카드는 줌과 무관하게 화면 크기 배율 `u`로 그린다.
 * 문법: 굵은 외곽선(#1f3a2a)·평면 색·둥근 형태·흰 카드 + 오프셋 그림자. 웹폰트 없음.
 */
import type { Game } from '../core/game'
import { isChanceAnchor, meters, sonicInSweet, sonicMarker } from '../core/game'
import { seasonAt, type Season, type SeasonState } from '../core/season'
import { TUNING } from '../core/tuning'
import { BUILD } from '../version'
import { mixHex } from './color'

/** 결과 카드가 필요로 하는 바깥 상태 */
export interface DeathUi {
  continuesLeft: number
  maxContinues: number
  adBusy: boolean
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Camera {
  x: number
  /** 1 = 기본. 작을수록 줌아웃 (화면 세로 중앙 기준) */
  zoom: number
}

const COL = {
  ink: '#1f3a2a',
  inkSoft: '#4f7f62',
  rope: '#c98c4b',
  target: '#ffcc33',
  player: '#ff7f3f',
  playerHi: '#ffd7b3',
  // 슈퍼 모드 — 백열 몸 + 노랑→주황→빨강 불꽃·번개 (시스템 색 노랑에서 이어지는 "충전이 터진" 색)
  sonic: '#fff1b0',
  sonicHi: '#ffffff',
  sonicFlame: '#ffcc33',
  sonicHot: '#e6392b',
  card: '#ffffff',
  cardTint: '#eaf7d6',
  scrim: 'rgba(31,58,42,0.35)',
}
const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif'

/** 계절마다 바뀌는 색 (D-010). 외곽선·플레이어·타깃·로프는 고정 */
interface Palette {
  skyTop: string
  skyBottom: string
  sun: string
  glow: string
  cloud: string
  forestFar: string
  forestMid: string
  forestNear: string
  leaf: string
  vine: string
  trunk: string
}
const SEASON_PALETTE: Record<Season, Palette> = {
  // 봄: 파스텔 연두·분홍기 도는 하늘, 벚꽃잎 / 여름: 진한 파랑 하늘·짙은 녹색 — 두 계절이 한눈에 갈리게
  spring: { skyTop: '#cfe9f6', skyBottom: '#fbeef0', sun: '#ffe9a0', glow: '#fff6c8', cloud: '#ffffff', forestFar: '#d6ecb0', forestMid: '#a5d98a', forestNear: '#6cbf6f', leaf: '#3f9a58', vine: '#6cbf6f', trunk: '#b98a5a' },
  summer: { skyTop: '#3fb0ea', skyBottom: '#a9e2ff', sun: '#ffcc1f', glow: '#fff0a0', cloud: '#ffffff', forestFar: '#5cc06a', forestMid: '#2c9c4b', forestNear: '#177a3a', leaf: '#0d5a2a', vine: '#1f8a40', trunk: '#8a5a34' },
  autumn: { skyTop: '#b8dff0', skyBottom: '#f7e6c8', sun: '#ffd94d', glow: '#fff0a0', cloud: '#fff8ee', forestFar: '#e0b35a', forestMid: '#d47f3a', forestNear: '#a34d2a', leaf: '#6b3520', vine: '#8a5a2a', trunk: '#6e4426' },
  winter: { skyTop: '#aebfcb', skyBottom: '#e6edf1', sun: '#fff4c2', glow: '#ffffff', cloud: '#c9d5dc', forestFar: '#dfe9ec', forestMid: '#b9cdd6', forestNear: '#8ea9b6', leaf: '#5e7a88', vine: '#7f95a3', trunk: '#6f7f88' },
}
function paletteFor(st: SeasonState): Palette {
  const a = SEASON_PALETTE[st.prev]
  const b = SEASON_PALETTE[st.season]
  if (st.blend >= 1 || a === b) return b
  const out = {} as Palette
  for (const k of Object.keys(b) as Array<keyof Palette>) out[k] = mixHex(a[k], b[k], st.blend)
  return out
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
  /** 결과 카드 버튼 영역 (화면 px) — 보이는 동안만 채워진다 */
  private deathButtons: { continue: Rect | null; retry: Rect | null } = { continue: null, retry: null }

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  resetTrail(): void {
    this.trail.length = 0
  }

  /** 결과 카드의 버튼 히트테스트 (화면 px) */
  hitDeathButton(x: number, y: number): 'continue' | 'retry' | null {
    const inside = (r: Rect | null) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
    if (inside(this.deathButtons.continue)) return 'continue'
    if (inside(this.deathButtons.retry)) return 'retry'
    return null
  }

  draw(
    g: Game,
    cam: Camera,
    best: number,
    w: number,
    h: number,
    topInset: number,
    preset: string | null = null,
    ui: DeathUi = { continuesLeft: 0, maxContinues: 0, adBusy: false },
  ): void {
    const ctx = this.ctx
    const u = h / TUNING.viewH // 화면 배율 (줌 무관) — 장식·HUD·카드
    const s = u * cam.zoom // 월드 배율 (줌 포함)
    const now = performance.now()
    if (g.phase === 'dead' && !this.death) this.death = this.startDeath(g, now)
    if (g.phase !== 'dead') {
      this.death = null
      this.deathButtons = { continue: null, retry: null }
    }
    const dead = this.death
    const deadT = dead ? now - dead.t0 : 0

    // 계절 — 거리로 결정, 경계에서 보간. 글자 안내는 없다 (배경 변화만으로 충분, 사용자 결정)
    const st = seasonAt(meters(g))
    const pal = paletteFor(st)

    ctx.save()
    if (dead && deadT < 350) {
      const k = (1 - deadT / 350) * 9 * u
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k)
    }
    this.drawBackground(cam, w, h, u, topInset, pal, st)

    const toX = (wx: number) => (wx - cam.x) * s
    const toY = (wy: number) => h / 2 + (wy - TUNING.viewH / 2) * s // 줌은 화면 세로 중앙 기준

    // 시작 화면: 무대(배경)만 두고 카드로 간다 — 월드 덩굴이 제목을 가로지르면 어수선하다
    if (g.phase === 'ready') {
      ctx.restore()
      this.drawForeground(cam, w, h, u, pal)
      this.drawHud(g, best, w, h, u, topInset, preset)
      this.drawReadyScreen(w, h, u, now, pal)
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
      this.drawVine(sx, toY(a.y), s, a.x, pal)
      const chance = isChanceAnchor(g, list.indexOf(a))
      if (chance) {
        // 소닉 찬스 잎 — 금빛 후광이 숨 쉰다
        const pulse = 0.8 + 0.2 * Math.sin(now / 160)
        ctx.beginPath()
        ctx.arc(sx, toY(a.y), 26 * s * pulse, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,204,51,0.35)'
        ctx.fill()
      }
      ctx.globalAlpha = reachable || a === target ? 1 : 0.5
      this.drawLoop(sx, toY(a.y), (chance ? 10 : 8) * s, s, chance ? COL.target : pal.vine)
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

    // 소닉 파워 — 충전 링·장착 오라·대시 잔상/불꽃
    const so = g.sonic
    const px = toX(g.body.pos.x)
    const py = toY(g.body.pos.y)
    if (!dead && so.dashing) {
      this.drawMotionBlur()
      this.drawDashFx(px, py, s, w, h, now)
    }
    if (!dead && g.body.anchor && (so.loops > 0 || so.armed)) this.drawChargeRings(px, py, s, so.loops, so.armed, now)
    if (!dead && so.freezeT > 0 && g.body.anchor) this.drawChanceBurst(toX(g.body.anchor.x), toY(g.body.anchor.y), s, w, h, so.freezeT)

    // 플레이어 — 죽으면 파편으로 흩어진다. 대시 중엔 파란 슈퍼 모드(1.5배·선글라스)
    if (!dead) {
      this.drawPlayer(px, py, (so.dashing ? 22 : 15) * s, s, g.body.vel.x, g.holding || so.dashing, so.dashing)
    } else {
      this.drawDeathWorld(dead, now, toX, toY, s)
    }
    ctx.restore()

    this.drawForeground(cam, w, h, u, pal)
    this.drawSnow(st, w, h, u, now)
    this.drawHud(g, best, w, h, u, topInset, preset)
    if (!dead && so.armed && g.body.anchor) this.drawSonicGauge(g, w, u, topInset)
    if (dead) this.drawDeathCard(g, best, w, h, u, deadT, ui)
  }

  /** 플래시처럼 주변이 뭉개지는 모션 블러 — 지금까지 그린 장면을 옆으로 밀어 겹친다 (플레이어는 이 뒤에 선명하게) */
  private drawMotionBlur(): void {
    const ctx = this.ctx
    const cv = ctx.canvas
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (const [shift, a] of [[18, 0.35], [40, 0.22], [70, 0.12]] as const) {
      ctx.globalAlpha = a
      ctx.drawImage(cv, -shift * (cv.width / 393), 0)
    }
    ctx.restore()
  }

  /** 타이밍 게이지 — 장착되면 상단에 나타나고, 마커가 왕복한다. 노란 구간 안에서 놓아야 발동 */
  private drawSonicGauge(g: Game, w: number, u: number, topInset: number): void {
    const ctx = this.ctx
    const gw = 220 * u
    const gh = 16 * u
    const x = w / 2 - gw / 2
    const y = topInset + 64 * u
    const sweet = TUNING.sonic.sweetHalf
    const inSweet = sonicInSweet(g)
    // 틀
    this.chip(x, y, gw, gh, COL.card, 3 * u)
    // 성공 구간
    ctx.save()
    this.roundRect(x, y, gw, gh, gh / 2)
    ctx.clip()
    ctx.fillStyle = COL.target
    ctx.fillRect(x + gw * (0.5 - sweet), y, gw * sweet * 2, gh)
    ctx.restore()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 1.2 * u
    ctx.beginPath()
    ctx.moveTo(x + gw * (0.5 - sweet), y)
    ctx.lineTo(x + gw * (0.5 - sweet), y + gh)
    ctx.moveTo(x + gw * (0.5 + sweet), y)
    ctx.lineTo(x + gw * (0.5 + sweet), y + gh)
    ctx.stroke()
    // 마커
    const mx = x + gw * sonicMarker(g)
    ctx.beginPath()
    this.roundRect(mx - 4 * u, y - 6 * u, 8 * u, gh + 12 * u, 3 * u)
    ctx.fillStyle = inSweet ? COL.target : COL.player
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 2 * u
    ctx.stroke()
    if (inSweet) {
      ctx.beginPath()
      ctx.arc(mx, y - 14 * u, 5 * u, 0, Math.PI * 2)
      ctx.fillStyle = COL.target
      ctx.fill()
      ctx.stroke()
    }
  }

  /** 계절 입자 — 겨울 눈(갈수록 거세짐), 가을 낙엽. 상태 없는 결정론 패턴(시간·인덱스). 봄 꽃잎은 지저분해 제거 */
  private drawSnow(st: SeasonState, w: number, h: number, u: number, now: number): void {
    const weightOf = (season: Season) =>
      Math.max(st.season === season ? st.blend : 0, st.prev === season && st.blend < 1 ? 1 - st.blend : 0)
    const t = now / 1000
    const ctx = this.ctx
    const snow = weightOf('winter')
    if (snow > 0) {
      const intensity = st.season === 'winter' ? st.progress : 1
      const count = Math.round(18 + 50 * intensity)
      ctx.globalAlpha = snow * 0.9
      for (let i = 0; i < count; i++) {
        const speed = (40 + 50 * intensity) * (0.7 + ((i * 37) % 10) / 20)
        const x = (((i * 97.3) % w) + Math.sin(t * 0.8 + i) * 14 * u + w) % w
        const y = (((i * 53.7) % h) + t * speed * u) % h
        const r = (3.5 + ((i * 13) % 3) * 1.4) * u
        this.outlinedCircle(x, y, r, '#ffffff', 1.2 * u)
      }
      ctx.globalAlpha = 1
    }
    // 가을 낙엽 — 큼직한 잎이 흔들리며 떨어진다 (사용자: 낙엽 티가 나게)
    const fall = weightOf('autumn')
    if (fall > 0) {
      const colors = ['#d47f3a', '#e0a63a', '#a34d2a', '#c8632f']
      ctx.globalAlpha = fall * 0.95
      for (let i = 0; i < 12; i++) {
        const sway = Math.sin(t * 1.1 + i * 1.3) * 34 * u
        const x = (((i * 137.9) % w) + sway + t * 18 * u + w * 4) % w
        const y = (((i * 83.1) % h) + t * (42 + ((i * 11) % 5) * 6) * u) % h
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.sin(t * 1.6 + i) * 0.9 + i)
        const L = (13 + ((i * 7) % 3) * 2) * u
        const W = L * 0.55
        ctx.beginPath()
        ctx.moveTo(0, -L)
        ctx.quadraticCurveTo(W, -L * 0.3, 0, L * 0.6)
        ctx.quadraticCurveTo(-W, -L * 0.3, 0, -L)
        ctx.closePath()
        ctx.fillStyle = colors[i % colors.length]!
        ctx.fill()
        ctx.strokeStyle = COL.ink
        ctx.lineWidth = 1.6 * u
        ctx.lineJoin = 'round'
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, -L * 0.75)
        ctx.lineTo(0, L * 0.4)
        ctx.strokeStyle = 'rgba(31,58,42,0.5)'
        ctx.lineWidth = 1.2 * u
        ctx.stroke()
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }
  }

  /** 하늘·태양·구름·3겹 숲 — 화면 공간, 카메라 x로 패럴랙스 */
  private drawBackground(cam: Camera, w: number, h: number, u: number, topInset: number, pal: Palette, st: SeasonState): void {
    const ctx = this.ctx
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, pal.skyTop)
    grad.addColorStop(1, pal.skyBottom)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // 태양 — 계절 캐릭터: 봄 미소 / 여름 크고 이글거리며 화난 얼굴 / 가을 나른한 반눈 / 겨울 창백하게 눈 감음
    const sunX = w - 75 * u
    const sunY = topInset + 96 * u
    const weightOf = (season: Season) =>
      Math.max(st.season === season ? st.blend : 0, st.prev === season && st.blend < 1 ? 1 - st.blend : 0)
    const summer = weightOf('summer')
    const winter = weightOf('winter')
    const R = (40 + 16 * summer - 12 * winter) * u
    if (summer > 0) {
      // 광선 — 천천히 돌며 이글거린다
      ctx.save()
      ctx.translate(sunX, sunY)
      ctx.rotate((performance.now() / 1000) * 0.25)
      ctx.globalAlpha = summer
      ctx.fillStyle = pal.sun
      ctx.strokeStyle = COL.ink
      ctx.lineWidth = 2.5 * u
      ctx.lineJoin = 'round'
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const len = (i % 2 === 0 ? 30 : 20) * u
        ctx.beginPath()
        ctx.moveTo(Math.cos(a - 0.14) * (R + 6 * u), Math.sin(a - 0.14) * (R + 6 * u))
        ctx.lineTo(Math.cos(a) * (R + 6 * u + len), Math.sin(a) * (R + 6 * u + len))
        ctx.lineTo(Math.cos(a + 0.14) * (R + 6 * u), Math.sin(a + 0.14) * (R + 6 * u))
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(sunX, sunY, R + 14 * u, 0, Math.PI * 2)
    ctx.fillStyle = pal.glow
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.globalAlpha = 1
    this.outlinedCircle(sunX, sunY, R, pal.sun, 3 * u)
    this.drawSunFace(sunX, sunY, R, st)

    // 구름 (패럴랙스 0.15, 주기 반복)
    const period = CLOUD_PERIOD * u
    const off = ((-cam.x * 0.15 * u) % period + period) % period
    for (let k = -1; k * period + off < w + period; k++) {
      for (const c of CLOUDS) {
        this.drawCloud(k * period + off + c.x * u, topInset * 0.4 + c.y * u, c.k * u, pal.cloud)
      }
    }

    // 우거진 캐노피 (D-011): 먼 나무들(기둥 없이 덩어리) → 기둥 있는 중간 나무들 → 땅 → 앞쪽 양치식물.
    // 나무는 띄엄띄엄 — 붙여 놓으면 물결 울타리로 읽힌다
    this.drawCanopyLayer(cam, w, h, u, 0.3, 0.68, 620, [
      { x: 40, r: 52 }, { x: 250, r: 60 }, { x: 450, r: 55 },
    ], pal.forestFar, null, 0.93)
    this.drawCanopyLayer(cam, w, h, u, 0.5, 0.735, 700, [
      { x: 90, r: 72 }, { x: 400, r: 80 },
    ], pal.forestMid, pal.trunk, 1)
    this.drawForestBand(cam, w, h, u, 0.9, 0.75, 12, 80, pal.forestNear)
    // 안개 띠 — 중경과 땅 사이
    const mistY = h * 0.8
    const mist = ctx.createLinearGradient(0, mistY - 40 * u, 0, mistY + 40 * u)
    mist.addColorStop(0, 'rgba(255,255,255,0)')
    mist.addColorStop(0.5, 'rgba(255,255,255,0.22)')
    mist.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = mist
    ctx.fillRect(0, mistY - 40 * u, w, 80 * u)
  }

  /**
   * 둥근 잎덩어리 나무들 — 원 다섯 개 합집합(외곽선 먼저, 채움 나중). 주기 반복·패럴랙스.
   * trunk가 있으면 덩어리 아래로 기둥을 땅까지 내린다. bottomFrac: 덩어리 몸통을 이 높이까지만 채운다
   */
  private drawCanopyLayer(
    cam: Camera,
    w: number,
    h: number,
    u: number,
    parallax: number,
    yFrac: number,
    periodPx: number,
    trees: Array<{ x: number; r: number }>,
    fill: string,
    trunk: string | null,
    bottomFrac: number,
  ): void {
    const ctx = this.ctx
    const period = periodPx * u
    const off = ((-cam.x * parallax * u) % period + period) % period
    const lobes = [
      [0, 0, 1], [-0.8, 0.15, 0.75], [0.8, 0.15, 0.75], [-0.4, -0.45, 0.7], [0.4, -0.45, 0.7],
    ]
    const cy = h * yFrac
    const bottom = h * bottomFrac + 10
    // 기둥 먼저 (덩어리 뒤로 들어간다)
    if (trunk) {
      ctx.fillStyle = trunk
      ctx.strokeStyle = COL.ink
      ctx.lineWidth = 3 * u
      ctx.lineJoin = 'round'
      for (let k = -1; k * period + off < w + period; k++) {
        for (const t of trees) {
          const cx = k * period + off + t.x * u
          if (cx < -100 * u || cx > w + 100 * u) continue
          const r = t.r * u
          const hw = r * 0.18
          ctx.beginPath()
          ctx.moveTo(cx - hw * 1.4, h + 10)
          ctx.lineTo(cx - hw, cy + r * 0.3)
          ctx.lineTo(cx + hw, cy + r * 0.3)
          ctx.lineTo(cx + hw * 1.4, h + 10)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      }
    }
    const pass = (color: string, grow: number) => {
      ctx.fillStyle = color
      for (let k = -1; k * period + off < w + period; k++) {
        for (const t of trees) {
          const cx = k * period + off + t.x * u
          if (cx < -t.r * 2.2 * u || cx > w + t.r * 2.2 * u) continue
          const r = t.r * u
          for (const [dx, dy, rr] of lobes) {
            ctx.beginPath()
            ctx.arc(cx + dx! * r, cy + dy! * r, rr! * r + grow, 0, Math.PI * 2)
            ctx.fill()
          }
          if (!trunk) {
            // 먼 나무는 몸통을 아래로 조금 늘려 숲의 두께를 만든다
            ctx.fillRect(cx - r * 1.2 - grow, cy, r * 2.4 + grow * 2, Math.max(0, bottom - cy))
          }
        }
      }
    }
    pass(COL.ink, 3 * u)
    pass(fill, 0)
  }

  /** 태양 표정 — 계절별. 경계에선 현재 계절 표정이 서서히 나타난다 */
  private drawSunFace(x: number, y: number, R: number, st: SeasonState): void {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = st.blend
    ctx.strokeStyle = COL.ink
    ctx.fillStyle = COL.ink
    ctx.lineCap = 'round'
    const ex = R * 0.36
    const ey = -R * 0.12
    const lw = Math.max(1.5, R * 0.08)
    switch (st.season) {
      case 'spring': {
        // 순한 미소: 둥근 눈 + 작은 웃음
        for (const dx of [-ex, ex]) {
          ctx.beginPath()
          ctx.arc(x + dx, y + ey, R * 0.07, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(x, y + R * 0.15, R * 0.3, 0.15 * Math.PI, 0.85 * Math.PI)
        ctx.lineWidth = lw
        ctx.stroke()
        break
      }
      case 'summer': {
        // 화난 얼굴: 치켜 올라간 눈썹 + 찡그린 입
        ctx.lineWidth = lw * 1.3
        for (const sgn of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(x + sgn * ex * 1.5, y + ey - R * 0.3)
          ctx.lineTo(x + sgn * ex * 0.45, y + ey - R * 0.12)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x + sgn * ex, y + ey + R * 0.02, R * 0.085, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(x, y + R * 0.55, R * 0.3, 1.2 * Math.PI, 1.8 * Math.PI)
        ctx.lineWidth = lw
        ctx.stroke()
        break
      }
      case 'autumn': {
        // 나른함: 반쯤 감긴 눈(윗선) + 작은 일자 입
        ctx.lineWidth = lw
        for (const dx of [-ex, ex]) {
          ctx.beginPath()
          ctx.arc(x + dx, y + ey, R * 0.1, 0.05 * Math.PI, 0.95 * Math.PI)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.moveTo(x - R * 0.14, y + R * 0.22)
        ctx.lineTo(x + R * 0.14, y + R * 0.22)
        ctx.stroke()
        break
      }
      case 'winter': {
        // 눈 감음(아랫선) + 볼 붉은기 없는 창백함
        ctx.lineWidth = lw
        for (const dx of [-ex, ex]) {
          ctx.beginPath()
          ctx.arc(x + dx, y + ey + R * 0.03, R * 0.1, 1.1 * Math.PI, 1.9 * Math.PI)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(x, y + R * 0.2, R * 0.12, 0.2 * Math.PI, 0.8 * Math.PI)
        ctx.stroke()
        break
      }
    }
    ctx.restore()
  }

  private drawCloud(x: number, y: number, k: number, fill: string): void {
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
    pass(fill, 0)
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

  /** 앞쪽 양치식물 — 화면 아래, 플레이어보다 앞에 그려 깊이를 만든다 (패럴랙스 1.15) */
  private drawForeground(cam: Camera, w: number, h: number, u: number, pal: Palette): void {
    const period = 520 * u
    const off = ((-cam.x * 1.15 * u) % period + period) % period
    for (let k = -1; k * period + off < w + period; k++) {
      const x0 = k * period + off
      this.drawFern(x0 + 0 * u, h + 8 * u, 1.1 * u, pal.leaf, false)
      this.drawFern(x0 + 210 * u, h + 14 * u, 0.7 * u, pal.leaf, false)
      this.drawFern(x0 + 420 * u, h + 8 * u, 1.0 * u, pal.leaf, true)
    }
  }

  /** 양치식물 한 포기: 휘는 줄기 + 잎 여섯 장 */
  private drawFern(x: number, y: number, k: number, fill: string, flip: boolean): void {
    const ctx = this.ctx
    const sgn = flip ? -1 : 1
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 3 * k
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + sgn * 40 * k, y - 70 * k, x + sgn * 90 * k, y - 120 * k)
    ctx.stroke()
    ctx.fillStyle = fill
    ctx.lineWidth = 2 * k
    // 잎은 줄기 접선에 수직으로 양옆에 한 쌍씩, 끝으로 갈수록 작아진다
    for (let i = 1; i <= 6; i++) {
      const t = i / 7
      const px = x + sgn * (40 * k * 2 * t * (1 - t) + 90 * k * t * t)
      const py = y - (70 * k * 2 * t * (1 - t) + 120 * k * t * t)
      // 접선(도함수)
      const tx = sgn * (40 * k * 2 * (1 - 2 * t) + 180 * k * t)
      const ty = -(70 * k * 2 * (1 - 2 * t) + 240 * k * t)
      const ang = Math.atan2(ty, tx)
      const len = 22 * k * (1 - t * 0.55)
      const wid = 7 * k * (1 - t * 0.4)
      for (const side of [-1, 1]) {
        const a = ang + side * 1.15
        ctx.beginPath()
        ctx.ellipse(px + Math.cos(a) * len * 0.8, py + Math.sin(a) * len * 0.8, len, wid, a, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  }

  /** 앵커까지 화면 위에서 내려오는 덩굴 + 잎 한 장 */
  private drawVine(sx: number, ay: number, s: number, seed: number, pal: Palette): void {
    const ctx = this.ctx
    const bend = (Math.sin(seed * 0.37) * 10 + 8) * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx + bend * 0.3, -10)
    ctx.bezierCurveTo(sx + bend, ay * 0.35, sx - bend, ay * 0.7, sx, ay - 8 * s)
    ctx.strokeStyle = pal.vine
    ctx.lineWidth = 4 * s
    ctx.stroke()
    const ly = ay * 0.45
    ctx.beginPath()
    ctx.ellipse(sx + bend * 0.6 + 6 * s, ly, 10 * s, 5 * s, -0.5, 0, Math.PI * 2)
    ctx.fillStyle = pal.forestMid
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 2 * s
    ctx.stroke()
  }

  /** 앵커 = 덩굴 끝 나뭇잎 (사용자 결정). 잎 중심이 로프가 걸리는 점. 계절 색을 따른다 */
  private drawLoop(x: number, y: number, r: number, s: number, vine: string): void {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.55)
    const L = r * 2.1
    const W = r * 1.15
    ctx.beginPath()
    ctx.moveTo(0, -L)
    ctx.quadraticCurveTo(W, -L * 0.35, 0, L * 0.55)
    ctx.quadraticCurveTo(-W, -L * 0.35, 0, -L)
    ctx.closePath()
    ctx.fillStyle = vine
    ctx.fill()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 2.5 * s
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -L * 0.8)
    ctx.lineTo(0, L * 0.4)
    ctx.strokeStyle = 'rgba(31,58,42,0.55)'
    ctx.lineWidth = 1.5 * s
    ctx.stroke()
    ctx.restore()
  }

  // ── 플레이어·연출 ─────────────────────────────────────────────────

  private drawPlayer(x: number, y: number, r: number, s: number, velX: number, holding: boolean, sonic = false): void {
    const ctx = this.ctx
    this.outlinedCircle(x, y, r, sonic ? COL.sonic : COL.player, 3 * s)
    ctx.beginPath()
    ctx.arc(x - r * 0.4, y - r * 0.4, r * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = sonic ? COL.sonicHi : COL.playerHi
    ctx.fill()
    const look = Math.max(-1, Math.min(1, velX / 600)) * r * 0.12
    if (sonic) {
      // 선글라스 — 렌즈 둘 + 브릿지, 살짝 기울여 속도감
      ctx.save()
      ctx.translate(x + look, y + r * 0.1)
      ctx.rotate(-0.08)
      ctx.fillStyle = COL.ink
      ctx.beginPath()
      this.roundRect(-r * 0.62, -r * 0.17, r * 0.5, r * 0.34, r * 0.1)
      ctx.fill()
      ctx.beginPath()
      this.roundRect(r * 0.08, -r * 0.17, r * 0.5, r * 0.34, r * 0.1)
      ctx.fill()
      ctx.fillRect(-r * 0.14, -r * 0.05, r * 0.24, r * 0.08)
      ctx.strokeStyle = COL.ink
      ctx.lineWidth = Math.max(1, r * 0.08)
      ctx.beginPath()
      ctx.moveTo(-r * 0.62, -r * 0.05)
      ctx.lineTo(-r * 0.95, -r * 0.15)
      ctx.moveTo(r * 0.58, -r * 0.05)
      ctx.lineTo(r * 0.9, -r * 0.15)
      ctx.stroke()
      ctx.restore()
    } else {
      // 눈은 진행 방향으로 살짝 쏠린다. 홀드 중엔 힘주는 표정(눈 가늘게)
      ctx.fillStyle = COL.ink
      for (const dx of [-0.28, 0.32]) {
        ctx.beginPath()
        if (holding) ctx.ellipse(x + dx * r + look, y + r * 0.12, r * 0.13, r * 0.08, 0, 0, Math.PI * 2)
        else ctx.arc(x + dx * r + look, y + r * 0.12, r * 0.13, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.beginPath()
    ctx.moveTo(x - r * 0.2 + look, y + r * 0.45)
    ctx.quadraticCurveTo(x + look, y + r * 0.65, x + r * 0.25 + look, y + r * 0.45)
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = Math.max(1, r * 0.12)
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  /** 충전 링 — 바퀴 수만큼 동심원, 장착되면 노란 오라가 맥동 */
  private drawChargeRings(x: number, y: number, s: number, loops: number, armed: boolean, now: number): void {
    const ctx = this.ctx
    const n = Math.min(loops, TUNING.sonic.loopsToArm)
    if (armed) {
      const pulse = 0.85 + 0.15 * Math.sin(now / 90)
      ctx.beginPath()
      ctx.arc(x, y, 30 * s * pulse, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,204,51,0.35)'
      ctx.fill()
      // 스파크 — 돌아가는 점 6개
      for (let i = 0; i < 6; i++) {
        const a = now / 140 + (i * Math.PI) / 3
        this.outlinedCircle(x + Math.cos(a) * 38 * s, y + Math.sin(a) * 38 * s, 3.5 * s, COL.target, 1.2 * s)
      }
    }
    for (let i = 0; i < n; i++) {
      ctx.beginPath()
      ctx.arc(x, y, (21 + i * 6) * s, 0, Math.PI * 2)
      ctx.strokeStyle = armed ? COL.target : COL.player
      ctx.globalAlpha = armed ? 0.9 : 0.55
      ctx.lineWidth = 2.5 * s
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  /** 대시 연출 — 잔상·로켓 불꽃·화면 속도선 */
  private drawDashFx(x: number, y: number, s: number, w: number, h: number, now: number): void {
    const ctx = this.ctx
    // 속도선 (화면 공간)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineCap = 'round'
    for (let i = 0; i < 14; i++) {
      const ly = ((i * 71.7) % h)
      const len = (60 + ((i * 37) % 5) * 30) * s
      const off = ((now * (1.2 + ((i * 13) % 4) * 0.4)) % (w + len))
      ctx.lineWidth = (1.5 + ((i * 7) % 3)) * s
      ctx.beginPath()
      ctx.moveTo(w - off, ly)
      ctx.lineTo(w - off + len, ly)
      ctx.stroke()
    }
    // 잔상 (파란 슈퍼 모드)
    for (let i = 1; i <= 5; i++) {
      ctx.globalAlpha = 0.3 - i * 0.05
      ctx.beginPath()
      ctx.arc(x - i * 26 * s, y, (22 - i * 2.5) * s, 0, Math.PI * 2)
      ctx.fillStyle = COL.sonicHot
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // 로켓 불꽃 — 뒤로 뻗는 삼각 불꽃 두 겹, 깜빡임
    const flick = 0.8 + 0.2 * Math.sin(now / 35)
    const flame = (len: number, half: number, fill: string) => {
      ctx.beginPath()
      ctx.moveTo(x - 12 * s, y - half)
      ctx.lineTo(x - 12 * s - len * flick, y)
      ctx.lineTo(x - 12 * s, y + half)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = COL.ink
      ctx.lineWidth = 2 * s
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    flame(76 * s, 18 * s, COL.sonicHot)
    flame(54 * s, 12 * s, COL.player)
    flame(32 * s, 6 * s, COL.sonicFlame)
    this.drawLightning(x, y, 22 * s, s, now)
  }

  /** 토르식 전기 — 플레이어 주위 번개 아크(흰 심 + 파란 광채)가 프레임마다 다르게 번쩍인다 */
  private drawLightning(x: number, y: number, r: number, s: number, now: number): void {
    const ctx = this.ctx
    const frame = Math.floor(now / 45) // 45ms마다 새 패턴
    const rnd = (i: number) => {
      const v = Math.sin(frame * 12.9898 + i * 78.233) * 43758.5453
      return v - Math.floor(v)
    }
    // 전기 오라
    ctx.beginPath()
    ctx.arc(x, y, r * 1.7, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,204,51,0.28)'
    ctx.fill()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let b = 0; b < 7; b++) {
      const a0 = rnd(b * 10) * Math.PI * 2
      let px = x + Math.cos(a0) * r * 1.1
      let py = y + Math.sin(a0) * r * 1.1
      const segs = 3 + Math.floor(rnd(b * 10 + 1) * 3)
      const len = r * (0.9 + rnd(b * 10 + 2) * 1.2)
      const dir = a0 + (rnd(b * 10 + 3) - 0.5) * 1.2 - 0.6 // 대체로 뒤·바깥으로
      const pts: Array<[number, number]> = [[px, py]]
      for (let k = 1; k <= segs; k++) {
        const jitter = (rnd(b * 10 + 3 + k) - 0.5) * r * 0.9
        px += Math.cos(dir) * (len / segs) + Math.cos(dir + Math.PI / 2) * jitter
        py += Math.sin(dir) * (len / segs) + Math.sin(dir + Math.PI / 2) * jitter
        pts.push([px, py])
      }
      const path = () => {
        ctx.beginPath()
        ctx.moveTo(pts[0]![0], pts[0]![1])
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]![0], pts[k]![1])
      }
      path()
      ctx.strokeStyle = 'rgba(230,57,43,0.8)'
      ctx.lineWidth = 6 * s
      ctx.stroke()
      path()
      ctx.strokeStyle = 'rgba(255,127,63,0.9)'
      ctx.lineWidth = 3.5 * s
      ctx.stroke()
      path()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.8 * s
      ctx.stroke()
    }
  }

  /** 소닉 찬스 알림 — 로프가 걸린 앵커에서 파열 링·방사선 + 화면 플래시 (멈춤 동안) */
  private drawChanceBurst(x: number, y: number, s: number, w: number, h: number, freezeLeft: number): void {
    const ctx = this.ctx
    const p = 1 - freezeLeft / TUNING.sonic.freezeSec // 0→1
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - p)})`
    ctx.fillRect(-20, -20, w + 40, h + 40)
    ctx.strokeStyle = COL.target
    ctx.lineWidth = 6 * s * (1 - p * 0.7)
    ctx.beginPath()
    ctx.arc(x, y, (20 + 180 * p) * s, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = COL.ink
    ctx.lineWidth = 1.5 * s
    ctx.stroke()
    ctx.strokeStyle = COL.target
    ctx.lineCap = 'round'
    ctx.lineWidth = 3 * s
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + p * 0.6
      const r0 = (40 + 120 * p) * s
      const r1 = r0 + (24 + 20 * (i % 2)) * s
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1)
      ctx.stroke()
    }
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
  private drawDeathCard(g: Game, best: number, w: number, h: number, u: number, deadT: number, ui: DeathUi): void {
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
      const sonicTag = g.sonic.uses > 0 ? `  ·  소닉 ×${g.sonic.uses}` : ''
      this.pill((isBest ? '신기록!' : `최고 ${best}m`) + sonicTag, 0, 0, `800 ${Math.round(14 * u)}px ${FONT}`, COL.target, COL.ink, 12 * u, 0, u, true)
      ctx.restore()
    }
    ctx.restore()

    // 버튼: 이어하기(광고)가 남았으면 주황 주 버튼 + 흰 "다시 하기", 다 썼으면 "다시 하기"만 주황
    const hp = clamp01((deadT - 1500) / 300)
    this.deathButtons = { continue: null, retry: null }
    if (hp > 0) {
      ctx.save()
      ctx.globalAlpha = hp
      const canContinue = ui.continuesLeft > 0
      const btnW = 260 * u
      const y1 = cardY + cardH + 44 * u
      if (canContinue) {
        const label = ui.adBusy ? '광고 불러오는 중…' : '광고 보고 이어하기'
        const pulse = ui.adBusy ? 1 : 1 + 0.03 * Math.sin(deadT / 260)
        ctx.save()
        ctx.translate(cx, y1)
        ctx.scale(pulse, pulse)
        if (ui.adBusy) ctx.globalAlpha = hp * 0.7
        this.chip(-btnW / 2, -26 * u, btnW, 52 * u, COL.player, 4 * u)
        ctx.fillStyle = '#ffffff'
        ctx.font = `900 ${Math.round(17 * u)}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const badge = `${ui.maxContinues - ui.continuesLeft + 1}/${ui.maxContinues}`
        const labelW = ctx.measureText(label).width
        const badgeW = 34 * u
        const gap = 8 * u
        const total = labelW + (ui.adBusy ? 0 : gap + badgeW)
        ctx.fillText(label, -total / 2 + labelW / 2, 1 * u)
        if (!ui.adBusy) {
          const bx = -total / 2 + labelW + gap
          this.chip(bx, -11 * u, badgeW, 22 * u, COL.target, 0)
          ctx.fillStyle = COL.ink
          ctx.font = `800 ${Math.round(12 * u)}px ${FONT}`
          ctx.fillText(badge, bx + badgeW / 2, 1 * u)
        }
        ctx.textBaseline = 'alphabetic'
        ctx.restore()
        this.deathButtons.continue = { x: cx - btnW / 2, y: y1 - 26 * u, w: btnW, h: 52 * u }
        const y2 = y1 + 62 * u
        this.pill('다시 하기', cx, y2, `800 ${Math.round(15 * u)}px ${FONT}`, COL.card, COL.inkSoft, 30 * u, 0, u, true, 44 * u)
        this.deathButtons.retry = { x: cx - 110 * u, y: y2 - 22 * u, w: 220 * u, h: 44 * u }
      } else {
        ctx.save()
        ctx.translate(cx, y1)
        const pulse = 1 + 0.03 * Math.sin(deadT / 260)
        ctx.scale(pulse, pulse)
        this.pill('다시 하기', 0, 0, `900 ${Math.round(17 * u)}px ${FONT}`, COL.player, '#ffffff', 34 * u, 4 * u, u, false, 50 * u)
        ctx.restore()
        this.deathButtons.retry = { x: cx - 110 * u, y: y1 - 25 * u, w: 220 * u, h: 50 * u }
      }
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
  private drawReadyScreen(w: number, h: number, u: number, now: number, pal: Palette): void {
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
    ctx.fillStyle = pal.forestFar
    ctx.fill()
    this.drawStartDemo({ x: cardX, y: cardY, w: cardW, h: cardH }, u, now, pal)
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
  private drawStartDemo(d: { x: number; y: number; w: number; h: number }, u: number, now: number, pal: Palette): void {
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
      ctx.strokeStyle = pal.vine
      ctx.lineWidth = 3.5 * u
      ctx.lineCap = 'round'
      ctx.stroke()
      this.drawLoop(a.x, a.y, 7 * u, u, pal.vine)
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
