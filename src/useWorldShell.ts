import { useCallback, useState } from 'react'
import type { ReferenceDraft } from './components/ReferenceLibrary'
import { snapshotFromGalaxyGraph } from './galaxyCanvas'
import type { NavigationState } from './navigation'
import { clearActiveJsonPath } from './persistence/activeJsonPath'
import {
  commitWorldMutation,
  materializeWorldState,
  resolveWorldMutationSnapshot,
} from './persistence/worldActions'
import { getGalaxyById } from './persistence/worldDocument'
import {
  createGalaxy,
  deleteGalaxy,
  moveGalaxy,
  renameGalaxy,
} from './persistence/worldGalaxies'
import {
  addReference,
  collectReferenceUsages,
  removeReference,
  updateReference,
} from './persistence/worldReferences'
import type { GraphAppWorldState } from './persistence/worldTypes'
import type { GraphPersistInput } from './useGraphApp'

type ApplyCanvas = (session: ReturnType<typeof snapshotFromGalaxyGraph>) => void

export function useWorldShell(options: {
  worldState: GraphAppWorldState | null
  setWorldState: (next: GraphAppWorldState) => void
  getSnapshot: () => GraphPersistInput
  cancelPendingAutosave: () => void
  applyCanvas: ApplyCanvas
  resetSessionUi: () => void
  setActiveJsonPath: (path: string | null) => void
  setError: (message: string | null) => void
}) {
  const {
    worldState,
    setWorldState,
    getSnapshot,
    cancelPendingAutosave,
    applyCanvas,
    resetSessionUi,
    setActiveJsonPath,
    setError,
  } = options

  const [nav, setNav] = useState<NavigationState>({ mode: 'universe' })
  const [selectedUniverseGalaxyId, setSelectedUniverseGalaxyId] = useState<string | null>(
    null,
  )
  const [highlightGalaxyId, setHighlightGalaxyId] = useState<string | null>(null)
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false)

  const failureMessage = (result: { ok: false; reason: string; message?: string }) =>
    result.message ?? `World save failed (${result.reason})`

  const runMutation = useCallback(
    async (
      mutator: (ws: GraphAppWorldState) => GraphAppWorldState,
      opts?: { backupFirst?: boolean; materialize?: boolean },
    ) => {
      if (!worldState) return false
      cancelPendingAutosave()
      const snapshot = resolveWorldMutationSnapshot(nav.mode, opts, getSnapshot)
      try {
        const result = await commitWorldMutation(worldState, snapshot, mutator, {
          backupFirst: opts?.backupFirst,
        })
        if (!result.ok) {
          setError(failureMessage(result))
          return false
        }
        setWorldState(result.worldState)
        setError(null)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'World mutation failed')
        return false
      }
    },
    [worldState, nav.mode, cancelPendingAutosave, getSnapshot, setWorldState, setError],
  )

  const enterGalaxy = useCallback(
    async (galaxyId: string) => {
      if (!worldState) return
      const target = getGalaxyById(worldState.world, galaxyId)
      if (!target) return

      cancelPendingAutosave()

      let nextState = worldState
      if (nav.mode === 'galaxy' && nav.galaxyId !== galaxyId) {
        const saved = await commitWorldMutation(
          materializeWorldState(worldState, getSnapshot()),
          null,
          (ws) => ws,
        )
        if (!saved.ok) {
          setError(failureMessage(saved))
          return
        }
        nextState = saved.worldState
        setActiveJsonPath(null)
        clearActiveJsonPath()
      } else if (worldState.activeGalaxyId !== galaxyId) {
        setActiveJsonPath(null)
        clearActiveJsonPath()
      }

      const galaxy = getGalaxyById(nextState.world, galaxyId)
      if (!galaxy) return
      applyCanvas(snapshotFromGalaxyGraph(galaxy.graph))
      resetSessionUi()
      setWorldState({ ...nextState, activeGalaxyId: galaxyId })
      setNav({ mode: 'galaxy', galaxyId })
      setSelectedUniverseGalaxyId(galaxyId)
      setHighlightGalaxyId(null)
    },
    [
      worldState,
      nav,
      cancelPendingAutosave,
      getSnapshot,
      setWorldState,
      setError,
      applyCanvas,
      resetSessionUi,
      setActiveJsonPath,
    ],
  )

  const returnToUniverse = useCallback(async () => {
    if (!worldState) return
    if (nav.mode !== 'galaxy') {
      setNav({ mode: 'universe' })
      return
    }
    cancelPendingAutosave()
    const leftId = nav.galaxyId
    const result = await commitWorldMutation(worldState, getSnapshot(), (ws) => ws)
    if (!result.ok) {
      setError(failureMessage(result))
      return
    }
    setWorldState(result.worldState)
    setNav({ mode: 'universe' })
    resetSessionUi()
    setSelectedUniverseGalaxyId(leftId)
    setHighlightGalaxyId(leftId)
    window.setTimeout(() => setHighlightGalaxyId(null), 400)
  }, [
    worldState,
    nav,
    cancelPendingAutosave,
    getSnapshot,
    setWorldState,
    setError,
    resetSessionUi,
  ])

  const handleCreateGalaxy = useCallback(async () => {
    await runMutation((ws) => {
      const created = createGalaxy(ws.world)
      return { ...ws, world: created.world }
    })
  }, [runMutation])

  const handleRenameGalaxy = useCallback(
    async (galaxyId: string) => {
      if (!worldState) return
      const galaxy = getGalaxyById(worldState.world, galaxyId)
      if (!galaxy) return
      const next = window.prompt('Galaxy name', galaxy.name)
      if (next == null) return
      await runMutation((ws) => ({
        ...ws,
        world: renameGalaxy(ws.world, galaxyId, next),
      }))
    },
    [worldState, runMutation],
  )

  const handleDeleteGalaxy = useCallback(
    async (galaxyId: string) => {
      if (!worldState) return
      if (worldState.world.galaxies.length <= 1) {
        setError('Cannot delete the last Galaxy')
        return
      }
      const galaxy = getGalaxyById(worldState.world, galaxyId)
      if (!galaxy) return
      if (!window.confirm(`Delete Galaxy "${galaxy.name}"? This cannot be undone.`)) return

      const deletingActive = worldState.activeGalaxyId === galaxyId
      const remaining = worldState.world.galaxies.filter((g) => g.id !== galaxyId)
      const fallbackGalaxy = deletingActive ? remaining[0] ?? null : null

      const ok = await runMutation(
        (ws) => {
          const world = deleteGalaxy(ws.world, galaxyId)
          const activeGalaxyId =
            ws.activeGalaxyId === galaxyId ? world.galaxies[0]!.id : ws.activeGalaxyId
          return { world, activeGalaxyId }
        },
        { backupFirst: true },
      )
      if (!ok) return

      setSelectedUniverseGalaxyId((id) => (id === galaxyId ? null : id))

      // Active delete is a Galaxy-switch transaction for hidden runtime only.
      // Stay in Universe mode — do not auto-enter the fallback Galaxy.
      if (deletingActive && fallbackGalaxy) {
        applyCanvas(snapshotFromGalaxyGraph(fallbackGalaxy.graph))
        resetSessionUi()
        setActiveJsonPath(null)
        clearActiveJsonPath()
      }
    },
    [worldState, runMutation, setError, applyCanvas, resetSessionUi, setActiveJsonPath],
  )

  const handleMoveGalaxy = useCallback(
    async (galaxyId: string, position: { x: number; y: number }) => {
      await runMutation((ws) => ({
        ...ws,
        world: moveGalaxy(ws.world, galaxyId, position),
      }))
    },
    [runMutation],
  )

  const handleCreateReference = useCallback(
    async (draft: ReferenceDraft) =>
      runMutation((ws) => ({
        ...ws,
        world: addReference(ws.world, draft),
      })),
    [runMutation],
  )

  const handleUpdateReference = useCallback(
    async (referenceId: string, draft: ReferenceDraft) =>
      runMutation((ws) => ({
        ...ws,
        world: updateReference(ws.world, referenceId, draft),
      })),
    [runMutation],
  )

  const handleDeleteReference = useCallback(
    async (referenceId: string) =>
      runMutation((ws) => ({
        ...ws,
        world: removeReference(ws.world, referenceId),
      })),
    [runMutation],
  )

  return {
    nav,
    selectedUniverseGalaxyId,
    setSelectedUniverseGalaxyId,
    highlightGalaxyId,
    referenceLibraryOpen,
    setReferenceLibraryOpen,
    enterGalaxy,
    returnToUniverse,
    handleCreateGalaxy,
    handleRenameGalaxy,
    handleDeleteGalaxy,
    handleMoveGalaxy,
    handleCreateReference,
    handleUpdateReference,
    handleDeleteReference,
    usagesFor: (referenceId: string) =>
      worldState ? collectReferenceUsages(worldState.world, referenceId) : [],
  }
}
