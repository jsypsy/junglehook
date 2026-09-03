/**
 * 게임 이벤트 계측.
 *
 * 앱인토스 콘솔의 **핵심 지표(활성·전환)** 는 우리가 보낸 이벤트를 재료로 쓴다.
 * 플랫폼이 자동으로 남기는 로그(진입·체류·광고 재생·리더보드)만으로는
 * "게임을 실제로 즐겼는가"를 알 수 없다 — 한줄팡에서 출시 후에야 이걸 알고
 * 뒤늦게 붙였다. 이번에는 처음부터 넣고 간다.
 *
 * 원칙 셋:
 * - **개인정보 없음.** 점수 같은 게임 수치만 보낸다
 * - **fire-and-forget.** 전송 실패가 게임 진행을 막지 않는다
 * - **판당 1회로 묶는다.** 매 조작마다 남기면 하루 수만 건이 되고 지표도 못 만든다
 *
 * ⚠️ 이벤트는 **배포된 뒤에야** 콘솔 로그 카탈로그에 나타난다.
 * 등록 자체(핵심 지표 만들기)는 콘솔 웹에서 수동으로 해야 한다 — MCP에 조회
 * tool은 있어도 생성 tool이 없다
 */
import type { EventParams, PlatformAdapter } from './platform/adapter'

/** 로그 이름 접두어 — 플랫폼 자동 로그(`appsintoss_*`)와 섞이지 않게 한다 */
const PREFIX = 'nara_'

/**
 * "몰입했다"고 볼 플레이 시간(초). 장르가 정해지면 실제 분포를 보고 조정한다 —
 * 대표 전환 지표로 쓰려면 너무 흔해도 너무 희소해도 안 된다
 */
export const DEEP_PLAY_SEC = 60

/**
 * 점수를 구간으로 접는다.
 *
 * 콘솔 핵심 지표는 파라미터 **값**으로 조건을 걸기 때문에 원시 점수(사실상
 * 무한한 종류)로는 조건을 만들 수 없다. 밴드는 그대로 조건이 된다.
 * 원시 점수도 `score`로 같이 보내므로 분포 분석은 그쪽을 쓴다.
 * 구간 경계는 장르 확정 후 실제 점수 스케일에 맞춰 다시 잡는다
 */
export function scoreBand(score: number): string {
  if (score < 1000) return 'u1k'
  if (score < 3000) return '1k'
  if (score < 10_000) return '3k'
  if (score < 30_000) return '10k'
  return '30k+'
}

/**
 * 한 판의 집계. `core/`는 시간을 모른다는 원칙(CLAUDE.md)을 지키려고
 * 플레이 시간은 여기서 센다
 */
export class Analytics {
  private startedAt = 0
  /** 판당 1회만 보내기 위한 표식 */
  private deepSent = false

  constructor(private platform: PlatformAdapter) {}

  private send(name: string, params: EventParams = {}): void {
    this.platform.track(PREFIX + name, params)
  }

  /** 시작 화면을 지나 판이 시작될 때 — 콘솔 '활성 지표'의 후보다 */
  gameStart(resumed: boolean, now: number): void {
    this.startedAt = now
    this.deepSent = false
    this.send('game_start', { resumed })
  }

  /**
   * 매 프레임 불러도 되는 몰입 체크 — 임계 시간을 처음 넘는 순간 한 번만 보낸다.
   * 전송 조건이 여기 모여 있어야 판당 1회 보장이 한곳에서 지켜진다
   */
  tick(now: number, score: number): void {
    if (this.deepSent || this.startedAt === 0) return
    if (now - this.startedAt < DEEP_PLAY_SEC * 1000) return
    this.deepSent = true
    this.send('deep_play', { sec: DEEP_PLAY_SEC, score })
  }

  /** 게임오버 — 판 전체를 요약하는 유일한 이벤트 */
  gameOver(info: { score: number; isBest: boolean; continued: boolean; sonic?: number; cause?: string }, now: number): void {
    this.send('game_over', {
      score: info.score,
      score_band: scoreBand(info.score),
      play_sec: this.startedAt > 0 ? Math.round((now - this.startedAt) / 1000) : 0,
      is_best: info.isBest,
      continued: info.continued,
      sonic: info.sonic ?? 0,
      // 추락(fall) vs 잡힘(caught) 비율 — 위협 속도 튜닝의 근거 (BUILD 19)
      cause: info.cause ?? 'fall',
    })
    this.startedAt = 0
  }

  /** 리워드 광고가 끝난 뒤 — 실제로 보상까지 갔는지가 핵심이다 */
  adReward(placement: string, rewarded: boolean): void {
    this.send('ad_reward', { placement, rewarded })
  }

  /** 공유는 시도와 성공이 갈린다 — 시트를 닫으면 ok=false */
  share(ok: boolean, score: number): void {
    this.send('share', { ok, score })
  }

  leaderboardOpen(): void {
    this.send('leaderboard_open')
  }
}
