/**
 * WebAudio 신스 효과음 — 오디오 에셋 없이 오실레이터 합성 (8비트 음색).
 *
 * 기동·복구 뼈대는 한줄팡에서 검증된 것을 그대로 가져왔다 (한줄팡 D-009~D-012,
 * iOS 첫 탭 무음으로 며칠 태우고 얻은 결론):
 * - AudioContext는 **사용자 제스처 안에서만** 생성 (로드 시점 생성은 iOS에서
 *   영구 무음 컨텍스트가 될 수 있다)
 * - 생성 직후 resume + 무음 버퍼 재생 (고전 unlock 킥)
 * - state가 'running'이어도 **오디오 시계가 실제로 흐를 때까지** 재생을 보관
 *   (시계 정지 상태에서 예약하면 볼륨 곡선이 통째로 과거가 되어 무음)
 * - 백그라운드 전환 시 즉시 정지 (앱인토스 심사 요건)
 */
export class SoundPlayer {
  private ctx: AudioContext | null = null
  private muted = false
  /** 의도적 백그라운드 정지 중 — 자동 복구가 되살리면 안 된다 */
  private backgrounded = false
  /** 기동 전에 요청된 효과음 — 기동 즉시 재생 */
  private pending: Array<() => void> = []
  private pendingAt = 0
  /** 오디오 시계가 실제로 흐르는 것을 확인했는가 */
  private clockLive = false
  private clockWatching = false
  /** 진단용 이벤트 타임라인 (개발 배지) */
  private trace: string[] = []
  private readonly t0 = performance.now()

