/**
 * 앱인토스 콘솔 "노출 정보" 이미지 일괄 제작 — 헤드리스 크롬 + CDP. (grac-shots.mjs의 촬영 골격을 그대로 쓴다)
 *
 *   node tools/store-shots.mjs [출력폴더=assets/store]
 *
 * 만드는 것 (콘솔 규격, 1px이라도 다르면 업로드가 거부된다):
 * - 세로 스크린샷 636×1048 — 게임을 318×524 CSS px · dpr 2로 **직접 렌더**한다. 게임은 세로 높이(viewH=749) 기준으로
 *   배율을 잡고 가로는 월드가 더 보이는 구조라, 어떤 크기로 띄워도 그 크기 그대로 그린다. 폰 캡처를 축소하지 않는다
 * - 썸네일용 컷 340×630 — 170×315 CSS · dpr 2. 썸네일 안에 1:1로 얹는다
 * - 로고 600×600(라이트·다크) · 썸네일 1932×828 — tools/store-compose.html 캔버스를 그 크기 그대로 캡처
 *
 * 장면 연출은 grac-shots.mjs와 같은 `window.__nara` 훅 (HANDOFF "순간이동 캡처 함정" 참고).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = resolve(process.argv[2] ?? 'assets/store')
const CUTS = resolve(process.env.TMPDIR ?? '.', 'nara-store-cuts')
const PORT = 5199
const CDP = 9333
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

const HELPERS = `
  window.__shot = (() => {
    const N = window.__nara
    const T = N.tuning
    T.sonic.chanceStepM = 1e9
    const g = () => N.game
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
    function hang(m) {
      tp(m)
      const G = g()
      const x = G.body.pos.x
      const a = G.field.anchors.find((a) => a.x >= x + 40) ?? G.field.anchors[G.field.anchors.length - 1]
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
      threatGap(px) { const G = g(); G.threatX = G.body.pos.x - px },
      wall(m, px = 250) { hang(m); const G = g(); T.threat.speedCap = 0; G.threatX = G.body.anchor.x - px },
      wallOff() { T.threat.speedCap = 560 },
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

/** 세로 스크린샷 6장 — 첫 장이 목록에서 가장 크게 보인다 */
const VERTICAL = [
  { file: '세로-1-매달리기', js: '__shot.hang(28)', wait: 900 },
  { file: '세로-2-날아가기', js: '__shot.hang(60)', wait: 1100, then: '__shot.release()', thenWait: 280 },
  { file: '세로-3-슈퍼대시', js: '__shot.dash(255)', wait: 900 }, // 여름 하늘에서 — 대시는 초당 50m라 기다린 만큼 앞으로 간다
  { file: '세로-4-벽괴물', js: '__shot.wall(430)', wait: 2050, then: '__shot.wallOff()', thenWait: 0 },
  { file: '세로-5-겨울', js: '__shot.hang(840)', wait: 900 },
  { file: '세로-6-이어하기', js: '__shot.die(370)', wait: 4200 }, // 결과 카드가 다 올라온 뒤 (2.4초면 "끝" 별만 떠 있다)
]
/** 썸네일 컷 3장 (봄 매달리기 · 슈퍼 대시 · 가을) */
const CUT = [
  { file: '컷-1', js: '__shot.hang(28)', wait: 900 },
  { file: '컷-2', js: '__shot.dash(255)', wait: 900 },
  { file: '컷-3', js: '__shot.hang(590)', wait: 900 },
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
    '--allow-file-access-from-files', // 합성 페이지(file://)가 컷 PNG(file://)를 읽는다
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
    const r = await S('Runtime.evaluate', { expression, awaitPromise: false, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`${label}: ${JSON.stringify(r.exceptionDetails)}`)
    return r.result?.value
  }
  await S('Page.enable')
  await S('Runtime.enable')
  mkdirSync(OUT, { recursive: true })
  mkdirSync(CUTS, { recursive: true })

  /** 게임을 (w×h CSS, dpr) 로 띄우고 장면 목록을 찍는다 */
  async function shootGame(w, h, dpr, scenes, dir) {
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: true })
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
    await sleep(2500)
    await evalJs("localStorage.setItem('nara.v1.best','1234'); localStorage.setItem('nara.v1.super-manual2','1')", 'seed')
    await S('Page.reload')
    await sleep(2500)
    await evalJs(HELPERS, 'helpers')
    for (const s of scenes) {
      await evalJs(s.js, s.file)
      await sleep(s.wait)
      if (s.then) {
        await evalJs(s.then, s.file + ' (then)')
        await sleep(s.thenWait ?? 200)
      }
      await evalJs(
        "document.querySelectorAll('body > div').forEach(d => { if (getComputedStyle(d).position === 'fixed') d.style.display = 'none' })",
        'hide-badges',
      )
      // 헤드리스가 대기 중 프레임을 새로 올리지 않아 첫 캡처는 장면 초반의 낡은 프레임이 나온다 — 한 번 찍어 프레임을 밀고 다시 찍는다
      await S('Page.captureScreenshot', { format: 'png' })
      await sleep(150)
      const shot = await S('Page.captureScreenshot', { format: 'png' })
      writeFileSync(resolve(dir, `${s.file}.png`), Buffer.from(shot.data, 'base64'))
      console.log(`✓ ${s.file}.png  (${w * dpr}×${h * dpr})`)
      if (process.env.DEBUG) console.log(await evalJs("(g=>JSON.stringify({phase:g.phase,cause:g.cause,pos:g.body.pos,threatX:g.threatX,dist:g.distancePx,son:g.sonic}))(__nara.game)", 'dbg'))
    }
  }

  /** 합성 페이지를 캔버스 크기 그대로 캡처 */
  async function compose(kind, w, h, file, extra = '') {
    const url = pathToFileURL(resolve('tools/store-compose.html')).href + `?kind=${kind}${extra}`
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await S('Page.navigate', { url })
    for (let i = 0; i < 40; i++) {
      await sleep(250)
      if (await evalJs('window.__done === true', 'done')) break
    }
    const shot = await S('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } })
    writeFileSync(resolve(OUT, `${file}.png`), Buffer.from(shot.data, 'base64'))
    console.log(`✓ ${file}.png  (${w}×${h})`)
  }

  await shootGame(318, 524, 2, VERTICAL, OUT)
  await shootGame(170, 315, 2, CUT, CUTS)
  const cutQ = CUT.map((s, i) => `&cut${i + 1}=${encodeURIComponent(pathToFileURL(resolve(CUTS, s.file + '.png')).href)}`).join('')
  await compose('thumb', 1932, 828, '썸네일-1932x828', cutQ)
  await compose('logo', 600, 600, '로고-600')
  await compose('logo-dark', 600, 600, '로고-600-다크모드')
  c.close()
} finally {
  bye()
}
