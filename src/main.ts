/** 부트스트랩 — 고정 스텝 시뮬레이션 + 카메라 + 입력/렌더 연결 */
import { createGame, meters, press, releaseInput, selectTarget, update } from './core/game'
import { TUNING, applyPreset } from './core/tuning'
import { bindPointer } from './input/pointer'
import { createPlatform } from './platform'
import { cancelHostTopInset } from './platform/adapter'
import { Renderer } from './render/renderer'
import { loadBest, saveBest } from './storage'

const SIM_STEP = 1 / 120
/** 사망 직후 오입력으로 바로 재시작되는 것 방지 (초) */
const RESTART_LOCK = 1.0 // 사망 연출(점수 카운트업 ~1.2s)을 보고 재시작하도록

const platform = createPlatform()
const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const renderer = new Renderer(ctx)

// A/B 프리셋: ?p=b4 등 (tuning.ts PRESETS). 게임 생성 전에 적용
const preset = applyPreset(new URLSearchParams(location.search).get('p'))
let game = createGame(Date.now() >>> 0)
let best = loadBest()
let cam = { x: 0, zoom: 1 }
let deadAt = 0
let bestSaved = false
/** 이번 런의 신기록 — best 표시는 다음 판부터 갱신해 "신기록!" 오버레이가 유지되게 */
let pendingBest = 0

// 개발 전용 디버그 훅 — 크롬 MCP 검수에서 게임 상태를 읽고 자동 플레이할 때 쓴다 (프로덕션 번들에서 제거됨)
if (import.meta.env.DEV) {
  ;(window as unknown as { __jgh: unknown }).__jgh = {
    get game() {
      return game
    },
    meters: () => meters(game),
    selectTarget: () => selectTarget(game),
    preset,
    tuning: TUNING,
    /** 탭이 hidden이라 rAF가 멈춘 상태에서 한 틱 강제 구동 (크롬 MCP 검수용). dt 생략 시 렌더만 */
    stepOnce: (dt = 0) => tick(performance.now(), dt),
  }
}

/** 뷰포트 실측 — iOS 사파리는 툴바 상태에 따라 innerHeight와 CSS 100%가 어긋나므로 visualViewport를 우선 쓴다 */
function viewportSize(): { w: number; h: number } {
  const vv = window.visualViewport
  return {
    w: Math.round(vv?.width ?? window.innerWidth),
    h: Math.round(vv?.height ?? window.innerHeight),
  }
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const { w, h } = viewportSize()
  // CSS 크기를 픽셀로 못 박는다 — 100%에 맡기면 사파리에서 캔버스 밖(검은 영역)이 남는다
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function restart(): void {
  game = createGame(Date.now() >>> 0)
  press(game) // ready를 건너뛰고 바로 시작
  cam.x = 0
  bestSaved = false
  if (pendingBest > best) best = pendingBest
  renderer.resetTrail()
}

bindPointer(
  canvas,
  () => {
    if (game.phase === 'dead') {
      if (performance.now() - deadAt > RESTART_LOCK * 1000) restart()
      return
    }
    press(game)
  },
  () => releaseInput(game),
)

let last = performance.now()
let acc = 0
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  tick(now, dt)
  requestAnimationFrame(frame)
}

/** 한 틱: 시뮬레이션 + 카메라 + 렌더. dt를 밖에서 주므로 rAF가 멈춘 hidden 탭에서도 구동할 수 있다 */
function tick(now: number, dt: number): void {
  if (game.phase === 'playing') {
    acc += dt
    while (acc >= SIM_STEP) {
      update(game, SIM_STEP)
      acc -= SIM_STEP
    }
    if ((game.phase as string) === 'dead') {
      deadAt = now
      if (!bestSaved) {
        const m = meters(game)
        if (m > best) {
          saveBest(m)
          pendingBest = m
        }
        bestSaved = true
      }
    }
  }
  // 카메라: 빠를수록 줌아웃(앞을 더 보여준다), 플레이어를 화면 32% 지점에, 부드럽게 추적
  const z = TUNING.camZoom
  const speed = Math.hypot(game.body.vel.x, game.body.vel.y)
  const zt = Math.min(1, Math.max(0, (speed - z.speedLo) / (z.speedHi - z.speedLo)))
  const targetZoom = game.phase === 'playing' ? 1 - (1 - z.min) * zt : 1
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 3)
  const { w, h } = viewportSize()
  const s = (h / TUNING.viewH) * cam.zoom
  const targetCam = game.body.pos.x - (w * 0.32) / s
  cam.x += (targetCam - cam.x) * Math.min(1, dt * 8)
  const insets = cancelHostTopInset(platform.safeArea(), screen.height, h)
  renderer.draw(game, cam, best, w, h, insets.top, preset)
}

async function boot(): Promise<void> {
  await platform.init()
  platform.applyScreenPolicy()
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  resize()
  requestAnimationFrame(frame)
}

void boot()
