# 보안 검토 — 2026-09-03 (토스 미니앱 3종 공통 검토의 날아날아 판)

> **상태: 기록만. 수정은 여유 생기면 (사용자 결정 2026-09-04).**
> 한줄팡·슈팅스타·날아날아를 같은 항목으로 한 번에 훑었다. 이 문서는 공통 발견 + 날아날아 고유 발견 + 이 앱에서
> 언제 손대도 되는가를 적는다. 같은 문서가 세 리포에 각각 있다(앱별 절만 다르다).

## 검토 범위와 방법

- 대상: `src/`, `tools/`, `apps-in-toss.config.ts`, `index.html`, `.github/`, `.gitignore`, 그리고 배포 번들(`dist/`)에 무엇이
  남는지 문자열 대조
- 방법: 읽기 전용 코드 검토(앱당 에이전트 1) + `npm audit` + git 전체 이력·작업 트리 비밀값 검색(전화번호·API 키·토큰·서명 패턴)
  + 리포 공개 여부(`gh repo view`)
- 코드는 수정하지 않았다

## 깨끗하게 확인된 것 (세 앱 공통)

- 의존성 취약점 **0건** (`npm audit`, dev 포함). 런타임 의존성은 앱인토스 SDK 하나
- git 이력·작업 트리에 **키·토큰·전화번호 없음**. `.ait`·`.env`·`imessage.local.json`·`deploy-qr.png`가 이력에 들어간 적 없음
- 계측 이벤트에 **개인 식별 값 없음** — 전부 게임 수치·불리언. `login()`의 해시 키는 저장·전송하지 않는다
- `permissions: []` — 네이티브 권한 요청 없음
- `eval`·`innerHTML`·`document.write`·`postMessage`·`fetch`·외부 URL **0건**. UI가 전부 캔버스라 XSS 표면이 사실상 없다
- 개발 훅·URL 파라미터 치트는 `import.meta.env.DEV` 안에 있고 **배포 번들에서 제거됨**을 문자열로 확인
- 플랫폼 접점이 `src/platform/ait.ts` 한 파일에 모여 있어 감사 표면이 좁다 (어댑터 규칙이 지켜지고 있다)

## 공통 발견 (심각도 순)

### C1. 리더보드 점수 무검증 + 저장값 경유 조작 — 중간

- 점수는 클라이언트 계산값이 그대로 `Game.setLeaderboardScore`로 간다. 상한·단조성·서버 검증 없음
- 저장본(`*.save`)의 `score`를 손으로 심고 게임을 재개해 죽으면 그 값이 제출된다 (앱별 절에 파일:줄)
- **대응**: ① 저장본 복원 시 "도달 가능한 최대치" 상한 ② 제출값은 저장값이 아니라 그 판의 인메모리 점수만 ③ 저장본에 무결성 태그
  (`seed+stage+score` 솔트 해시)로 손편집과 게임 기록을 구분 ④ 서버 검증이 없으니 부정 상위권은 전제하고 운영 정책(이상치 필터·삭제)으로

### C2. 리워드 광고 fail-open — 중간

- `src/platform/ait.ts` `showRewardedAd`: 광고 미로드(`!adLoaded`)·`failedToShow`·`onError`·예외 네 경로에서 광고 없이
  `{ rewarded: true }`. 네트워크를 끊으면 광고 없이 이어하기가 된다. 이어하기 횟수 캡 덕에 피해는 작다
- 계측 `ad_reward`가 "봤다"와 "없어서 줬다"를 같은 `rewarded: true`로 보내 콘솔에서 구분이 안 된다
- **대응**: ① `adReward`에 `reason: 'earned' | 'not_loaded' | 'failed'` 파라미터 ② 지면 발급 뒤에는 실패 경로를 `false` + "다시 시도"
  안내로 ③ 세션당 폴백 횟수가 비정상이면 이어하기 차단

### C3. 토스 안에서 MockAdapter가 선택될 수 있음 — 낮음~중간

- `src/platform/index.ts`의 환경 판정이 `Game.openLeaderboard.isSupported()` **하나**. 낮은 앱 버전·브리지 주입 지연이면 토스
  안인데도 목이 붙는다. 목은 광고 없이 보상, 점수 제출·계측은 콘솔 출력만 → 리더보드·지표가 조용히 유실된다
- 목 코드가 배포 번들에 그대로 들어간다 (`[mock]` 문자열 확인)
- **대응**: 판정을 복수 신호(UA + 브리지 존재 + `getUserKeyForGame` 지원)로, 실패 시 목이 아니라 "기능 비활성 어댑터"로 강등.
  Mock은 `import.meta.env.DEV`에서만 import

### C4. 개발 도구 `tools/shot-receiver.mjs` 경로 순회 + CORS `*` — 중간 (로컬 한정)

- `name` 쿼리를 정화하지 않아 `../../…`로 출력 폴더 밖에 파일을 쓸 수 있고, `Access-Control-Allow-Origin: *`라 서버가 떠 있는 동안
  방문한 아무 웹페이지나 POST를 보낼 수 있다. 루프백 바인딩·촬영 때만 잠깐 띄우는 도구라 실위험은 작다
