/**
 * 최신 배포 URL을 내 아이메시지로 보낸다 (개발 전용, 의존성 없음, macOS 전용).
 *
 *   npm run ait:send            → tools/latest-deployment.json의 URL을 전송
 *   npm run ait:send -- 문구     → 앞에 붙일 문구 지정 (기본: "정글훅 테스트 배포")
 *
 * 수신자는 이 맥의 메시지 앱에 로그인된 iMessage 계정 자신 — 폰의 메시지 앱에 바로 뜬다.
 * 커스텀 스킴(intoss-private://)이라 폰에서 링크를 탭하면 토스가 열린다.
 * 다른 수신자로 보내려면 JGH_IMESSAGE_TO=<전화번호 또는 Apple ID> 환경변수.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { url, deployedAt } = JSON.parse(readFileSync(join(here, 'latest-deployment.json'), 'utf8'))
const label = process.argv.slice(2).join(' ') || '정글훅 테스트 배포'
const to = process.env.JGH_IMESSAGE_TO || 'jsypsy@gmail.com'

const script = `
on run argv
  set theTo to item 1 of argv
  set theBody to item 2 of argv
  tell application "Messages"
    set acct to first account whose service type is iMessage and enabled is true
    set target to participant theTo of acct
    send theBody to target
  end tell
end run`
const body = `${label} (${deployedAt}) — 탭해서 토스로 열기:\n${url}`
const r = spawnSync('osascript', ['-', to, body], { input: script, encoding: 'utf8' })
if (r.status !== 0) {
  console.error(r.stderr || '전송 실패')
  process.exit(r.status ?? 1)
}
console.log(`아이메시지 전송 → ${to}\n${url}`)
