# Session Handoff
_Last updated: 2026-08-30_

## 지금 상태

**정글훅 — Phase 0 프로토타입 + 카툰 비주얼(BUILD 8). 실기기 판정 대기.**

```
컨셉       원버튼 그래플 스윙 (홀드=로프+감기+펌프, 릴리스=관성 발사). D-001, D-005, D-006
이름       정글훅 / junglehook — 충돌 검색 완료. GRAC 제명은 신청 직전 재확인 (D-002)
코드       BUILD 8 — 카툰 렌더러(D-008) + 충전기 물리(4s 홀드→360°)·`?p=b4` 프리셋·사망 연출·
           시작 데모·reach 450 (D-006/7). 테스트 31개 통과. 번들 83KB(gzip 27KB)
실플레이   BUILD 1: 156m→206m(≈15s). 피드백은 전부 D-006/7에 반영됨. BUILD 8은 미판정
콘솔       junglehook 등록됨 · 테스트 배포 2회 (최신 BUILD 8) — tools/latest-deployment.json
디자인     밝은 카툰 정글 확정 (D-008) — 설계도 `design/`, 캔버스 링크는 design/README.md
다음       BUILD 8 실기기 판정 → 튜닝 → Phase 1(이어하기 광고 루프·효과음·계측)
```

## 다음 세션이 할 일

1. **BUILD 8 실기기 판정** (배포된 상태, 폰 메시지의 링크로 열기). 볼 것:
   - 카툰 비주얼: 토스 헤더 아래 749pt에서 HUD 칩·숲 띠 배치 / 캐릭터 얼굴 / **성능**
     (구름·숲 물결을 매 프레임 path로 그림 — 프레임 떨어지면 오프스크린 캔버스 캐시)
   - 손맛: 기본(충전기, 4초 홀드로 360°) vs `/?p=b4`(회전 없음) 5판씩. 회전이 "필살기"로
     읽히는가 / 뒤로 돌아 거리 주는 비용이 납득되는가 / 죽음이 내 탓으로 느껴지는가 /
     한 판 30~60초인가 (봇은 60초 전원 생존 → 쉬우면 gapMax·jitterMax↑)
2. 튜닝 노브 (`src/core/tuning.ts`): rigidRope · swingPump 200 · swingMaxSpeed 1050 ·
   minRope 130 · airDrag 0.2 · reach 450 · targetBehindLimit 120 · camZoom · rampX 18000.
   B4 값은 PRESETS.b4. 계측은 `sim-observe.test.ts` `.skip` 떼고 `--disable-console-intercept`
3. **Phase 1**: 이어하기 광고 루프(모달 설계도 `design/screens/Continue.dc.html`, 1~2회 제한,
   사전 로딩·광고 중 mute — 플레이북 §3) · 효과음 교체(sound.ts) · 계측 이벤트(`jgh_`) ·
   점수 제출·뒤로가기 확인 모달
4. 검토 항목: 매달린 동안 "재누름 시 잡힐 앵커" 링 표시 (D-006 탈출로 가시화)

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