- **대응**: `name`을 `/^[0-9A-Za-z가-힣_-]+$/`로 제한 + `resolve` 결과가 `OUT` 하위인지 확인, 오리진은 dev 서버 주소로

### C5. 프로덕션 `console.debug` 잔존, 사용자 해시 앞 8자 출력 — 낮음

- `main.ts`의 로그인 뒤 `console.debug` 가 DEV 가드 밖. 익명 해시 8자라 실위험은 미미하지만 남길 이유가 없다
- **대응**: `vite.config.ts`에 `esbuild: { drop: ['debugger'], pure: ['console.debug'] }` 또는 해당 줄만 DEV 가드로

### C6. `tools/latest-deployment.json` 커밋 — 낮음

- 미출시 테스트 빌드 딥링크(`intoss-private://…_deploymentId=…`)가 추적 중. 자격증명은 아니고 토스 앱·권한이 있어야 열린다
- **대응**: 공개 리포거나 공개 전환 계획이 있으면 `.gitignore`로. `tools/go.html`은 파일이 없어도 동작한다

### C7. CSP 없음 — 정보

- 외부 리소스가 0건이라 실효 위험은 없다. 심층 방어로 `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; connect-src 'self'` 수준을 검토하되, **앱인토스 SDK 브리지와 충돌 여부를 실기기에서 먼저 확인**

## 날아날아 고유 발견

| # | 항목 | 위험도 | 근거 |
|---|---|---|---|
| N1 | **`.github/workflows/deploy.yml:70` 셸 인젝션** — `${ github.event.inputs.memo }`가 `run:`에 직접 치환 | 중간 | 트리거가 `workflow_dispatch`뿐이라 쓰기 권한자만 입력 가능하지만, 같은 러너에 `ait token add`로 배포 토큰이 등록된 뒤다. `env: MEMO: ${ … }`로 받아 `"$MEMO"`로 참조 |
| N2 | C4: `tools/shot-receiver.mjs` 경로 순회 + CORS `*` | 중간(로컬) | `:20-21`, `:25`, `:31-32`. `127.0.0.1` 바인딩은 돼 있다 |
| N3 | C2: **`AD_GROUP_ID`가 빈 문자열** → 토스 안에서도 항상 광고 없이 이어하기 | 중간(표기 정합) | `src/platform/ait.ts:37`, `:78`, `:109-112`. 지면은 출시 직전 발급 예정(23일 무노출 삭제 정책)이라 예정된 상태지만, 발급 전엔 GRAC 설명서 10항 "광고를 시청하고 이어하기"와 실동작이 다르다. 실패 경로 `:131`·`:133`·`:136`도 fail-open |
| N4 | C6: `tools/latest-deployment.json` 추적 중 — **리포가 공개** | 낮음 | 미출시 테스트 빌드 딥링크가 공개돼 있다. 게임에 민감 데이터가 없어 실피해는 작다 |
| N5 | C1·C3·C5: 리더보드 **미연결**이라 현재 해당 없음. 연결하면 `nara.v1.best` 조작이 같은 경로가 된다 | 정보→중간 | `submitScore`·`openLeaderboard`·`login` 호출부 0건. `tools/grac-shots.mjs:106`이 최고기록을 localStorage로 심어 스크린샷을 연출하는 것이 조작이 얼마나 쉬운지 보여준다 |
| N6 | kv 미러링이 주석에만 있고 호출부 없음 | 정보(데이터 보존) | `src/storage.ts:7-9`. 오리진이 바뀌면 최고기록이 유실된다 — 보안이 아니라 보존 이슈 |

`?p=` 프리셋·`window.__nara`는 B40에서 DEV 전용으로 감쌌고 번들에서 `__nara`·`applyPreset`·`nothreat` 0건 — 설명서 "치트 없음"과 일치(D-023).

## 이 앱에서 언제 손대도 되는가

- **GRAC 접수본(B40)이라 게임 내용은 결정 전까지 건드리지 않는다.** N1·N2·N4는 워크플로·도구·gitignore라 **지금 고쳐도 된다**
  — 게임 번들과 무관하고 gh-pages도 건드리지 않는다
- N3는 출시 직전 지면 발급과 함께: 발급 → `AD_GROUP_ID` 채움 → 실패 경로를 `false`로 → 콘솔 검수. 발급 전에 출시하지 않는다
- N5는 리더보드를 붙이는 Phase 1 잔여 작업 때 C1의 대응(인메모리 점수만 제출·상한)을 처음부터 넣는다

## 참고

- 검토 세션: 2026-09-03, Claude Code (에이전트 3 + 직접 스캔). 결과 원문은 세션에만 있고 이 문서가 정리본이다
- 광고 지면 ID(`AD_GROUP_ID`)는 클라이언트 식별자라 소스·번들 노출이 정상이다. 비밀값이 아니다
- 다른 두 앱의 같은 문서: `toss/hanjulpang/docs/SECURITY_REVIEW.md` · `toss/shootingstar/docs/SECURITY_REVIEW.md` ·
  `toss/naranara/docs/SECURITY_REVIEW.md`
