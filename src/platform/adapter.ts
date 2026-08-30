/**
 * 앱인토스 SDK 접점 추상화.
 * 게임 코드는 반드시 이 인터페이스를 통해서만 플랫폼 기능을 호출한다 (직접 SDK 호출 금지).
 * 실제 구현은 Phase 3, 그 전까지는 MockAdapter로 개발한다.
 */

/** 리워드 광고 3접점 */
export type RewardedAdPlacement =
  | 'continue' // 게임오버 시 이어하기
  | 'item' // 아이템(부스터) 획득
  | 'daily-bonus' // 일일 보너스 (Phase 2에서 확정)

export interface ShareData {
  title: string
  text: string
  url?: string
}

/**
 * 분석 이벤트 파라미터. SDK가 `undefined`를 걸러내고 나머지를 문자열로 정규화하므로
 * 굳이 미리 문자열로 만들지 않는다
 */
export type EventParams = Record<string, string | number | boolean | null | undefined>

/** 노치·홈 인디케이터에 가리는 영역 (CSS px) */
export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * 호스트가 이미 처리한 상단 높이만큼 `top`을 상쇄한다
 * ([D-022](../../docs/DECISIONS.md#d-022)).
 *
 * 토스 앱은 미니앱 위에 자기 헤더(`‹ 앱이름 ✕`)를 두고 WebView를 그 **아래에**
 * 놓는데, `SafeArea.get()`은 **기기 기준** 값이라 상태바 높이를 그대로 알려준다.
 * 그대로 쓰면 이미 헤더 아래인 화면을 상태바만큼 또 밀어 빈 띠가 생긴다.
 *
 * 실측(iPhone 16 / 앱인토스 / 2026-08-16): 화면 852pt인데 뷰포트는 749pt였고
 * (헤더+상태바가 103pt를 이미 가져감) top은 59pt를 그대로 보고했다.
 * 그 59pt가 화면 위에 통째로 빈 띠로 남아 있었다.
 *
 * 화면과 뷰포트의 세로 차이만큼을 "호스트가 처리한 몫"으로 보고 뺀다.
 * 전체 화면 WebView(모바일 사파리 등)에서는 차이가 0이라 원래 값이 그대로 남는다
 */
export function cancelHostTopInset(
  insets: SafeAreaInsets,
  screenHeight: number,
  viewportHeight: number,
): SafeAreaInsets {
  if (!Number.isFinite(screenHeight) || !Number.isFinite(viewportHeight)) return insets
  const handledByHost = Math.max(0, screenHeight - viewportHeight)
  return { ...insets, top: Math.max(0, insets.top - handledByHost) }
}

export interface PlatformAdapter {
  init(): Promise<void>
  login(): Promise<{ userId: string } | null>
  showRewardedAd(placement: RewardedAdPlacement): Promise<{ rewarded: boolean }>
  submitScore(score: number): Promise<void>
  /**
   * 분석 이벤트 기록 — 콘솔 '핵심 지표'(전환 지표)의 재료가 된다 (D-028).
   *
   * **fire-and-forget이다.** 게임 루프 한가운데서 불리므로 await하지 않고,
   * 실패해도 조용히 삼킨다. 이벤트 하나 놓치는 것이 프레임을 놓치는 것보다 싸다
   */
  track(name: string, params?: EventParams): void
  /** 토스게임센터 리더보드 열기 */
  openLeaderboard(): Promise<void>
  /** 점수 공유 (성장 루프) — 성공 여부 반환 */
  share(data: ShareData): Promise<boolean>
  haptic(intensity: 'light' | 'medium' | 'heavy'): void
  /**
   * 세로 고정 + 화면 꺼짐 방지 (심사 요건).
   * 앱 전체에 영향을 주는 설정이라 미지원 환경에서는 아무 일도 하지 않는다
   */
  applyScreenPolicy(): void
  /** 현재 Safe Area. 알 수 없으면 0 */
  safeArea(): SafeAreaInsets
  /** Safe Area 변경 구독 — 해제 함수를 반환한다 */
  onSafeAreaChange(handler: (insets: SafeAreaInsets) => void): () => void
  /**
   * 시스템 뒤로가기 구독 — 해제 함수를 반환한다.
   * 심사 요건상 뒤로가기로 곧장 나가지 않고 확인을 받아야 한다
   */
  onBackPressed(handler: () => void): () => void
  /** 미니앱 화면 닫기 */
  close(): void
  /**
   * 플랫폼 키-값 저장소 — localStorage 유실 대비 미러링용.
   * 토스에서는 네이티브 Storage, mock에서는 localStorage
   */
  kvGet(key: string): Promise<string | null>
  kvSet(key: string, value: string): Promise<void>
  kvRemove(key: string): Promise<void>
}
