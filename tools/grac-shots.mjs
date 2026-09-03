/**
 * GRAC 제출용 스크린샷 촬영 — 헤드리스 크롬 + CDP. (슈팅스타 tools/grac-shots.mjs를 날아날아 훅에 맞게 옮김)
 *
 *   node tools/grac-shots.mjs [출력폴더]
 *
 * - 393×749 CSS px · devicePixelRatio 3 = 앱인토스 실측 뷰포트, 실제 폰과 같은 논리 해상도
 * - 장면 연출은 `src/main.ts`의 DEV 전용 `window.__nara` 훅으로 게임 상태를 직접 만든다.
 *   HANDOFF "순간이동 캡처 함정" 그대로: ① 매달린 몸은 anchor를 풀고 옮긴다 ② 찬스는 chanceStepM=1e9로 밀어두고
 *   찬스 장면은 sonic 플래그를 직접 켠다 ③ 저장값(최고기록)은 모듈 로드 때 읽으므로 localStorage를 심은 뒤 reload
 * - 헤드리스 크롬은 rAF가 실시간으로 돌므로 카메라 추적·연출은 wait(ms)로 실제 시간을 흘려 잡는다
 * - 파일명은 01_게임설명서의 {{IMG:...}} 자리표시자와 1:1 — 어긋나면 PDF에 빈 칸이 생긴다
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(process.argv[2] ?? 'assets/grac-스크린샷')
const PORT = 5199
const CDP = 9333
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

/** 페이지 안에 심는 장면 도우미 — 미터 단위로 순간이동, 매달리기, 위협 거리 조절 */
const HELPERS = `
  window.__shot = (() => {
    const N = window.__nara
    const T = N.tuning
    T.sonic.chanceStepM = 1e9 // 찬스가 저절로 터지지 않게 (HANDOFF 함정 ②)
    const g = () => N.game
    /** m 지점으로 순간이동 — 자유 비행 상태, 위협은 고무줄 한계(1000px)만큼 뒤. 죽은 뒤에도 다시 살린다 */
    function tp(m, y = 300) {
      const x = T.startPos.x + m * T.pxPerMeter
      const G = g()
      G.phase = 'playing'
      G.cause = null
      G.body.anchor = null
      G.body.ropeLen = 0
      G.body.pos = { x, y }
      G.body.vel = { x: 380, y: -120 }
      G.distancePx = Math.max(0, x - T.startPos.x)
      G.threatX = x - T.threat.maxLeadPx
      G.holding = false
      Object.assign(G.sonic, { chance: false, pending: false, armed: false, dashing: false, freezeT: 0, loops: 0, spin: 0, uses: 0 })
      G.field.ensure(x + T.viewW * 3)
    }
    /** m 지점 앞의 첫 잎에 로프를 직접 건다 — 잎 배치가 시드 랜덤이라 "닿는 잎이 없어 추락"을 피한다 */
    function hang(m) {
      tp(m)
      const G = g()
      const x = G.body.pos.x
      const a = G.field.anchors.find((a) => a.x >= x + 40) ?? G.field.anchors[G.field.anchors.length - 1]
      // 잎 왼쪽 아래 45°쯤에서 시작 — 앞으로 흔들리는 순간을 잡는다
      G.body.pos = { x: a.x - 150, y: a.y + 150 }
      G.body.vel = { x: 420, y: 0 }
      G.body.anchor = { x: a.x, y: a.y }
      G.body.ropeLen = Math.hypot(150, 150)
      G.distancePx = Math.max(0, G.body.pos.x - T.startPos.x)
      G.threatX = G.body.pos.x - T.threat.maxLeadPx
      G.holding = true
    }
    return {
      tp,
      hang,
      release() { g().holding = false },
      /** 위협을 플레이어 px 뒤에 둔다 (경고 쉐브론 장면용) */
      threatGap(px) { const G = g(); G.threatX = G.body.pos.x - px },
      /** 벽 장면: 위협을 잎 기준 px 뒤에 세워 두고(속도 0) 스윙이 뒤로 돌아올 때 벽이 화면에 들어오게 한다.
       *  스윙 반경(212px)보다 뒤라 잡히지 않는다 — 실제 게임과 같은 그림, 판정만 멈춤 */
      wall(m, px = 250) { hang(m); const G = g(); T.threat.speedCap = 0; G.threatX = G.body.anchor.x - px },
      wallOff() { T.threat.speedCap = 560 },
      chanceCard() { Object.assign(g().sonic, { chance: true, pending: true, freezeT: 0, sweetCenter: 0.5 }) },
      gauge() { Object.assign(g().sonic, { chance: true, pending: false, armed: true, loops: 3, spin: Math.PI * 6.2, gaugeT: 0.55, sweetCenter: 0.5 }) },
      dash(m) {
        tp(m, T.sonic.cruiseY)
        const G = g()
        Object.assign(G.sonic, { dashing: true, dashLeftPx: T.sonic.dashMeters * T.pxPerMeter, uses: 1 })
        G.body.vel = { x: T.sonic.dashSpeed, y: 0 }
      },
      die(m, continues = 0) { tp(m); const G = g(); G.continues = continues; G.body.pos.y = T.killY + 50 },
    }
  })()
`

