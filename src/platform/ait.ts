/**
 * 앱인토스 SDK 실구현 (@apps-in-toss/web-framework v3).
 * 모든 호출은 try/catch로 감싸 토스 앱 버전이 낮거나 브리지가 없어도
 * 게임이 죽지 않고 조용히 강등되게 한다.
 */
import {
  Analytics,
  Game,
  GoogleAdMob,
  SafeArea,
  Screen,
  Share,
  Storage,
  generateHapticFeedback,
  getUserKeyForGame,
  graniteEvent,
} from '@apps-in-toss/web-framework'
import { NO_INSETS, cancelHostTopInset } from './adapter'
import type {
  EventParams,
  PlatformAdapter,
  RewardedAdPlacement,
  SafeAreaInsets,
  ShareData,
} from './adapter'

/**
 * 앱인토스 콘솔의 리워드 광고 지면 ID.
 *
 * **아직 비어 있다** — 새 미니앱을 콘솔에 등록한 뒤 광고 지면을 만들어 채운다
 * (`docs/PLATFORM_PLAYBOOK.md` 참고). 비어 있으면 광고 없이 보상만 지급하는
 * 폴백이 돌기 때문에, 지면이 없어도 게임은 정상 동작한다.
 *
 * ⚠️ **실 ID를 채운 뒤에는 광고를 반복 시청하지 말 것** — 인위적 노출은
 * 어뷰징으로 걸리고, `abuseLevel`이 붙으면 지면이나 미니앱 전체가 제한된다
 */
const AD_GROUP_ID: string = 'ait.v2.live.5fb692accf9c4248'

/**
 * 공유 링크가 가리킬 미니앱 딥링크. `Share.createLink`가 이걸 토스에서 열리는
 * URL로 바꿔준다. **`apps-in-toss.config.ts`의 `appName`과 반드시 같아야 한다** —
 * 앱 이름을 확정하면 두 곳을 함께 고친다.
 * 출시 전에는 링크가 유효하지 않을 수 있으므로 실기기 확인이 필요하다
 */
const MINIAPP_LINK = 'intoss://naranara'

/** 토스 WebView 안인지 감지 — 브리지가 없으면 isSupported가 false거나 throw */
export function isTossEnvironment(): boolean {
  try {
    return Game.openLeaderboard.isSupported()
  } catch {
    return false
  }
}

/**
 * 게임 동작 → 앱인토스 햅틱 타입.
 * SDK가 제공하는 HapticFeedbackType 중에서 고른다
 * (tickWeak / tap / tickMedium / softMedium / basicWeak / basicMedium /
 *  success / error / wiggle / confetti)
 */
const HAPTIC_MAP = {
  light: 'tickWeak',
  medium: 'tickMedium',
  heavy: 'basicMedium',
} as const

export class AitAdapter implements PlatformAdapter {
  private adLoaded = false
  private disposeAdLoader: (() => void) | null = null

  async init(): Promise<void> {
    this.preloadRewardedAd()
  }

  /** 심사 요건: 광고는 사전 로딩 (노출 시점 실시간 로딩 금지) */
  private preloadRewardedAd(): void {
    if (!AD_GROUP_ID) return
    try {
      if (!GoogleAdMob.loadAppsInTossAdMob.isSupported()) return
      this.disposeAdLoader?.()
      this.disposeAdLoader = GoogleAdMob.loadAppsInTossAdMob({
        options: { adGroupId: AD_GROUP_ID },
        onEvent: (event) => {
          if (event.type === 'loaded') this.adLoaded = true
        },
        onError: () => {
          this.adLoaded = false
        },
      })
    } catch {
      this.adLoaded = false
    }
  }

  /** 게임용 사용자 식별키(hash) — 심사 필수 요건 */
  async login(): Promise<{ userId: string } | null> {
    try {
      const res = await getUserKeyForGame()
      if (res && res !== 'ERROR') return { userId: res.hash }
      return null
    } catch {
      return null
    }
  }

  async showRewardedAd(placement: RewardedAdPlacement): Promise<{ rewarded: boolean }> {
    // 광고 그룹 미설정·로드 실패 시 사용자를 막지 않고 보상 지급
    if (!AD_GROUP_ID || !this.adLoaded) {
      console.debug(`[ait] 광고 미준비(${placement}) — 보상만 지급`)
      return { rewarded: true }
    }
    return new Promise((resolve) => {
      let rewarded = false
      let done = false
      let dispose: (() => void) | null = null
      const finish = (result: boolean): void => {
        if (done) return
        done = true
        dispose?.()
        this.adLoaded = false
        this.preloadRewardedAd() // 다음 노출 대비 재로딩
        resolve({ rewarded: result })
      }
      try {
        dispose = GoogleAdMob.showAppsInTossAdMob({
          options: { adGroupId: AD_GROUP_ID },
          onEvent: (event) => {
            if (event.type === 'userEarnedReward') rewarded = true
            if (event.type === 'dismissed') finish(rewarded)
            if (event.type === 'failedToShow') finish(true)
          },
          onError: () => finish(true),
        })
      } catch {
        finish(true)
      }
    })
  }

