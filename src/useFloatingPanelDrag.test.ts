/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
  clampFloatingPanelPosition,
  isFloatingPanelDragIgnoredTarget,
} from './useFloatingPanelDrag'

describe('useFloatingPanelDrag helpers', () => {
  it('clamps panel position inside the viewport', () => {
    expect(clampFloatingPanelPosition(-40, -20, 200, 100, 800, 600)).toEqual({
      x: 8,
      y: 8,
    })
    expect(clampFloatingPanelPosition(900, 700, 200, 100, 800, 600)).toEqual({
      x: 592,
      y: 492,
    })
    expect(clampFloatingPanelPosition(100, 80, 200, 100, 800, 600)).toEqual({
      x: 100,
      y: 80,
    })
  })

  it('ignores interactive targets for drag start', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <header data-testid="head">
        <strong>Title</strong>
        <button type="button">닫기</button>
      </header>
    `
    const head = host.querySelector('header')!
    const strong = host.querySelector('strong')!
    const button = host.querySelector('button')!
    expect(isFloatingPanelDragIgnoredTarget(button)).toBe(true)
    expect(isFloatingPanelDragIgnoredTarget(strong)).toBe(false)
    expect(isFloatingPanelDragIgnoredTarget(head)).toBe(false)
    expect(isFloatingPanelDragIgnoredTarget(null)).toBe(true)
  })
})
