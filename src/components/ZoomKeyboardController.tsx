import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'

/** Page Up / Page Down zoom; skips when focus is in a text field. */
export function ZoomKeyboardController() {
  const { zoomIn, zoomOut } = useReactFlow()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'PageUp' && event.key !== 'PageDown') return

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }

      event.preventDefault()
      if (event.key === 'PageUp') {
        zoomIn({ duration: 180 })
      } else {
        zoomOut({ duration: 180 })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomIn, zoomOut])

  return null
}
