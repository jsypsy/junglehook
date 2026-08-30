import { describe, expect, it } from 'vitest'
import { cancelHostTopInset } from './adapter'

const NOTCH = { top: 59, right: 0, bottom: 34, left: 0 }

describe('호스트 상단 크롬 상쇄 (D-022)', () => {
  it('토스 헤더 아래에 놓인 WebView면 상단을 0으로 상쇄한다', () => {
    // 실측(iPhone 16, 앱인토스): 화면 852 / 뷰포트 749 → 헤더+상태바가 103을 이미 먹었다
    const r = cancelHostTopInset(NOTCH, 852, 749)
    expect(r.top).toBe(0)
    // 하단·좌우는 손대지 않는다 — 홈 인디케이터는 여전히 뷰포트 안에 있다
    expect(r.bottom).toBe(34)
    expect(r.left).toBe(0)
    expect(r.right).toBe(0)
  })

  it('전체 화면 WebView면 원래 값이 그대로 남는다', () => {
    expect(cancelHostTopInset(NOTCH, 852, 852).top).toBe(59)
  })

  it('호스트가 일부만 먹었으면 그만큼만 뺀다', () => {
    expect(cancelHostTopInset(NOTCH, 852, 832).top).toBe(39)
  })

  it('화면 크기를 모르면(0·NaN) 값을 건드리지 않는다', () => {
    expect(cancelHostTopInset(NOTCH, 0, 749).top).toBe(59)
    expect(cancelHostTopInset(NOTCH, Number.NaN, 749).top).toBe(59)
  })

  it('뷰포트가 화면보다 크다고 보고돼도 상단이 늘어나지 않는다', () => {
    expect(cancelHostTopInset(NOTCH, 800, 900).top).toBe(59)
  })
})
