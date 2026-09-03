import { NO_INSETS } from './adapter'
import type {
  EventParams,
  PlatformAdapter,
  RewardedAdPlacement,
  SafeAreaInsets,
  ShareData,
} from './adapter'

/** 뒤로가기를 가로채기 위해 히스토리에 심어두는 표식 */
const BACK_GUARD = 'naranara-back-guard'

/** 개발용 mock — 광고는 항상 보상 성공으로 처리한다 */
export class MockAdapter implements PlatformAdapter {
  async init(): Promise<void> {}

  async login(): Promise<{ userId: string } | null> {
    return { userId: 'mock-user' }
  }

  async showRewardedAd(placement: RewardedAdPlacement): Promise<{ rewarded: boolean }> {
    console.debug(`[mock] 리워드 광고: ${placement}`)
    return { rewarded: true }
  }

  async submitScore(score: number): Promise<void> {
    console.debug(`[mock] 점수 제출: ${score}`)
  }

  async openLeaderboard(): Promise<void> {
    console.debug('[mock] 리더보드 열기')
  }

  /** 브라우저에서는 콘솔로 확인한다 — 계측이 실제로 도는지 dev에서 눈으로 본다 */
  track(name: string, params: EventParams = {}): void {
    console.debug(`[mock] 이벤트: ${name}`, params)
  }

  async kvGet(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  async kvSet(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value)
    } catch {
      // 무시
    }
  }

  async kvRemove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
    } catch {
      // 무시
    }
  }

  /** OS 공유 시트 → 실패 시 클립보드 복사 폴백. 실제 SDK 공유는 Phase 3 */
  async share(data: ShareData): Promise<boolean> {
    try {
      if (navigator.share) {
        await navigator.share({ title: data.title, text: data.text, url: data.url })
        return true
      }
      await navigator.clipboard.writeText(`${data.text} ${data.url ?? ''}`.trim())
      console.debug('[mock] 공유: 클립보드에 복사됨')
      return true
    } catch {
      // 사용자가 공유 시트를 닫은 경우 등
      return false
    }
  }

  haptic(intensity: 'light' | 'medium' | 'heavy'): void {
    // 개발 확인용 — Android Chrome에서만 동작. 실제 햅틱은 Phase 3에서 SDK로 교체
    const ms = { light: 10, medium: 20, heavy: 40 }[intensity]
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms)
  }

  /** 브라우저에는 세로 고정·화면 켜짐 유지에 해당하는 표준 API가 없다 */
  applyScreenPolicy(): void {}

  /**
   * 브라우저에서는 CSS `env(safe-area-inset-*)`를 읽는다.
   * `viewport-fit=cover`가 걸려 있으므로 iOS 사파리에서 실제 값이 나온다 —
   * 토스 밖에서도 노치 대응을 눈으로 확인할 수 있다
   */
  safeArea(): SafeAreaInsets {
    try {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;visibility:hidden;pointer-events:none;' +
        'top:env(safe-area-inset-top);right:env(safe-area-inset-right);' +
        'bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left)'
      document.body.appendChild(probe)
      const s = getComputedStyle(probe)
      const px = (v: string): number => {
        const n = Number.parseFloat(v)
        return Number.isFinite(n) ? n : 0
      }
      const insets = {
        top: px(s.top),
        right: px(s.right),
        bottom: px(s.bottom),
        left: px(s.left),
      }
      probe.remove()
      return insets
    } catch {
      return NO_INSETS
    }
  }

  /** 브라우저는 회전 시에만 바뀐다 — resize로 충분하다 */
  onSafeAreaChange(handler: (insets: SafeAreaInsets) => void): () => void {
    const onResize = (): void => handler(this.safeArea())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }

  /**
   * 뒤로가기 가로채기 — 히스토리에 표식을 하나 밀어 넣고, 사용자가 뒤로 가면
   * 다시 밀어 넣어 페이지를 유지한 채 핸들러만 부른다.
   * 토스 밖에서도 종료 확인 모달을 그대로 확인할 수 있다
   */
  onBackPressed(handler: () => void): () => void {
    try {
      history.pushState(BACK_GUARD, '')
    } catch {
      return () => {}
    }
    const onPop = (): void => {
      try {
        history.pushState(BACK_GUARD, '')
      } catch {
        // 무시
      }
      handler()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }

  close(): void {
    console.debug('[mock] 미니앱 종료')
  }
}
