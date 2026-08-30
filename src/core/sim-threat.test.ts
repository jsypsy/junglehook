/**
 * 난이도 계측 봇 (BUILD 18~19). 평소엔 skip — `SIM=1 npx vitest run src/core/sim-threat.test.ts --disable-console-intercept`
 *
 * 봇 규칙(2026-08-30 계측과 동일): 매달린 채 앵커 기준 각도가 θ를 넘고 상승 중이면 놓는다. 자유 비행 중엔
 * 정점을 지나면(vel.y > -20) 누른다. θ가 클수록 "높게 놓고 불확실하면 매달리는" 안전 전략.
 * 슈퍼는 loopsToArm=999로 끈다. 결과는 docs/PROGRESS.md에 기록한다.
 */
import { it } from 'vitest'
import { createGame, meters, press, releaseInput, update } from './game'
import { TUNING } from './tuning'

const STEP = 1 / 120
// tsconfig에 node 타입이 없어 process를 직접 참조하지 않는다 (vitest 런타임에서만 존재)
const ENV = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const RUN = !!ENV.SIM

interface Result {
  sec: number
  m: number
  cause: string
}

function runBot(seed: number, thetaDeg: number, maxSec: number, pressMode: 'apex' | 'always'): Result {
  const g = createGame(seed)
  press(g)
  const theta = (thetaDeg * Math.PI) / 180
  for (let i = 0; i < 120 * maxSec && g.phase === 'playing'; i++) {
    const b = g.body
    if (b.anchor) {
      const ang = Math.atan2(b.pos.x - b.anchor.x, b.pos.y - b.anchor.y)
      if (ang > theta && b.vel.y < 0) releaseInput(g)
    } else if (!g.holding && (pressMode === 'always' || b.vel.y > -20)) {
      press(g)
    }
    update(g, STEP)
  }
  return { sec: g.timeSec, m: meters(g), cause: g.phase === 'dead' ? g.cause ?? '?' : 'alive' }
}

function table(label: string, thetas: number[], seeds: number[], maxSec: number, pressMode: 'apex' | 'always'): void {
  console.log(`\n== ${label} (${maxSec}s, press=${pressMode}, seeds=${seeds.length}) ==`)
  for (const th of thetas) {
    const rs = seeds.map((s) => runBot(s, th, maxSec, pressMode))
    const dead = rs.filter((r) => r.cause !== 'alive')
    const caught = rs.filter((r) => r.cause === 'caught').length
    const fall = rs.filter((r) => r.cause === 'fall').length
    const avg = (f: (r: Result) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length
    const secs = rs.map((r) => r.sec.toFixed(0)).join(' ')
    console.log(
      `θ=${th}°  사망 ${dead.length}/${rs.length} (잡힘 ${caught}·추락 ${fall})  평균 ${avg((r) => r.sec).toFixed(0)}s ${avg((r) => r.m).toFixed(0)}m  ${(avg((r) => r.m / Math.max(1, r.sec))).toFixed(1)}m/s  [${secs}]`,
    )
  }
}

it.skipIf(!RUN)('위협 유무별 봇 생존', () => {
  const T = TUNING as unknown as { sonic: { loopsToArm: number }; threat: Record<string, number | boolean> }
  T.sonic.loopsToArm = 999
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
  const thetas = [20, 25, 30, 35, 45, 65]
  const base = { ...T.threat }
  const mode = (ENV.SIM_PRESS as 'apex' | 'always') || 'apex'

  T.threat.enabled = false
  table('위협 없음 (BUILD 18)', thetas, seeds, 120, mode)

  Object.assign(T.threat, base, { enabled: true })
  table(`위협 기본 ${base.speedMin}→${base.speedMax}(+${base.speedPerCycle}/주기, cap ${base.speedCap}, lead ${base.maxLeadPx})`, thetas, seeds, 120, mode)

  const variants: Array<Record<string, number>> = [
    { maxLeadPx: 900 },
    { maxLeadPx: 1000, headStartPx: 600 },
    { maxLeadPx: 1000, headStartPx: 600, speedMin: 340, speedMax: 480 },
    { maxLeadPx: 1200, headStartPx: 700, speedMin: 340, speedMax: 480 },
  ]
  for (const v of variants) {
    Object.assign(T.threat, base, { enabled: true }, v)
    table(`위협 ${JSON.stringify(v)}`, thetas, seeds, 120, mode)
  }
  Object.assign(T.threat, base)
})
