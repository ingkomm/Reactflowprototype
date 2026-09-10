import type { ClipboardEvent } from 'react'
import {
  extractSvgFromClipboard,
  insertAtTextareaSelection,
  wrapSvgMarkdownFence,
} from './clipboardSvg'

/**
 * If clipboard holds Draw.io / SVG payload, insert ```svg fenced block at caret.
 * Returns true when paste was handled (caller should skip default).
 */
export function tryPasteSvgIntoTextarea(
  event: ClipboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
): boolean {
  const svg = extractSvgFromClipboard(event.clipboardData)
  if (!svg) return false

  event.preventDefault()
  const target = event.currentTarget
  const fence = wrapSvgMarkdownFence(svg)
  const { value: next, caret } = insertAtTextareaSelection(
    value,
    target.selectionStart,
    target.selectionEnd,
    fence,
  )
  onChange(next)
  requestAnimationFrame(() => {
    target.focus()
    target.setSelectionRange(caret, caret)
  })
  return true
}
