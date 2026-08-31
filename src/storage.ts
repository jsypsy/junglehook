/**
 * 로컬 저장 — 전부 try/catch로 감싼다.
 * WebView 프라이빗 모드처럼 localStorage가 아예 막힌 환경이 실제로 있고,
 * 거기서 게임이 죽으면 안 된다.
 *
 * ⚠️ **오리진이 바뀌면 localStorage는 날아간다.** 앱인토스 미니앱 주소는
 * 실제로 한 번 바뀐 적이 있다(2026-08-25, `*.apps.tossmini.com`) —
 * 그래서 중요한 값은 `platform.kvSet`으로 플랫폼 저장소에도 미러링한다.
 * 미러링 시에도 아래 키를 그대로 쓴다
 */

/** 키 접두어 — 앱 이름이 확정되면 함께 바꾼다 (마이그레이션 필요) */
const NS = 'jgh.v1'

export const BEST_KEY = `${NS}.best`
export const SAVE_KEY = `${NS}.save`
const MUTED_KEY = `${NS}.muted`
const TUTORIAL_KEY = `${NS}.tutorial-done`
// v2: BUILD 27 — 옛 키에 저장된 hide=true(오조작으로 켜졌을 수 있다)를 한 번 버린다
const SUPER_MANUAL_KEY = `${NS}.super-manual2`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장 실패는 치명적이지 않다 — 이번 판을 못 이어갈 뿐이다
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 무시
  }
}

export function loadBest(): number {
  const n = Number(read(BEST_KEY))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function saveBest(score: number): void {
  write(BEST_KEY, String(score))
}

/** 검증은 core 쪽 역직렬화가 담당한다 — 여기서는 파싱까지만 */
export function loadSavedGame(): unknown {
  const raw = read(SAVE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveGame(data: unknown): void {
  write(SAVE_KEY, JSON.stringify(data))
}

export function clearSavedGame(): void {
  remove(SAVE_KEY)
}

export function isMuted(): boolean {
  return read(MUTED_KEY) === '1'
}

export function saveMuted(muted: boolean): void {
  write(MUTED_KEY, muted ? '1' : '0')
}

export function isTutorialDone(): boolean {
  // 저장이 안 되는 환경이면 매번 튜토리얼이 뜨는 것보다 건너뛰는 쪽이 낫다
  const v = read(TUTORIAL_KEY)
  return v === null ? !canPersist() : v === '1'
}

export function markTutorialDone(): void {
  write(TUTORIAL_KEY, '1')
}

/** 저장이 실제로 되는 환경인지 — 한 번 써보고 판단한다 */
function canPersist(): boolean {
  try {
    const probe = `${NS}.probe`
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** 슈퍼 매뉴얼 카드 — 보여준 횟수와 "다시 안 보기" (BUILD 24) */
export interface SuperManual {
  shown: number
  hide: boolean
}

export function loadSuperManual(): SuperManual {
  const raw = read(SUPER_MANUAL_KEY)
  // 저장이 안 되는 환경에서도 **보여준다** — 카드는 슈퍼의 유일한 설명이라, 조용히 영원히 사라지는 쪽이
  // "다시 안 보기를 누르기 전까진 항상"(BUILD 26)이라는 의도와 정반대다
  if (!raw) return { shown: 0, hide: false }
  try {
    const v = JSON.parse(raw) as Partial<SuperManual>
    return { shown: Number(v.shown) || 0, hide: v.hide === true }
  } catch {
    return { shown: 0, hide: false }
  }
}

export function saveSuperManual(v: SuperManual): void {
  write(SUPER_MANUAL_KEY, JSON.stringify(v))
}
