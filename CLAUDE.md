# 정글훅 — 앱인토스 출시용 원버튼 그래플 스윙

**모든 응답과 문서는 한국어로 작성한다.**

## 프로젝트 개요

원버튼 하이스코어 게임. 홀드하면 로프가 앵커에 걸려 흔들리고, 떼면 관성으로
날아간다. 다음 앵커로 계속 전진하며 거리를 쌓는다. [한줄팡](https://github.com/jsypsy/hanjulpang),
[슈팅스타](https://github.com/jsypsy/shootingstar)에 이은 세 번째 토스 미니앱.

> **설계 1순위는 리워드 광고 수익**(D-001). 모든 게임 규칙은 "이어하기 광고가
> 팔리는가"에서 역산한다: 누적 점수 · 즉사 · 내 탓인 죽음 · 30~60초 세션 ·
> 이어하기 판당 1~2회 제한. 세션 인수인계는 `HANDOFF.md`.

## 명령어

- `npm run dev` — 개발 서버. 화면 검수는 `/tools/frame.html`(393×749 실측 뷰포트)
- `npm run build` — 타입 체크(`tsc --noEmit`) + 프로덕션 빌드
- `npm test` — vitest 단위 테스트 (core 로직 대상)
- 배포: `npm run ait:build` 후 **콘솔 MCP로 업로드** (절차는 `docs/PLATFORM_PLAYBOOK.md` §8).
  **배포는 언제나 사전 확인을 받는다**
- 빌드 표식: `src/version.ts`의 `BUILD`를 밸런스·조작 변경마다 +1 — 타이틀
  우하단에 찍혀, 폰이 옛 빌드를 캐시한 채 피드백하는 사고를 막는다 (슈팅스타에서 실제로 겪음)

## 기술 스택 및 제약

슈팅스타에서 그대로 이어받는다 (두 번 출시로 검증된 구성):

- Vite + TypeScript, **프레임워크 없음** — Canvas 2D 직접 렌더링
- **런타임 의존성 추가 금지** — 물리·사운드·이펙트 모두 직접 구현.
  꼭 필요하면 추가 전에 사용자에게 먼저 확인받을 것
- 저장: localStorage(즉시) + 플랫폼 kv 미러링(오리진 변경 유실 대비). 키 접두어 `jgh.v1`
- 계측: `src/analytics.ts`, 이벤트 접두어 `jgh_` — **처음부터 넣고 간다** (한줄팡 교훈)
- 앱인토스 SDK: `src/platform/index.ts`가 토스 WebView면 AitAdapter, 브라우저면
  MockAdapter 자동 선택. 게임 코드는 PlatformAdapter 인터페이스만 호출 (직접 SDK 호출 금지)
- `cancelHostTopInset` 보정 필수 (`platform/adapter.ts`, 한줄팡 D-022 실측)

**슈팅스타에서 이식한 것** — 모노레포로 묶지 않는다(기존 결정 승계, D-003).
복사본이므로 원본 쪽 수정이 자동으로 넘어오지 않는다:
`src/platform/` 전체 · `storage.ts` · `sound.ts`(기동·복구 뼈대만 유효, 효과음
메서드는 슈팅스타 것이라 게임 구현 때 교체) · `analytics.ts` · `tools/` ·
`apps-in-toss.config.ts` · `docs/PLATFORM_PLAYBOOK.md`

## 심사 요건 (코드에 이미 반영돼 있어야 하는 것)

`docs/PLATFORM_PLAYBOOK.md` §3 표를 따른다. 특히: 리워드 광고 사전 로딩,
광고 중 게임 오디오 직접 mute, 뒤로가기 확인 모달, 점수 제출은 플레이 완료 후.

## 문서 지도

- `HANDOFF.md` — 세션 인수인계 (상태·다음 액션)
- `docs/PROJECT_PLAN.md` — 게임 설계와 단계 계획
- `docs/DECISIONS.md` — 결정 기록 (D-번호)
- `docs/PROGRESS.md` — 작업 일지
- `docs/PLATFORM_PLAYBOOK.md` — 앱인토스 출시 절차 전체 (슈팅스타에서 확립)
