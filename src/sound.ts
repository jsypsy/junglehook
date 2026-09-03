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

  // ── 날아날아 음색 (BUILD 37, D-021 최소 5개 + UI 탭) ───────────────────

  /** 로프가 잎에 걸림 — 짧게 튀는 상행 "팅". 잡기가 초당 한 번꼴이라 짧고 가볍게 */
  grab(): void {
    this.tone(720, 0, 0.07, 'square', 0.09, 1250)
    this.tone(1500, 0.02, 0.06, 'triangle', 0.07)
  }

  /** 놓음 — 하행 휘익. 이 순간이 게임의 이름이다: 관성 발사가 들려야 손맛이 산다 */
  release(): void {
    this.tone(760, 0, 0.2, 'triangle', 0.11, 240)
    this.tone(380, 0.02, 0.12, 'sine', 0.06, 160)
  }

  /** 슈퍼 찬스 열림 — 히트스톱과 함께 울리는 상행 아르페지오 + 낮은 울림 */
  chance(): void {
    for (const [f, i] of [[880, 0], [1109, 1], [1319, 2], [1760, 3]] as const) {
      this.tone(f, 0.03 + i * 0.07, 0.22, 'triangle', 0.13)
    }
    this.tone(220, 0, 0.45, 'sine', 0.2, 110)
  }

  /** 게이지 성공 — 로켓 점화: 낮은 톱니가 치솟고 끝에 삑 */
  dash(): void {
    this.tone(160, 0, 0.42, 'sawtooth', 0.15, 980)
    this.tone(90, 0, 0.3, 'sine', 0.22, 60)
    this.tone(1320, 0.34, 0.12, 'square', 0.08, 1760)
  }

  /** 게이지 실패 — 김 빠지는 하행 버즈. 억울하지 않게 짧고 가볍게 */
  dashFail(): void {
    this.tone(320, 0, 0.16, 'square', 0.1, 150)
    this.tone(180, 0.1, 0.16, 'square', 0.08, 90)
  }

  /** 사망 — 추락·잡힘 공통: 둔탁한 쿵 + 하행 세 음 (결과 카드 "끝"과 같은 문법) */
  die(): void {
    this.tone(120, 0, 0.3, 'sine', 0.3, 45)
    this.tone(330, 0.05, 0.16, 'sawtooth', 0.11)
    this.tone(262, 0.19, 0.16, 'sawtooth', 0.11)
    this.tone(196, 0.33, 0.3, 'sawtooth', 0.11)
  }

  /** UI 탭 (소리 켜기 확인음) */
  button(): void {
    this.tone(440, 0, 0.06, 'triangle', 0.15)
  }
}
