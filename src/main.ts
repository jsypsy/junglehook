/** 부트스트랩 — 고정 스텝 시뮬레이션 + 카메라 + 입력/렌더 연결 */
import { continueRun, continuesLeft, createGame, meters, press, releaseInput, selectTarget, sonicPendingReady, update } from './core/game'
import { Analytics } from './analytics'
import { TUNING, applyPreset } from './core/tuning'
import { bindPointer } from './input/pointer'
import { createPlatform } from './platform'
import { cancelHostTopInset } from './platform/adapter'
import { Renderer } from './render/renderer'
import { daysOf } from './core/season'
import { loadBest, loadSuperManual, saveBest, saveSuperManual } from './storage'

const SIM_STEP = 1 / 120
/** 사망 직후 오입력으로 바로 재시작되는 것 방지 (초) */
const RESTART_LOCK = 1.0 // 사망 연출(점수 카운트업 ~1.2s)을 보고 재시작하도록

const platform = createPlatform()
const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const renderer = new Renderer(ctx)
const analytics = new Analytics(platform)
/** 리워드 광고 진행 중 — 버튼 잠금·"불러오는 중" 표시 */
let adBusy = false

// A/B 프리셋: ?p=b4 등 (tuning.ts PRESETS). 게임 생성 전에 적용 — **개발 서버에서만.** 배포본에 남기면 `?p=nothreat`로
// 벽괴물을 끌 수 있어 GRAC 설명서의 "치트 코드 없음"과 어긋난다 (BUILD 40, D-023)
const preset = import.meta.env.DEV ? applyPreset(new URLSearchParams(location.search).get('p')) : null
let game = createGame(Date.now() >>> 0)
let best = loadBest()
let cam = { x: 0, zoom: 1 }
let deadAt = 0
let bestSaved = false
/** 이번 런의 신기록 — best 표시는 다음 판부터 갱신해 "신기록!" 오버레이가 유지되게 */
let pendingBest = 0
/** 슈퍼 매뉴얼 카드 — 처음 manualShows번만, "다시 안 보기"로 끔 (BUILD 24) */
const superManual = loadSuperManual()
/** 이번 찬스에서 매뉴얼 노출을 셌는가 (찬스마다 한 번만 카운트) */
let manualCounted = false
function superManualVisible(): boolean {
  return !superManual.hide && superManual.shown < TUNING.sonic.manualShows
}

// 개발 전용 디버그 훅 — 크롬 MCP 검수에서 게임 상태를 읽고 자동 플레이할 때 쓴다 (프로덕션 번들에서 제거됨)
if (import.meta.env.DEV) {
  ;(window as unknown as { __nara: unknown }).__nara = {
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
/** 계측용 뷰포트 실측 — 테스트 컨테이너와 라이브 앱의 화면 높이 차이를 눈이 아니라 숫자로 본다 */
function measureView(): { w: number; h: number; dpr: number; top: number } {
  const { w, h } = viewportSize()
  const insets = cancelHostTopInset(platform.safeArea(), screen.height, h)
  return { w, h, dpr: Math.round((Math.min(window.devicePixelRatio || 1, 2)) * 100) / 100, top: Math.round(insets.top) }
}

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
  // iOS 사파리의 `position: fixed`는 **레이아웃** 뷰포트 기준이라, 주소창이 떠 있으면 캔버스 윗부분이
  // 주소창 뒤로 밀려 HUD가 잘리고 아래엔 body 배경 띠가 남는다 (2026-08-31 실기기). 시각 뷰포트의
  // 오프셋만큼 내려 붙인다 — 토스 WebView는 주소창이 없어 둘 다 0이므로 영향 없다
  const vv = window.visualViewport
  canvas.style.top = `${Math.round(vv?.offsetTop ?? 0)}px`
  canvas.style.left = `${Math.round(vv?.offsetLeft ?? 0)}px`
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
  analytics.gameStart(false, performance.now(), measureView())
}

/** 이어하기: 리워드 광고 → 보상이면 마지막 앵커에서 재출발. 광고 실패·미보상이면 카드에 남는다 */
async function tryContinue(): Promise<void> {
  if (adBusy || game.phase !== 'dead' || continuesLeft(game) <= 0) return
  adBusy = true
  let rewarded = false
  try {
    rewarded = (await platform.showRewardedAd('continue')).rewarded
  } catch {
    rewarded = false
  }
  analytics.adReward('continue', rewarded)
  adBusy = false
  if (!rewarded || game.phase !== 'dead') return
  if (continueRun(game)) {
    bestSaved = false
    renderer.resetTrail()
    last = performance.now() // 광고 동안 흐른 시간을 한 프레임에 몰아넣지 않는다
    acc = 0
  }
}

bindPointer(
  canvas,
  (x, y) => {
    if (game.phase === 'dead') {
      if (performance.now() - deadAt < RESTART_LOCK * 1000) return
      const hit = renderer.hitDeathButton(x, y)
      if (hit === 'continue') void tryContinue()
      else if (hit === 'rank') void platform.openLeaderboard()
      else if (hit === 'retry' && !adBusy) restart()
      return
    }
    if (game.phase === 'ready') analytics.gameStart(false, performance.now(), measureView())
    if (sonicPendingReady(game) && manualCounted && renderer.hitSuperPrompt(x, y) === 'hide') {
      // 체크박스 토글 — 도전은 시작하지 않는다
      superManual.hide = !superManual.hide
      saveSuperManual(superManual)
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
        const isBest = m > best
        if (isBest) {
          saveBest(m)
          pendingBest = m
        }
        bestSaved = true
        analytics.gameOver({ score: m, isBest, continued: game.continues > 0, sonic: game.sonic.uses, cause: game.cause ?? 'fall' }, now)
        // 점수 제출은 플레이가 끝난 뒤, **그 판의 인메모리 값만** 보낸다 (저장값을 제출하지 않는다 — 보안 검토 C1).
        // ⚠️ 단위는 **일수**다 — 콘솔 리더보드 점수 단위가 「일」이라 미터를 그대로 보내면 숫자가 어긋난다
        // (B43에서 미터를 보내 "단위는 일인데 수치가 미터" 버그를 냈다). 저장·계측만 미터다(D-014)
        const submitted = daysOf(m)
        if (submitted > 0) void platform.submitScore(submitted)
      }
    } else {
      analytics.tick(now, meters(game))
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
  // 매뉴얼 노출 횟수 — 카드가 뜨는 찬스마다 한 번 센다 (도전 시작 뒤 리셋)
  const pendingReady = sonicPendingReady(game)
  const manual = pendingReady && superManualVisible()
  if (manual && !manualCounted) {
    manualCounted = true
    superManual.shown += 1
    saveSuperManual(superManual)
  }
  if (!pendingReady) manualCounted = false
  renderer.draw(
    game, cam, best, w, h, insets.top, preset,
    { continuesLeft: continuesLeft(game), maxContinues: TUNING.maxContinues, adBusy },
    { manual: manualCounted, hide: superManual.hide }, // 이번 찬스에 카드가 떴으면 도전 시작까지 유지 (체크를 되돌릴 수 있게)
  )
}

async function boot(): Promise<void> {
  await platform.init()
  platform.applyScreenPolicy()
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  // 주소창이 접히고 펴질 때는 resize가 아니라 scroll로 온다 (오프셋만 바뀐다)
  window.visualViewport?.addEventListener('scroll', resize)
  resize()
  requestAnimationFrame(frame)
}

void boot()
