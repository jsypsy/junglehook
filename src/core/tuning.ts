/**
 * 게임 감각을 좌우하는 상수 전부. 밸런싱은 이 파일만 만진다.
 * 값의 근거는 docs/PROGRESS.md의 계측 기록에 남긴다.
 */
export const TUNING = {
  /** 중력 (px/s²) */
  gravity: 2000,
  /** 자유 비행 공기 저항 (1/s) — 발사 직후 속도를 읽을 수 있는 범위로 빨리 내린다 (B4 0.12 → B5 0.2) */
  airDrag: 0.2,
  /** 로프에 매달린 동안의 저항 (1/s) — 0이면 진폭이 안 죽어 "수직 정지" 상태가 생기지 않는다 */
  ropeDrag: 0,
  /** 로프가 닿는 최대 거리 (px) — 타깃 후보의 반경. 340은 앵커선(175)+340=515(화면 69%) 아래가
   *  "잡을 것 없는 확정 낙하"라 사용자가 "하단 30%에서 로프를 못 쏘고 죽는다"고 느꼈다 → 450 (D-007) */
  reach: 450,
  /** 홀드 중 로프가 감기는 속도 (px/s) — 고도 회복 수단. 0이면 순수 진자 */
  reelSpeed: 110,
  /** 감기 시 접선 속력 증가 지수 — 0: 속력 유지, 1: 각운동량 보존 (r_old/r_new 배) */
  reelGain: 0,
  /** 스윙 펌프 (px/s²) — 매달린 동안 진행 방향으로 넣는 가속. 오래 매달릴수록 높이 차오르는 축 */
  swingPump: 200,
  /** 펌프가 붙는 속력 상한 (px/s) — 90° 진폭 속도 √(2·g·minRope)≈720 아래로 두면 회전·느슨해짐 없음.
   *  (350/1100은 360° 회전이 났고 각속도 2.5회전/s로 앵커가 안 보임 — 실플레이 피드백) */
  swingMaxSpeed: 1050,
  /** 홀드 중 로프를 강체(막대)로 — 90° 위에서 느슨해지지 않아 펌프로 천천히 한 바퀴를 넘길 수 있다 */
  rigidRope: true,
  /** 로프 최소 길이 (px) — 이 이하로는 감기지 않는다. 짧을수록 각속도가 빨라 정신없다 (90→130: 0.6회전/s) */
  minRope: 130,
  /** 설계 기준 뷰포트 (px) — frame.html 실측값 */
  viewW: 393,
  viewH: 749,
  /** 이 아래로 떨어지면 사망 (px) — 화면(749) 아래로 공이 완전히 사라지는 지점. 사망 연출(파편·흔들림)이
   *  데드라인을 대신 보여준다. 강물 띠는 줌 변화로 위아래 움직여 버그처럼 보여 제거 (D-007) */
  killY: 770,
  /** 시작 위치·속도 — 첫 탭 직후 자유 비행으로 던져진다 */
  startPos: { x: 60, y: 300 },
  startVel: { x: 380, y: -120 },
  /** 카메라 줌아웃 — 속도 speedLo에서 1.0, speedHi에서 min까지 (빠를수록 앞을 더 보여준다) */
  camZoom: { speedLo: 600, speedHi: 1200, min: 0.78 },
  /** 이어하기(리워드 광고) 판당 최대 횟수 — D-001 "1~2회 제한" */
  maxContinues: 2,
  /** 이어하기 재출발: 마지막으로 지나친 앵커 기준 오프셋과 초기 속도 — 정상 릴리스(+30°, 전방 위)와 같은 궤적 */
  continueSpawn: { dx: 75, dy: 130, vx: 520, vy: -300 },
  /** 계절 진행 (D-010): stepM마다 봄→여름→가을→겨울, 경계에서 blendM 동안 색 보간 */
  season: { stepM: 50, blendM: 20 }, // ⚠ 테스트용 50m — 판정 끝나면 250/40으로 되돌린다
  /** 거리 → 미터 환산 (px per m) */
  pxPerMeter: 50,
  /** 타깃 선택: 플레이어 기준 선호 지점 오프셋 (전방·위쪽 바이어스) */
  targetBias: { x: 130, y: -150 },
  /** 앵커는 플레이어보다 최소 이만큼 위에 있어야 후보가 된다 (px) */
  targetMinAbove: 20,
  /** 이만큼 뒤로 지나간 앵커는 후보에서 제외 (px) — 낮게 날 때 "앞은 너무 높고 뒤는 제외"가 겹치지 않게 120 (D-007) */
  targetBehindLimit: 120,
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
    /** 난이도가 최대에 도달하는 x (px) — 9000은 180m(≈15s)에 최대 난이도라 세션이 목표(30~60s)의 절반 (D-006) */
    rampX: 18000,
  },
} as const

/**
 * A/B 프리셋 — `?p=b4`처럼 URL로 고른다 (실기기에서 번갈아 판정용). 기본은 TUNING 그대로(B5).
 * 프리셋은 TUNING 위에 덮어쓰므로 게임 시작 전에 한 번만 적용한다.
 */
export const PRESETS: Record<string, Partial<Record<keyof typeof TUNING, unknown>>> = {
  /** BUILD 4: 회전 없음(≤83°), 느긋한 스윙 */
  b4: { rigidRope: false, swingPump: 150, swingMaxSpeed: 650, airDrag: 0.12 },
}

export function applyPreset(name: string | null): string | null {
  if (!name || !(name in PRESETS)) return null
  Object.assign(TUNING as Record<string, unknown>, PRESETS[name])
  return name
}

