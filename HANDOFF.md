# Session Handoff
_Last updated: 2026-08-30_

## 지금 상태

**정글훅 — Phase 0 프로토타입, 물리 재작업(BUILD 5 충전기 vs B4) A/B 판정 대기.**

```
컨셉       원버튼 그래플 스윙 (홀드=로프+감기+펌프, 릴리스=관성 발사). D-001, D-005, D-006
이름       정글훅 / junglehook — 충돌 검색 완료. GRAC 제명은 신청 직전 재확인 (D-002)
코드       BUILD 8 — 카툰 렌더러(D-008) + 충전기 물리·`?p=b4`·사망 연출·시작 데모 (D-006/7). 테스트 31개
실플레이   BUILD 1: 156m→206m(≈15s). "빨리 죽는다 / 수직 정지 / 붕붕 돌면 세지게" → D-006
콘솔       junglehook 등록됨 · 테스트 배포 2회 (최신 BUILD 8, 2026-08-30) — tools/latest-deployment.json
디자인     밝은 카툰 정글 확정 (D-008) — 설계도 `design/`, 캔버스 링크는 design/README.md
다음       BUILD 8 실기기 판정(카툰 비주얼·B8 vs ?p=b4 손맛) → Phase 1(이어하기 광고 루프)
```

## 다음 세션이 할 일

1. **B5 vs B4 A/B 판정** — `npm run dev`. 기본이 B5(우하단 `B5`), `/?p=b4`가 B4(`B5·b4`).
   볼 것: 4초 홀드로 충전해 한 바퀴 도는 게 "필살기"로 읽히는가 / 줌아웃으로 앵커가
   보이는가 / 회전 중 뒤로 가서 거리 줄어드는 비용이 납득되는가 / 놓는 타이밍이 내 탓으로 느껴지는가 /
   한 판 30~60초인가 (봇은 60초 전원 생존이라 **쉬워졌을 수 있음** → gapMax·jitterMax↑)
2. 손맛 튜닝 노브 (`src/core/tuning.ts`): rigidRope · swingPump 200 · swingMaxSpeed 1050 ·
   minRope 130 · airDrag 0.2 · camZoom · rampX 18000. B4 값은 PRESETS.b4. 계측은 `sim-observe.test.ts` `.skip` 떼고
   `--disable-console-intercept`
3. 크롬 MCP 자동 플레이: `window.__jgh` 훅(개발 전용) 있음. **탭이 hidden이면 rAF가
   멈춰 게임이 안 돌아감** — 크롬 창을 화면에 보이게 둘 것
4. 크롬 MCP 검수: 탭이 hidden이면 `__jgh.stepOnce(dt)`로 틱을 돌리고 캔버스를 POST로 저장해
   본다 (PROGRESS 참고). 실화면 판정은 사용자
5. 카툰 렌더러(BUILD 8) 실기기 확인 — 토스 헤더 아래에서 HUD 칩 위치·숲 띠 높이·성능(구름·숲
   물결은 매 프레임 path) 체크. 이어하기 모달은 `design/screens/Continue.dc.html` 참고해 Phase 1에서
6. 재미 판정 통과 후 Phase 1 (사망 연출·이어하기 광고 루프·튜토리얼·효과음·계측).
   매달린 동안에도 "재누름 시 잡힐 앵커" 링 표시 검토 (D-006 탈출로 가시화)

## 잊지 말 것

- 설계 변경은 D-001의 "수익 역산 원칙 5"에 비춰본다
- 확률·아이템 없음(D-004) — 넣고 싶어지면 내용수정신고 판단 먼저
- 클라우드 세션은 콘솔 인증·브라우저 없음 → 배포·실기기 확인은 로컬에서
- sound.ts 효과음 메서드는 슈팅스타 것 — 게임 구현 때 교체
