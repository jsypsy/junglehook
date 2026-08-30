/**
 * 게임 감각을 좌우하는 상수 전부. 밸런싱은 이 파일만 만진다.
 * 값의 근거는 docs/PROGRESS.md의 계측 기록에 남긴다.
 */
export const TUNING = {
  /** 중력 (px/s²) */
  gravity: 2000,
  /** 공기 저항 (1/s) — reel-in이 계속 넣는 에너지의 배출구. 속도 상한을 만든다 */
  airDrag: 0.12,
  /** 로프가 닿는 최대 거리 (px) — 타깃 후보의 반경 */
  reach: 340,
  /** 홀드 중 로프가 감기는 속도 (px/s) — 고도 회복 수단. 0이면 순수 진자 */
  reelSpeed: 110,
  /** 로프 최소 길이 (px) — 이 이하로는 감기지 않는다 */
  minRope: 90,
  /** 설계 기준 뷰포트 (px) — frame.html 실측값 */
  viewW: 393,
  viewH: 749,
  /** 이 아래로 떨어지면 사망 (px) */
  killY: 830,
  /** 시작 위치·속도 — 첫 탭 직후 자유 비행으로 던져진다 */
  startPos: { x: 60, y: 300 },
  startVel: { x: 380, y: -120 },
  /** 거리 → 미터 환산 (px per m) */
  pxPerMeter: 50,
  /** 타깃 선택: 플레이어 기준 선호 지점 오프셋 (전방·위쪽 바이어스) */
  targetBias: { x: 130, y: -150 },
  /** 앵커는 플레이어보다 최소 이만큼 위에 있어야 후보가 된다 (px) */
  targetMinAbove: 20,
  /** 이만큼 뒤로 지나간 앵커는 후보에서 제외 (px) */
  targetBehindLimit: 60,
  /** 앵커 배치 — 난이도 곡선 */
  anchor: {
    /** 첫 앵커 위치 */
    first: { x: 210, y: 170 },
    /** 세로 배치 중심과 허용 범위 */
    baseY: 175,
    yMin: 80,
    yMax: 360,
    /** 가로 간격: 시작 → rampX 지점에서 최대 */
    gapMin: 175,
    gapMax: 300,
    /** 세로 흔들림: 시작 → rampX 지점에서 최대 */
    jitterMin: 35,
    jitterMax: 130,
    /** 난이도가 최대에 도달하는 x (px) */
    rampX: 9000,
  },
} as const
