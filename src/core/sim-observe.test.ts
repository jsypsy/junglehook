// 밸런싱 계측 파일 — 평소엔 skip, 튜닝할 때 .skip을 떼고 --disable-console-intercept로 돌린다
import { it } from 'vitest'
import { createGame, meters, press, releaseInput, update } from './game'

const STEP = 1 / 120
it.skip('봇 궤적 관찰', () => {
  const g = createGame(42)
  press(g)
  let lastLog = -1
  for (let i = 0; i < 120 * 30 && g.phase === 'playing'; i++) {
    const b = g.body
    if (b.anchor) {
      // 낮을수록 더 강하게 상승 중일 때만 놓는다 (고도 회복 우선)
      const need = b.pos.y > 380 ? -350 : -80
      if (b.pos.x > b.anchor.x && b.vel.y < need && b.vel.x > 150) releaseInput(g)
    } else if (!g.holding && b.vel.y > -20) {
      press(g)
    }
    update(g, STEP)
    const sec = Math.floor(g.timeSec * 4) / 4
    if (sec !== lastLog) {
      lastLog = sec
      console.log(
        `t=${sec.toFixed(2)} pos=(${b.pos.x.toFixed(0)},${b.pos.y.toFixed(0)}) vel=(${b.vel.x.toFixed(0)},${b.vel.y.toFixed(0)}) anchor=${b.anchor ? 'Y' : 'n'} hold=${g.holding} tgt=${g.targetIdx}`,
      )
    }
  }
  console.log(`끝: phase=${g.phase} t=${g.timeSec.toFixed(1)}s ${meters(g)}m`)
})
