/**
 * 부트스트랩 — 지금은 스캐폴딩 확인용 플레이스홀더 화면.
 * 게임 구현이 시작되면 core/render를 붙이면서 교체한다.
 */
import { createPlatform } from './platform'
import { cancelHostTopInset } from './platform/adapter'
import { BUILD } from './version'

const platform = createPlatform()
const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
}

function draw(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  const insets = cancelHostTopInset(platform.safeArea(), screen.height, window.innerHeight)
  ctx.fillStyle = '#0b1f14'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#2fbf71'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('정글훅', w / 2, h / 2 - 8)
  ctx.fillStyle = '#9adbb8'
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText('스캐폴딩 확인용 화면', w / 2, h / 2 + 18)
  // 빌드 표식 — 폰 캐시 사고 방지 (슈팅스타에서 실제로 겪음)
  ctx.textAlign = 'right'
  ctx.fillText(`B${BUILD}`, w - 8, h - insets.bottom - 8)
}

async function boot(): Promise<void> {
  await platform.init()
  platform.applyScreenPolicy()
  window.addEventListener('resize', resize)
  platform.onSafeAreaChange(() => draw())
  resize()
}

void boot()
