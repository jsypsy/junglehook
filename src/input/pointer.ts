/** 홀드/릴리스 단일 입력. 캔버스 전체가 버튼이다 */
export function bindPointer(
  el: HTMLElement,
  onPress: (x: number, y: number) => void,
  onRelease: () => void,
): () => void {
  const down = (e: Event) => {
    e.preventDefault()
    const pe = e as PointerEvent
    onPress(pe.clientX, pe.clientY)
  }
  const up = (e: Event) => {
    e.preventDefault()
    onRelease()
  }
  // iOS WebKit: pointer 이벤트의 preventDefault로는 네이티브 터치 동작(더블탭 돋보기·확대, 길게 누르기 콜아웃)을
  // 못 막는다 — touch 이벤트를 non-passive로 잡아 직접 막아야 한다 (실기기 피드백 "더블터치하면 돋보기가 뜬다")
  const swallow = (e: Event) => e.preventDefault()
  const touchOpts: AddEventListenerOptions = { passive: false }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('touchstart', swallow, touchOpts)
  el.addEventListener('touchmove', swallow, touchOpts)
  el.addEventListener('touchend', swallow, touchOpts)
  el.addEventListener('contextmenu', swallow)
  el.addEventListener('dblclick', swallow)
  document.addEventListener('gesturestart', swallow, touchOpts)
  window.addEventListener('blur', onRelease)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    el.removeEventListener('touchstart', swallow)
    el.removeEventListener('touchmove', swallow)
    el.removeEventListener('touchend', swallow)
    el.removeEventListener('contextmenu', swallow)
    el.removeEventListener('dblclick', swallow)
    document.removeEventListener('gesturestart', swallow)
    window.removeEventListener('blur', onRelease)
  }
}
