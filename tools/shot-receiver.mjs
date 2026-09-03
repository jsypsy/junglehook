/**
 * 스크린샷 수신 서버 — 브라우저가 캔버스 dataURL을 POST하면 PNG로 저장한다.
 *
 * GRAC 제출용 캡처에 쓴다. 캡처를 브라우저 쪽에서 파일로 직접 내리면
 * 다운로드 대화상자·경로 문제가 생기고, 도구 응답으로 되돌리면 수 MB의
 * base64가 그대로 흐른다 — 그래서 로컬 수신구를 하나 연다.
 *
 *   node tools/shot-receiver.mjs [출력폴더] [포트]
 *   fetch('http://127.0.0.1:5300/shot?name=01-시작화면', {method:'POST', body: dataURL})
 */
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(process.argv[2] ?? 'assets/grac-스크린샷')
const PORT = Number(process.argv[3] ?? 5300)
mkdirSync(OUT, { recursive: true })

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') return res.end()
  if (req.method !== 'POST') return res.writeHead(405).end()

  const name = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('name') ?? 'shot')
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const b64 = body.slice(body.indexOf(',') + 1)
    const file = resolve(OUT, `${name}.png`)
    writeFileSync(file, Buffer.from(b64, 'base64'))
    console.log(`✓ ${name}.png  (${Buffer.from(b64, 'base64').length} B)`)
    res.end('ok')
  })
}).listen(PORT, '127.0.0.1', () => console.log(`수신 대기 :${PORT} → ${OUT}`))
