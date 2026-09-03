/**
 * 최신 배포 URL을 내 아이메시지로 보낸다 (개발 전용, 의존성 없음, macOS 전용).
 *
 *   npm run ait:send            → tools/latest-deployment.json의 URL을 전송
 *   npm run ait:send -- 문구     → 앞에 붙일 문구 지정 (기본: "날아날아 테스트 배포")
 *
 * 수신자: 환경변수 JGH_IMESSAGE_TO, 없으면 tools/imessage.local.json의 {"to": "..."} (gitignore —
 * 저장소가 공개라 전화번호를 커밋하지 않는다). 커스텀 스킴(intoss-private://)이라 폰에서 링크를
 * 탭하면 토스가 열린다.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { url, deployedAt } = JSON.parse(readFileSync(join(here, 'latest-deployment.json'), 'utf8'))
const label = process.argv.slice(2).join(' ') || '날아날아 테스트 배포'
const localCfg = join(here, 'imessage.local.json')
const to =
  process.env.JGH_IMESSAGE_TO ||
  (existsSync(localCfg) ? JSON.parse(readFileSync(localCfg, 'utf8')).to : undefined)
if (!to) {
  console.error('수신자가 없다 — JGH_IMESSAGE_TO=<전화번호|Apple ID> 또는 tools/imessage.local.json {"to": "..."}')
  process.exit(1)
}

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