/** 촬영 장면 — js를 실행하고 wait(ms)만큼 실제 시간을 흘린 뒤 화면을 뜬다 */
const SCENES = [
  { file: '01-시작화면', js: '', wait: 1200 },
  { file: '02-매달리기', js: '__shot.hang(28)', wait: 900 },
  { file: '03-날아가기', js: '__shot.hang(60)', wait: 1100, then: '__shot.release()', thenWait: 280 },
  { file: '04-여름', js: '__shot.hang(330)', wait: 900 },
  { file: '05-가을', js: '__shot.hang(590)', wait: 900 },
  { file: '06-겨울', js: '__shot.hang(840)', wait: 900 },
  { file: '07-벽괴물-경고', js: '__shot.hang(410)', wait: 800, then: '__shot.threatGap(400)', thenWait: 120 },
  { file: '08-벽괴물', js: '__shot.wall(430)', wait: 2050, then: '__shot.wallOff()', thenWait: 0 },
  { file: '09-슈퍼찬스-카드', js: '__shot.hang(210)', wait: 800, then: '__shot.chanceCard()', thenWait: 700 },
  { file: '10-슈퍼충전-게이지', js: '__shot.hang(215)', wait: 800, then: '__shot.gauge()', thenWait: 1700 }, // SUPER! 배지(1.4초)가 사라진 뒤
  { file: '11-슈퍼대시', js: '__shot.dash(230)', wait: 1300 },
  { file: '12-게임오버-이어하기', js: '__shot.die(370)', wait: 2400 },
  { file: '13-게임오버-다시하기', js: '__shot.die(1120, 2)', wait: 2400 },
  // 소리 끄기 — 저장값은 모듈 로드 때 읽으므로 심고 reload. 마지막 장면이라 뒤에 영향 없다
  { file: '14-소리끄기', js: "localStorage.setItem('nara.v1.muted','1'); location.reload()", wait: 2500 },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return await r.json().catch(() => ({}))
    } catch {
      /* 아직 안 떴다 */
    }
    await sleep(500)
  }
  throw new Error(`시간 초과: ${url}`)
}

/** 최소 CDP 클라이언트 — Node 24의 내장 WebSocket만 쓴다 */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  let id = 0
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result)
  })
  return {
    ready,
    send(method, params = {}, sessionId) {
      const n = ++id
      return new Promise((res, rej) => {
        pending.set(n, { res, rej })
        ws.send(JSON.stringify({ id: n, method, params, sessionId }))
      })
    },
    close: () => ws.close(),
  }
}

const vite = spawn(
  process.execPath,
  // vite 8은 기본이 IPv6 localhost 바인딩이라 127.0.0.1 접속이 거부된다 (맥에서 확인)
  ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' },
)
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${CDP}`,
    '--disable-gpu',
    '--mute-audio',
    '--no-first-run',
    '--user-data-dir=' + resolve(process.env.TMPDIR ?? process.env.TEMP ?? '.', 'nara-shots-profile'),
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const bye = () => {
  vite.kill()
  chrome.kill()
}
process.on('exit', bye)

try {
  if (!CHROME) throw new Error('Chrome을 찾지 못했다')
  await waitFor(`http://127.0.0.1:${PORT}/`)
  const ver = await waitFor(`http://127.0.0.1:${CDP}/json/version`)
  const c = cdp(ver.webSocketDebuggerUrl)
  await c.ready

  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true })
  const S = (m, p) => c.send(m, p, sessionId)
  const evalJs = async (expression, label) => {
    const r = await S('Runtime.evaluate', { expression, awaitPromise: false })
    if (r.exceptionDetails) throw new Error(`${label}: ${JSON.stringify(r.exceptionDetails)}`)
  }

  await S('Page.enable')
  await S('Runtime.enable')
  // 실제 폰과 같은 조건 — 앱인토스 실측 뷰포트(393×749) · dpr 3
  await S('Emulation.setDeviceMetricsOverride', { width: 393, height: 749, deviceScaleFactor: 3, mobile: true })
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(2500)
  // 최고 기록을 심어 HUD의 최고 칩을 실제 플레이처럼 만든다 (저장은 미터, 표시는 일수 — 1234m = 450일)
  await evalJs("localStorage.setItem('nara.v1.best','1234'); localStorage.removeItem('nara.v1.super-manual2'); localStorage.setItem('nara.v1.muted','0')", 'seed')
  await S('Page.reload')
  await sleep(2500)
  await evalJs(HELPERS, 'helpers')

  mkdirSync(OUT, { recursive: true })
  for (const s of SCENES) {
    if (s.js) await evalJs(s.js, s.file)
    await sleep(s.wait)
    if (s.then) {
      await evalJs(s.then, s.file + ' (then)')
      await sleep(s.thenWait ?? 200)
    }
    // 컴포지터 캡처는 DOM 오버레이도 찍으므로 dev 진단 배지를 숨긴다
    await evalJs(
      "document.querySelectorAll('body > div').forEach(d => { if (getComputedStyle(d).position === 'fixed') d.style.display = 'none' })",
      'hide-badges',
    )
    const shot = await S('Page.captureScreenshot', { format: 'png' })
    writeFileSync(resolve(OUT, `${s.file}.png`), Buffer.from(shot.data, 'base64'))
    console.log(`✓ ${s.file}.png`)
  }
  c.close()
} finally {
  bye()
}
