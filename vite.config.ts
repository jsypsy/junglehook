import { defineConfig } from 'vite'

export default defineConfig({
  // 앱인토스 WebView에서 상대 경로로 서빙될 수 있으므로 base는 상대 경로 고정
  base: './',
})
