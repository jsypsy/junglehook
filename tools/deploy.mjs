/**
 * ait deploy 래퍼 (개발 전용, 의존성 없음).
 *
 * 배포 출력에서 intoss-private URL을 뽑아 tools/latest-deployment.json에
 * 남긴다 — 폰 북마크 페이지(tools/go.html)의 "이번 배포로 열기"가 이걸 읽는다.
 * 커스텀 스킴은 QR·주소창으로 직접 못 열어서 이 관문이 필요하다.
 *
 *   npm run ait:deploy  →  node tools/deploy.mjs
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = spawnSync('npx', ['ait', 'deploy'], { encoding: 'utf8' })
// 스피너가 stdout을 쓰므로 원문은 그대로 보여준다
process.stdout.write(run.stdout ?? '')
process.stderr.write(run.stderr ?? '')
if (run.status !== 0) process.exit(run.status ?? 1)

// 1) ANSI 이스케이프를 통째로 지운다 — 문자 필터만 쓰면 ESC[는 지워지고
//    "39m" 같은 꼬리가 URL에 눌어붙는다 (실제로 두 번 데였다)
// 2) 남은 것에서 URL 불가 문자(박스 테두리 │, 줄바꿈)를 걷어낸다
const clean = (run.stdout ?? '')
  .replace(/\x1b\[[0-9;]*m/g, '')
  .replace(/[^A-Za-z0-9:/?=&_.-]+/g, '')
const m = clean.match(/intoss-private:\/\/[\w?=&.-]+/)
if (!m) {
  console.error('배포는 됐지만 출력에서 URL을 찾지 못했다 — latest-deployment.json 미갱신')
  process.exit(0)
}

const here = dirname(fileURLToPath(import.meta.url))
writeFileSync(
  join(here, 'latest-deployment.json'),
  JSON.stringify({ url: m[0], deployedAt: new Date().toLocaleString('ko-KR') }, null, 2) + '\n',
)

// 폰 카메라 스캔용 QR — 카메라 → 토스 실행은 실기기로 확인됨 (2026-08-15).
// 파라미터 없는 주소는 미출시 상태에서 거부되므로 반드시 전체 URL을 담는다.
// (npx 경유는 레지스트리 확인으로 멈추는 일이 있어 API를 직접 쓴다)
const { default: QRCode } = await import('qrcode')
await QRCode.toFile(join(here, 'deploy-qr.png'), m[0], { width: 480 })
console.log(`\n최신 배포 기록: ${m[0]}`)
// 터미널에도 바로 띄운다 — 폰 카메라로 맥 화면을 찍으면 끝 (저장·복붙 불필요)
console.log(await QRCode.toString(m[0], { type: 'terminal', small: true }))
