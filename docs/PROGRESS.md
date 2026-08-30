# 작업 일지

## 2026-08-30 — 프로젝트 시작

- 컨셉 확정: 원버튼 그래플 스윙, 수익(리워드 광고) 1순위 (D-001)
- 이름 확정: 정글훅/junglehook — 충돌 검색 완료 (D-002)
- 스캐폴딩: 슈팅스타에서 이식 (D-003). platform/·storage·sound·analytics·tools·
  플레이북. 접두어 jgh.v1/jgh_, BUILD=1, 플레이스홀더 main.ts
- 검증: npm test / npm run build 통과 확인 후 첫 커밋

## 2026-08-30 — Phase 0 프로토타입 구현

- core: physics(진자+구속 투영) / anchors(시드 난이도 곡선) / game(상태머신·타깃 선택)
- 계측 주도 튜닝 3회전 (sim-observe 패턴, 슈팅스타에서 이식):
  1. reach 270: 낮은 비행에서 타깃 전무 → 1.9s 사망 → reach 340
  2. 고도 회복 수단 부재: 매 사이클 침하 → 3.4s 사망 → reel-in 110px/s 추가
  3. 속도 무한 증가(700px/s+) → airDrag 0.12/s 추가
  → 최종: 봇 30s 생존 · 314m · 속도 350~720 안정 (D-005)
- render/input/main: 트레일·타깃 링·HUD·사망 오버레이·베스트 저장(jgh.v1)
- Chromium 실렌더 확인: 타이틀→스윙→비행→사망→신기록 갱신 정상
- 남음: **사람 실플레이 판정** (Phase 0의 성공 기준) — 로컬에서 npm run dev
