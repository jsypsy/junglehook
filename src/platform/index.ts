import type { PlatformAdapter } from './adapter'
import { AitAdapter, isTossEnvironment } from './ait'
import { MockAdapter } from './mock'

/** 토스 WebView면 실제 SDK, 일반 브라우저(개발)면 mock */
export function createPlatform(): PlatformAdapter {
  if (isTossEnvironment()) {
    console.debug('[platform] 앱인토스 환경 — AitAdapter 사용')
    return new AitAdapter()
  }
  return new MockAdapter()
}
