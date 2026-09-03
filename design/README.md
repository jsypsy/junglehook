# 날아날아 비주얼 설계도 — 밝은 카툰 정글

클로드 디자인 캔버스: https://claude.ai/code/artifact/4f7c9ff4-1b60-44cf-adf1-905b2ebc1a8f
(캔버스에서 수정하면 여기 사본과 어긋난다 — 확정 뒤 다시 내려받아 갱신할 것)

- `Palette.dc.html` — 색·글자·형태 토큰
- `screens/Play.dc.html` — 플레이 (캔버스의 Main)
- `screens/Start.dc.html` — 시작 화면 + 데모 카드
- `screens/GameOver.dc.html` — 결과 카드 ("끝")
- `screens/Continue.dc.html` — 이어하기 광고 모달
- `canvas.json` — 캔버스 배치

이 파일들은 **설계도**다. 게임은 Canvas 2D 직접 렌더링이라 `src/render/renderer.ts`에 옮겨 그린다 (D-008).
토큰: 외곽선·글자 #1f3a2a · 보조 #4f7f62 · 플레이어/버튼 #ff7f3f · 타깃/신기록 #ffcc33 ·
앵커 #a0662f · 로프 #c98c4b · 하늘 #bfe8f5→#eaf7d6 · 숲 #a9dc8e/#5fbf6e/#2f8f4e/#1f6b3c ·
카드 = 흰 바탕 + 2px 선 + 4px 오프셋 그림자(작은 칩은 3px) · 반경 20 · 글자 system-ui 굵게(웹폰트 없음)

## 하루와 계절 (D-010) — `day-seasons/`

캔버스: https://claude.ai/code/artifact/9f09bbe1-342b-4265-9d59-dc2173636dd6
`gen.py`가 팔레트 표(SCENES)에서 장면 보드를 생성한다 — 색을 바꾸려면 gen.py를 고치고 다시 생성.
150m마다 아침·낮·저녁·밤·새벽, 750m마다 봄·여름·가을·겨울. 날씨(비·눈)는 판 시드 랜덤.
앵커 = 덩굴 끝 고리(BUILD 10에서 렌더러에도 반영), 밤·새벽 halo, 겨울 설선 없음.


## 계절 나무 (BUILD 24 준비) — `trees/`

캔버스: https://claude.ai/code/artifact/78bdb370-74ca-478c-97a6-88fdf75c0552
`gen.py`가 보드를 생성한다. 규칙: 나무 = 가지 뼈대(시드 결정론, 항상 그림) + 잎덩어리(가지 마디에 원, 반지름·개수는
잎 밀도 0~1). 겨울 0 앙상한 가지만 · 봄 0.45 · 가을 0.75 · 여름 1.0 덩어리가 겹쳐 가지가 안 보임. 색은 renderer.ts
SEASON_PALETTE 3톤(dark·base·hi). 사용자 요청 "겨울엔 앙상한 나뭇가지만, 여름엔 아주 초록 풍성하게". **렌더러 반영 완료 (BUILD 25,
`src/render/tree.ts`)** — 설계도의 gen.py 규칙을 그대로 포팅, 스프라이트 캐시

## HUD 정렬 · 대시 화염 (BUILD 31) — `canvas/`

캔버스: https://claude.ai/code/artifact/75924648-6ee9-440c-9a0b-1f582a8dbfbc
페이지 둘 — **HUD 정렬** 4안(A 태양 내리기 · B 가장자리 블리드 · C 한 줄 정렬 · D 가운데 모으기)과
**대시 화염** 실루엣 5안. 태양은 계절마다 반지름이 28~56px로 변해 가장자리가 정렬 기준이 못 되고
중심(topInset+96u, 여름 광선이 안 잘리는 값)만 고정이라는 것을 보드로 정리했다.
결정: HUD 두 줄 블록의 세로 중앙을 태양 중심에 맞추고 둘 다 20u 위로(BUILD 31).
화염은 5안 모두 기각되고, 사용자가 보여준 크레용 로켓 그림을 따라 **획을 긋는 방식**으로 갔다
(`renderer.drawFlameFan`, 작업 일지 2026-08-31)

---

**게시본(`naranara-*.html`, 개명 전에 구운 것은 `junglehook-*.html`)은 커밋하지 않는다** — 캔버스 에디터 코드가 통째로 들어가 한 장에 2MB대라
푸시가 막힌다. 원본(`*.dc.html` + `canvas.json`)만 커밋하고, 필요하면 `/design` 스킬로 다시 굽는다.

