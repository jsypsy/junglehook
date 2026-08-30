/**
 * 거리 → 계절 (D-010, 사용자 결정: 250m마다 봄→여름→가을→겨울, 시간대·비는 보류).
 * 순수 로직 — 렌더러는 여기서 받은 (이전 계절, 현재 계절, 보간 비율)로 팔레트를 섞는다.
 */
import { TUNING } from './tuning'

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]
export const SEASON_LABEL: Record<Season, string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' }

export interface SeasonState {
  /** 현재 계절 */
  season: Season
  /** 직전 계절 (경계 보간의 출발점) */
  prev: Season
  /** 0 = 직전 계절 색, 1 = 현재 계절 색. 경계에서 blendM 동안 올라간다 */
  blend: number
  /** 이번 계절 안에서의 진행도 0~1 (겨울 눈 세기 등) */
  progress: number
  /** 시작부터 몇 번째 계절 단계인가 (0 = 첫 봄) */
  stage: number
}

export function seasonAt(metersNow: number): SeasonState {
  const { stepM, blendM } = TUNING.season
  const m = Math.max(0, metersNow)
  const stage = Math.floor(m / stepM)
  const season = SEASONS[stage % SEASONS.length]!
  const prev = stage === 0 ? season : SEASONS[(stage - 1) % SEASONS.length]!
  const into = m - stage * stepM
  const blend = stage === 0 ? 1 : Math.min(1, into / blendM)
  return { season, prev, blend, progress: into / stepM, stage }
}

/**
 * 거리 → 일수 (사용자 결정 2026-08-30, D-014): 사계절 한 바퀴(stepM×4 = 1000m)가 1년 365일.
 * 250m 계절 하나 = 91일, 1일 ≈ 2.74m. 표시 전용 — 저장(best)·계측(score)은 미터 그대로
 */
export function daysOf(metersNow: number): number {
  return Math.floor((Math.max(0, metersNow) * 365) / (TUNING.season.stepM * 4))
}

/** 일수 표기 — "N일" */
export function dayLabel(days: number): string {
  return `${days}일`
}
