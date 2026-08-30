# Session Handoff
_Last updated: 2026-08-30 (BUILD 19)_

## 지금 상태

**정글훅 — 카툰 정글 + 사계절 + 이어하기 광고 루프 + 슈퍼 모드 150m + 뒤쫓는 폭풍 (BUILD 19). 폭풍 실기기 판정 대기 (미배포).**

```
컨셉       원버튼 그래플 스윙 (홀드=로프+감기+펌프, 릴리스=관성 발사). D-001, D-005, D-006
이름       정글훅 / junglehook — 충돌 검색 완료. GRAC 제명은 신청 직전 재확인 (D-002)
코드       BUILD 19 — **뒤쫓는 폭풍(D-013: 300→420px/s, 고무줄 1000, 잡히면 즉사 · `?p=nothreat`/`chase2`)** +
           슈퍼 모드(D-012: 계절당 1회 찬스 잎 → "SUPER!" 배지 → 3바퀴 → 타이밍 게이지 →
           150m 로켓 대시(B18, 250→150), 백열·번개·블러) + 계절 표정(봄 노랑·여름 땀·겨울 덜덜) + 사계절 2차 난이도 램프 + 캐노피 정글 배경(D-011) + 사계절 250m(D-010) + 잎 앵커 +
           이어하기 광고 루프(D-009) + 카툰 렌더러(D-008) + 충전기 물리·`?p=b4`(D-006/7). 테스트 47개
실플레이   BUILD 1: 156m→206m. 이후 피드백은 전부 D-006~D-012에 반영. BUILD 16·17(색·배지)은 캡처 미확인
콘솔       junglehook 등록됨 · 테스트 배포 12회 (최신 BUILD 18) — tools/latest-deployment.json. **BUILD 19는 미배포**
디자인     밝은 카툰 정글 (D-008) + 사계절 (D-010) + 캐노피 배경 (D-011) — 설계도 `design/`
다음       **BUILD 19 배포(확인 필요) → 폭풍 실기기 판정**(30~60초 세션? 잡힘이 내 탓으로 느껴지나?) → Phase 1 잔여(효과음·점수 제출·뒤로가기 모달)
```

## 다음 세션이 할 일

0. **BUILD 19 배포 → 폭풍 실기기 판정** (D-013). 봇 계측으론 안전 봇 평균 45s에 잡힘 — 실제 손으로 볼 것:
   ① 한 판이 30~60초로 끝나는가 ② 잡힐 때 "내가 지체했다"로 납득되는가(경고 어둠·쉐브론·촉수가 충분히 미리
   보이는가) ③ 첫 판에 폭풍의 존재를 깨닫는가(시작 600px 뒤라 스톨 전엔 안 보인다). A/B: `?p=nothreat`(B18 규칙)
   · `?p=chase2`(더 빠름). 노브 `tuning.threat`(headStartPx·speedMin/Max·speedPerCycle·speedCap·maxLeadPx),
   경고 시작 거리는 renderer `drawThreatWarning`의 warnPx 520. 봇 재계측: `SIM=1 npx vitest run
   src/core/sim-threat.test.ts --disable-console-intercept`. 이전 후보(`?p=hard` 1차 램프 앞당김·sweetHalf·reach)는
   폭풍 판정 뒤에 필요하면
1. **B9 실기기 판정** (배포·문자 전송 완료). 볼 것:
   - 결과 카드의 "광고 보고 이어하기 n/2" — 토스에선 실제 리워드 광고가 뜨는지(AD_GROUP_ID 미설정이면
     보상만 지급되는 폴백), 이어하기 뒤 재출발 궤적이 억울하지 않은지
   - 카툰 비주얼: HUD 칩·숲 띠 배치 / 캐릭터 얼굴 / **성능**(구름·숲 물결 매 프레임 path)
   - 손맛: 기본(충전기) vs `/?p=b4` 5판씩. 한 판 30~60초인가
2. 사계절·캐노피(BUILD 11) 실기기 확인: 250m 경계 보간, 겨울 눈 가독성, 캐노피 층 성능(맥 0.67ms/프레임).
   **슈퍼 모드(BUILD 17) 손맛 판정** — "SUPER!" 배지·따뜻한 색 대시는 hidden 탭 캡처 실패로 실기기에서 첫 확인.: 찬스 잎이 눈에 띄는지, 3바퀴(≈7.5초)·게이지 난이도, 250m 대시 — `tuning.sonic`
   (loopsToArm·dashMeters·dashSpeed·gaugeHz·sweetHalf·chanceFrom/To·freezeSec)으로 조정. 계절별 규칙 변화(여름 바람 등)는 보류
3. 튜닝 노브 (`src/core/tuning.ts`): rigidRope · swingPump 200 · swingMaxSpeed 1050 · minRope 130 ·
   airDrag 0.2 · reach 450 · targetBehindLimit 120 · maxContinues 2 · continueSpawn · camZoom · rampX 18000
4. Phase 1 잔여: 효과음 교체(sound.ts, 광고 중 mute) · 점수 제출(플레이 완료 후) · 뒤로가기 확인 모달 ·
   내용설명서에 "이어하기 광고" 기재(D-004)
5. 검토: 매달린 동안 "재누름 시 잡힐 앵커" 링 표시 (D-006 탈출로 가시화)

## 작업 도구 (이 세션에서 확립)

- 크롬 MCP 검수: 개발 훅 `window.__jgh`(game·tuning·preset·stepOnce). 탭이 hidden이면 rAF가
  멈추므로 `__jgh.stepOnce(dt)`로 틱을 돌리고 캔버스 `toDataURL`을 로컬 수신 서버에 POST해
  이미지로 본다 (PROGRESS 2026-08-30 참고). 실화면 판정은 사용자
- 폰 접속: 아이폰 핫스팟이 IPv6 전용이면 맥이 192.0.0.2를 받아 접속 불가 → 맥의 IPv6 글로벌
  주소 `http://[…]:5173/`로

## 잊지 말 것

- 설계 변경은 D-001의 "수익 역산 원칙 5"에 비춰본다
- 확률·아이템 없음(D-004) — 넣고 싶어지면 내용수정신고 판단 먼저
- 배포는 `ait:build → ait:deploy → ait:send` 한 묶음 — URL을 연락처 "정성엽"(본인 폰)에게
  아이메시지로 보내야 폰에서 확인 가능 (수신자는 tools/imessage.local.json, gitignore)
- 게임오버 문구는 "끝" (사용자 결정). 사망 연출은 피·붉은색 없이 — GRAC 전체이용가
- 클라우드 세션은 콘솔 인증·브라우저 없음 → 배포·실기기 확인은 로컬에서
- sound.ts 효과음 메서드는 슈팅스타 것 — 게임 구현 때 교체
