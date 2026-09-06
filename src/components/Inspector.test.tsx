/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Inspector } from './Inspector'
import { createPassiveData } from '../graphFactory'
import type { PassiveNodeData } from '../types'

const noop = () => undefined

function mountInspector(data: PassiveNodeData, extras: Partial<Parameters<typeof Inspector>[0]> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const props = {
    nodeId: 'n1',
    data,
    masteryLabel: extras.masteryLabel ?? null,
    masteryTierCount: extras.masteryTierCount ?? null,
    onRename: noop,
    onChangeKind: noop,
    onChangeSymbolId: noop,
    onChangeStages: noop,
    onChangeMarkdown: noop,
    onChangeConnectEnabled: noop,
    onChangeOrbitTierCount: noop,
    onChangeSatelliteOrbitTier: noop,
    onChangeOrbitStartAngle: noop,
    onChangeOrbitOrder: noop,
    onChangeOrbitLocked: noop,
    onChangeOrbitCapacity: noop,
    onChangeRootOrbitCapacity: noop,
    onChangeRootOrbitStartAngle: noop,
    onDetachFromMastery: extras.onDetachFromMastery ?? noop,
    onDeleteNode: noop,
    ...extras,
  } as Parameters<typeof Inspector>[0]
  act(() => {
    root.render(<Inspector {...props} />)
  })
  return {
    host,
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('Inspector Root Orbit vs Mastery Orbit sections', () => {
  it('shows Root Orbit tier/slot for Root Orbit Notable', () => {
    const data = createPassiveData('notable', 'N', {
      rootOrbitTier: 2,
      rootOrbitSlot: 0,
    })
    const { host, unmount } = mountInspector(data)
    const text = host.textContent ?? ''
    expect(text).toContain('Root Orbit')
    expect(text).toContain('2단 · 슬롯 1')
    expect(text).toContain('Mastery Orbit')
    expect(text).toContain('Not on a Mastery Orbit.')
    expect(text).not.toMatch(/Orbit of:/)
    unmount()
  })

  it('shows Root Orbit status for Root Orbit Shard', () => {
    const data = createPassiveData('shard', 'S', {
      rootOrbitTier: 2,
      rootOrbitSlot: 0,
    })
    const { host, unmount } = mountInspector(data)
    expect(host.textContent).toContain('2단 · 슬롯 1')
    expect(host.textContent).toContain('Not on a Mastery Orbit.')
    unmount()
  })

  it('shows Mastery Orbit membership without Root Orbit membership', () => {
    const data = createPassiveData('notable', 'Sat', {
      masteryId: 'm1',
      orbitTier: 1,
    })
    const { host, unmount } = mountInspector(data, { masteryLabel: '댄스' })
    const text = host.textContent ?? ''
    expect(text).toContain('Not on Root Orbit.')
    expect(text).toContain('Mastery Orbit')
    expect(text).toContain('Orbit of: 댄스')
    expect(text).not.toContain('2단 · 슬롯')
    unmount()
  })

  it('shows neither membership for external Shard/Notable', () => {
    const data = createPassiveData('shard', 'Ext')
    const { host, unmount } = mountInspector(data)
    const text = host.textContent ?? ''
    expect(text).toContain('Not on Root Orbit.')
    expect(text).toContain('Not on a Mastery Orbit.')
    expect(text).not.toMatch(/Orbit of:/)
    unmount()
  })

  it('keeps Mastery Detach control when on a Mastery Orbit', () => {
    const onDetachFromMastery = vi.fn()
    const data = createPassiveData('notable', 'Sat', {
      masteryId: 'm1',
      orbitTier: 2,
    })
    const { host, unmount } = mountInspector(data, {
      masteryLabel: '댄스',
      masteryTierCount: 3,
      onDetachFromMastery,
    })
    const detach = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Detach'),
    )
    expect(detach).toBeTruthy()
    act(() => {
      detach!.click()
    })
    expect(onDetachFromMastery).toHaveBeenCalledWith('n1')
    expect(host.textContent).toContain('Orbit tier')
    unmount()
  })
})