  private mark(ev: string): void {
    this.trace.push(`${Math.round(performance.now() - this.t0)}:${ev}`)
    if (this.trace.length > 6) this.trace.shift()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  isMuted(): boolean {
    return this.muted
  }

  debugState(): string {
    return `ctx:${this.ctx ? this.ctx.state : 'none'} | ${this.trace.join(' ')}`
  }

  /** 사용자 제스처(pointerdown/up) 안에서 호출. 여러 번 불러도 안전 */
  unlock(): void {
    if (this.muted) return
    this.backgrounded = false

    if (!this.ctx || this.ctx.state === 'closed') {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.clockLive = false
      this.clockWatching = false
      this.mark(`new:${this.ctx.state}`)
      this.ctx.addEventListener('statechange', () => {
        if (this.ctx?.state === 'running') this.onRunning()
      })
    }

    if (this.ctx.state === 'running') {
      this.onRunning()
      return
    }

    this.ctx.resume().then(() => this.onRunning()).catch(() => this.mark('resX'))
    try {
      const src = this.ctx.createBufferSource()
      src.buffer = this.ctx.createBuffer(1, 1, 22050)
      src.connect(this.ctx.destination)
      src.start(0)
    } catch {
      // 무시 — 다음 제스처에서 재시도
    }
  }

  /** 백그라운드 전환 — 심사 요건: 사운드 즉시 종료 */
  suspendForBackground(): void {
    this.backgrounded = true
    this.clockLive = false
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => {})
    }
  }

  /** 포그라운드 복귀 — 실제 기동은 다음 제스처의 unlock이 담당 */
  markSuspect(): void {
    this.backgrounded = false
  }

  private onRunning(): void {
    if (!this.ctx || this.ctx.state !== 'running') return
    if (this.clockLive) {
      this.flushPending()
      return
    }
    if (this.clockWatching) return

    const started = this.ctx.currentTime
    this.clockWatching = true
    let attempts = 0
    const watch = (): void => {
      const ctx = this.ctx
      if (!ctx || ctx.state !== 'running') {
        this.clockWatching = false
        return
      }
      if (ctx.currentTime > started || attempts >= 15) {
        this.clockWatching = false
        this.clockLive = true
        this.mark(`live@${attempts}`)
        this.flushPending()
        return
      }
      attempts++
      setTimeout(watch, 20)
    }
    watch()
  }

  private flushPending(): void {
    if (this.pending.length === 0) return
    const fns = this.pending
    this.pending = []
    if (performance.now() - this.pendingAt < 1500) {
      this.mark(`flush${fns.length}`)
      for (const f of fns) f()
    }
  }

  /** @param endFreq 주면 dur 동안 freq→endFreq로 미끄러진다 */
  private tone(
    freq: number,
    delay: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    endFreq?: number,
  ): void {
    if (this.muted || this.backgrounded) return
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running' || !this.clockLive) {
      if (this.pending.length < 8) {
        this.mark(`q:${ctx ? ctx.state : 'none'}`)
        this.pending.push(() => this.tone(freq, delay, dur, type, peak, endFreq))
        this.pendingAt = performance.now()
      }
      this.onRunning()
      return
    }
    const t = ctx.currentTime + delay + 0.02
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  // ── 슈팅 음색 ────────────────────────────────────────────────────────────

  /**
   * 발사 — 초당 4~5번 울리므로 아주 짧고 조용하게.
   * square의 하강 삑이 고전 아케이드 '퓨' 그 소리다
   */
  shoot(): void {
    this.tone(1180, 0, 0.05, 'square', 0.035, 320)
  }

  /** 격추 팝 — 짧은 하강 쿵. 연달아 터져도 뭉개지지 않게 짧게 */
  kill(): void {
    this.tone(300, 0, 0.14, 'sawtooth', 0.14, 70)
    this.tone(620, 0, 0.07, 'square', 0.06, 200)
  }

  /** 보스 격추 — 크고 길게, 파편 잔향까지 */
  bossKill(): void {
    this.tone(150, 0, 0.6, 'sine', 0.4, 40)
    this.tone(240, 0.02, 0.4, 'sawtooth', 0.18, 60)
    for (let i = 0; i < 5; i++) {
      this.tone(880 + i * 240, 0.1 + i * 0.06, 0.16, 'triangle', 0.07, 380 + i * 80)
    }
  }

  /** 보스 등장 경보 — 낮은 2음 반복 */
  bossWarn(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(220, i * 0.24, 0.11, 'square', 0.12)
      this.tone(165, i * 0.24 + 0.12, 0.11, 'square', 0.12)
    }
  }

  /** 윙맨 격추당함 — 짧고 씁쓸한 하강 */
  miniDown(): void {
    this.tone(760, 0, 0.16, 'sawtooth', 0.16, 160)
    this.tone(380, 0.05, 0.12, 'square', 0.09, 120)
  }

  /** 실드로 한 번 막았다 — 금속성 챙 */
  shieldHit(): void {
    this.tone(1400, 0, 0.09, 'square', 0.16, 900)
    this.tone(700, 0.02, 0.16, 'triangle', 0.12)
  }

  /** 스테이지 클리어 — 상행 팡파르 */
  stageClear(): void {
    const base = 523
    for (const [mul, i] of [
      [1, 0],
      [1.26, 1],
      [1.5, 2],
      [2, 3],
    ] as const) {
      this.tone(base * mul, 0.04 + i * 0.08, 0.24, 'square', 0.12)
    }
    this.tone(131, 0.04, 0.4, 'sine', 0.22)
  }

  /** 카드 선택 — 확정 딩 */
  cardPick(): void {
    this.tone(660, 0, 0.08, 'triangle', 0.16)
    this.tone(990, 0.06, 0.14, 'triangle', 0.13)
  }

  /** 부활 — 파워업 상행 슬라이드 */
  revive(): void {
    this.tone(200, 0, 0.35, 'square', 0.14, 1200)
    this.tone(1568, 0.3, 0.18, 'triangle', 0.1)
  }

  /** UI 탭 */
  button(): void {
    this.tone(440, 0, 0.06, 'triangle', 0.15)
  }

  gameOver(): void {
    this.tone(330, 0, 0.18, 'sawtooth', 0.16)
    this.tone(262, 0.14, 0.18, 'sawtooth', 0.16)
    this.tone(196, 0.28, 0.32, 'sawtooth', 0.16)
  }
}
