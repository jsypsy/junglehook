/** 부트스트랩 — 고정 스텝 시뮬레이션 + 카메라 + 입력/렌더 연결 */
import { createGame, meters, press, releaseInput, update } from './core/game'
import { TUNING } from './core/tuning'
import { bindPointer } from './input/pointer'
import { createPlatform } from './platform'
import { cancelHostTopInset } from './platform/adapter'
import { Renderer } from './render/renderer'
import { loadBest, saveBest } from './storage'

const SIM_STEP = 1 / 120
/** 사망 직후 오입력으로 바로 재시작되는 것 방지 (초) */
const RESTART_LOCK = 0.5

const platform = createPlatform()
const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const renderer = new Renderer(ctx)

let game = createGame(Date.now() >>> 0)
let best = loadBest()
let cam = { x: 0 }
let deadAt = 0
let bestSaved = false
/** 이번 런의 신기록 — best 표시는 다음 판부터 갱신해 "신기록!" 오버레이가 유지되게 */
let pendingBest = 0

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
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
  // 카메라: 플레이어를 화면 32% 지점에, 부드럽게 추적
  const s = window.innerHeight / TUNING.viewH
  const targetCam = game.body.pos.x - (window.innerWidth * 0.32) / s
  cam.x += (targetCam - cam.x) * Math.min(1, dt * 8)
  const insets = cancelHostTopInset(platform.safeArea(), screen.height, window.innerHeight)
  renderer.draw(game, cam, best, window.innerWidth, window.innerHeight, insets.top)
  requestAnimationFrame(frame)
}

async function boot(): Promise<void> {
  await platform.init()
  platform.applyScreenPolicy()
  window.addEventListener('resize', resize)
  resize()
  requestAnimationFrame(frame)
}

void boot()
