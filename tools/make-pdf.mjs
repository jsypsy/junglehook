/**
 * 제출용 A4 PDF 생성 — HTML을 헤드리스 크롬으로 인쇄한다.
 *
 *   node tools/make-pdf.mjs "grac-제출/01_게임설명서_날아날아.html"
 *
 * - `{{IMG:파일명}}` 자리표시자를 `assets/grac-스크린샷/파일명.png`의
 *   base64 data URI로 치환한다 (외부 파일 참조 없는 단일 PDF가 되게)
 * - 슈팅스타 tools/make-pdf.mjs 그대로 (한줄팡 grac-보완 절차의 도구화)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'

const SRC = resolve(process.argv[2] ?? '')
const SHOTS = resolve(process.argv[3] ?? 'assets/grac-스크린샷')
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

if (!SRC || !existsSync(SRC)) throw new Error(`HTML을 찾지 못했다: ${SRC}`)
if (!CHROME) throw new Error('Chrome을 찾지 못했다')

let html = readFileSync(SRC, 'utf8')
let count = 0
html = html.replace(/\{\{IMG:([^}]+)\}\}/g, (_, name) => {
  const p = resolve(SHOTS, `${name}.png`)
  if (!existsSync(p)) throw new Error(`스크린샷 없음: ${p}`)
  count++
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`
})

const tmp = resolve(dirname(SRC), `.inline-${basename(SRC)}`)
const out = SRC.replace(/\.html$/, '.pdf')
writeFileSync(tmp, html, 'utf8')

const r = spawnSync(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${out}`,
    'file:///' + tmp.replace(/\\/g, '/'),
  ],
  { stdio: 'ignore', timeout: 120000 },
)
unlinkSync(tmp)
if (!existsSync(out)) throw new Error(`PDF 생성 실패 (exit ${r.status})`)
console.log(`✓ ${basename(out)}  (이미지 ${count}장 인라인)`)
