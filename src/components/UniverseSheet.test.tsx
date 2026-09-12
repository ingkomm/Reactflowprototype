/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UniverseSheet } from './UniverseSheet'
import type { GalaxyDocumentV03 } from '../persistence/worldTypes'

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function galaxy(id: string, name: string, x: number, y: number): GalaxyDocumentV03 {
  return {
    id,
    name,
    universePosition: { x, y },
    graph: {
      schemaVersion: '0.1',
      nodes: [],
      edges: [],
      customSymbols: [],
      settings: {},
    },
  } as unknown as GalaxyDocumentV03
}

describe('UniverseSheet Edit Mode', () => {
  const galaxies = [
    galaxy('g-a', 'Alpha', 100, 100),
    galaxy('g-b', 'Beta', 400, 250),
  ]

  function renderSheet(
    overrides: Partial<ComponentProps<typeof UniverseSheet>> = {},
  ) {
    const onMoveGalaxy = vi.fn()
    const onEnterGalaxy = vi.fn()
    const onEditingChange = vi.fn()
    const props: ComponentProps<typeof UniverseSheet> = {
      width: 800,
      height: 500,
      galaxies,
      selectedGalaxyId: 'g-a',
      editing: false,
      onEditingChange,
      onSelectGalaxy: vi.fn(),
      onEnterGalaxy,
      onMoveGalaxy,
      onCreateGalaxy: vi.fn(),
      onRenameGalaxy: vi.fn(),
      onDeleteGalaxy: vi.fn(),
      onOpenReferenceLibrary: vi.fn(),
      ...overrides,
    }
    const view = render(<UniverseSheet {...props} />)
    return { ...view, onMoveGalaxy, onEnterGalaxy, onEditingChange, props }
  }

  it('T5: Normal Mode hides structure tools; Edit Mode shows them', () => {
    const { rerender, onEditingChange, props } = renderSheet({ editing: false })
    expect(screen.getByTestId('universe-edit-toggle')).toBeTruthy()
    expect(screen.queryByTestId('universe-new-galaxy')).toBeNull()
    expect(screen.queryByTestId('universe-rename-galaxy')).toBeNull()
    expect(screen.queryByTestId('universe-delete-galaxy')).toBeNull()

    fireEvent.click(screen.getByTestId('universe-edit-toggle'))
    expect(onEditingChange).toHaveBeenCalledWith(true)

    rerender(<UniverseSheet {...props} editing />)
    expect(screen.getByTestId('universe-edit-done')).toBeTruthy()
    expect(screen.getByTestId('universe-new-galaxy')).toBeTruthy()
    expect(screen.getByTestId('universe-rename-galaxy')).toBeTruthy()
    expect(screen.getByTestId('universe-delete-galaxy')).toBeTruthy()
    expect(screen.queryByTestId('universe-edit-toggle')).toBeNull()
  })

  it('T3: Normal Mode gateway drag does not call onMoveGalaxy', () => {
    const { onMoveGalaxy } = renderSheet({ editing: false })
    const gateway = screen.getByTestId('galaxy-gateway-g-a')
    fireEvent.pointerDown(gateway, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(gateway, { clientX: 180, clientY: 160, pointerId: 1 })
    fireEvent.pointerUp(gateway, { clientX: 180, clientY: 160, pointerId: 1 })
    expect(onMoveGalaxy).not.toHaveBeenCalled()
  })

  it('T4: Edit Mode gateway drag calls onMoveGalaxy', () => {
    const { onMoveGalaxy } = renderSheet({ editing: true })
    const gateway = screen.getByTestId('galaxy-gateway-g-a')
    const surface = screen.getByTestId('universe-sheet').querySelector('.universe-sheet__viewport')
    expect(surface).toBeTruthy()
    vi.spyOn(surface as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 500,
      right: 800,
      width: 800,
      height: 500,
      toJSON() {
        return {}
      },
    })
    fireEvent.pointerDown(gateway, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(gateway, { clientX: 260, clientY: 220, pointerId: 1 })
    fireEvent.pointerUp(gateway, { clientX: 260, clientY: 220, pointerId: 1 })
    expect(onMoveGalaxy).toHaveBeenCalled()
    expect(onMoveGalaxy.mock.calls[0]![0]).toBe('g-a')
  })

  it('T6: double-click enter exits Edit Mode via onEditingChange(false)', () => {
    const { onEnterGalaxy, onEditingChange } = renderSheet({ editing: true })
    const gateway = screen.getByTestId('galaxy-gateway-g-b')
    fireEvent.doubleClick(gateway)
    expect(onEditingChange).toHaveBeenCalledWith(false)
    expect(onEnterGalaxy).toHaveBeenCalled()
    expect(onEnterGalaxy.mock.calls[0]![0]).toBe('g-b')
    expect(onEnterGalaxy.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    )
  })
})
