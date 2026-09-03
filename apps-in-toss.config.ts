import { defineConfig } from '@apps-in-toss/web-framework/config'

/**
 * ⚠️ `appName`은 콘솔에 등록한 미니앱 이름과 **정확히 같아야** 배포가 붙는다.
 * 콘솔 등록 시 이 슬러그(naranara)를 그대로 쓴다.
 * 링크는 `src/platform/ait.ts`의 `MINIAPP_LINK`와 짝이다.
 */
export default defineConfig({
  appName: 'naranara',
  brand: {
    // 밝은 카툰 정글 팔레트의 플레이어/버튼 색 (D-008)
    primaryColor: '#ff7f3f',
  },
  permissions: [],
  webView: {
    // 게임 화면 고정 — 당겨서 새로고침·오버스크롤이 홀드 조작과 충돌하지 않게
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    // 로드 시점부터 오디오 허용 — 첫 터치 전에 오디오를 웜업시켜 무음 문제 차단
    // (한줄팡에서 첫 탭 무음으로 며칠을 태운 항목이다. 한줄팡 D-009~D-012)
    mediaPlaybackRequiresUserAction: false,
    allowsInlineMediaPlayback: true,
  },
})
