/** 홀드/릴리스 단일 입력. 캔버스 전체가 버튼이다 */
export function bindPointer(
  el: HTMLElement,
  onPress: () => void,
  onRelease: () => void,
): () => void {
  const down = (e: Event) => {
    e.preventDefault()
    onPress()
  }
  const up = (e: Event) => {
    e.preventDefault()
    onRelease()
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  window.addEventListener('blur', onRelease)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    window.removeEventListener('blur', onRelease)
  }
}