  async submitScore(score: number): Promise<void> {
    try {
      if (!Game.setLeaderboardScore.isSupported()) return
      await Game.setLeaderboardScore({ score: String(score) })
    } catch {
      // 리더보드 실패는 게임 진행에 영향 없음
    }
  }

  /**
   * `Analytics.log`는 `anonymous_key`를 알아서 붙이고, 미지원 앱 버전에서는
   * 에러 없이 무시된다. 샌드박스에서는 콘솔에만 찍히고 전송되지 않는다
   */
  track(name: string, params: EventParams = {}): void {
    try {
      void Analytics.log({ log_name: name, log_type: 'event', params }).catch(() => {})
    } catch {
      // 계측 실패는 게임 진행과 무관하다
    }
  }

  async openLeaderboard(): Promise<void> {
    try {
      if (Game.openLeaderboard.isSupported()) await Game.openLeaderboard()
    } catch {
      // 무시
    }
  }

  /**
   * 공유 링크는 **미니앱 딥링크**여야 한다 — 개발 주소를 뿌리면 받은 사람이
   * 게임을 열 수 없다. 링크 생성에 실패하면 문구만 보낸다 (빈 링크보다 낫다)
   */
  async share(data: ShareData): Promise<boolean> {
    try {
      const link = await Share.createLink({ path: MINIAPP_LINK }).catch(() => null)
      const url = link ?? ''
      await Share.sendMessage({ message: `${data.text} ${url}`.trim() })
      return true
    } catch {
      return false
    }
  }

  /**
   * 심사 권장 API인 `generateHapticFeedback`을 쓴다 (기존 `Device.triggerHaptic`에서 교체).
   * 옵션 타입은 동일하고, 진동은 게임 진행에 필수가 아니므로 실패는 조용히 무시한다
   */
  haptic(intensity: 'light' | 'medium' | 'heavy'): void {
    try {
      void generateHapticFeedback({ type: HAPTIC_MAP[intensity] }).catch(() => {})
    } catch {
      // 무시 — 미지원 기기·낮은 앱 버전
    }
  }

  /**
   * 심사 요건: 세로 고정 + 플레이 중 화면 꺼짐 방지.
   *
   * 둘 다 **앱 전체에 영향을 주는 설정**이라 SDK가 "화면을 벗어날 때 복구하라"고
   * 안내한다. 미니앱은 종료되면 웹뷰가 통째로 사라지므로 되돌릴 시점이 따로 없고,
   * 토스 앱이 미니앱 종료 시 정리한다. 낮은 앱 버전에서는 isSupported가 false다
   */
  applyScreenPolicy(): void {
    try {
      if (Screen.setOrientation.isSupported()) {
        void Screen.setOrientation({ type: 'portrait' }).catch(() => {})
      }
    } catch {
      // 무시 — 미지원 버전
    }
    try {
      void Screen.setAwakeMode({ enabled: true }).catch(() => {})
    } catch {
      // 무시
    }
  }

  /**
   * SDK가 주는 값은 **기기 기준**이라 토스 헤더 아래에 놓인 WebView에는 상단이
   * 과하게 잡힌다 — `cancelHostTopInset`이 호스트가 이미 먹은 만큼 상쇄한다 (D-022)
   */
  private adjust(i: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }): SafeAreaInsets {
    const raw = { top: i.top ?? 0, right: i.right ?? 0, bottom: i.bottom ?? 0, left: i.left ?? 0 }
    return cancelHostTopInset(raw, window.screen?.height ?? 0, window.innerHeight)
  }

  safeArea(): SafeAreaInsets {
    try {
      return this.adjust(SafeArea.get())
    } catch {
      return NO_INSETS
    }
  }

  onSafeAreaChange(handler: (insets: SafeAreaInsets) => void): () => void {
    try {
      return SafeArea.subscribe({ onEvent: (i) => handler(this.adjust(i)) })
    } catch {
      return () => {}
    }
  }

  /** 시스템 뒤로가기 — 여기서 곧장 닫지 않고 게임이 확인 모달을 띄운다 */
  onBackPressed(handler: () => void): () => void {
    try {
      return graniteEvent.addEventListener('backEvent', { onEvent: handler })
    } catch {
      return () => {}
    }
  }

  close(): void {
    try {
      void Screen.close().catch(() => {})
    } catch {
      // 무시
    }
  }

  async kvGet(key: string): Promise<string | null> {
    try {
      return await Storage.getItem(key)
    } catch {
      return null
    }
  }

  async kvSet(key: string, value: string): Promise<void> {
    try {
      await Storage.setItem(key, value)
    } catch {
      // 무시
    }
  }

  async kvRemove(key: string): Promise<void> {
    try {
      await Storage.removeItem(key)
    } catch {
      // 무시
    }
  }
}
