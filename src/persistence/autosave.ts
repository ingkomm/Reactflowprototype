/**
 * Autosave facade over WorldStore (v0.3).
 * Public API still speaks GraphDocument — World wrap/unwrap happens here.
 * Bootstrap preference stays in localStorage; payloads go through WorldStore.
 */
import type { GraphDocumentV01 } from '../graphDocument'
import {
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
} from './workspaceStore'
import {
  buildWorldForGraphSave,
  getWorldStore,
  rememberLoadedWorld,
  rememberSavedWorld,
  WORLD_BACKUP_KEY,
  WORLD_STORAGE_KEY,
  type WorldStore,
} from './worldStore'
import { DEFAULT_GALAXY_ID } from './worldTypes'
import { getActiveGalaxyGraph } from './worldDocument'

export const STORAGE_KEY = LEGACY_STORAGE_KEY
export const BACKUP_KEY = LEGACY_BACKUP_KEY
/** v0.3 World current/backup keys (browser). Prefer these when inspecting World persistence. */
export const WORLD_CURRENT_KEY = WORLD_STORAGE_KEY
export const WORLD_BACKUP_STORAGE_KEY = WORLD_BACKUP_KEY
export const BOOTSTRAP_KEY = 'pob-bootstrap-choice'

export type BootstrapChoice = 'empty' | 'demo'

export type StorageLoadResult =
  | { ok: true; document: GraphDocumentV01 }
  | { ok: false; reason: 'missing' | 'corrupt' | 'quota' | 'io' | 'missing_asset' }

export type StorageSaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'too_large' | 'io'; message?: string }

export function readBootstrapChoice(): BootstrapChoice | null {
  try {
    const raw = localStorage.getItem(BOOTSTRAP_KEY)
    if (raw === 'empty' || raw === 'demo') return raw
  } catch {
    /* ignore */
  }
  return null
}

export function writeBootstrapChoice(choice: BootstrapChoice): StorageSaveResult {
  try {
    localStorage.setItem(BOOTSTRAP_KEY, choice)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'quota' }
  }
}

function mapLoadReason(
  reason: 'missing' | 'corrupt' | 'io' | 'missing_asset',
): Extract<StorageLoadResult, { ok: false }>['reason'] {
  return reason
}

function mapSaveResult(
  result: Awaited<ReturnType<WorldStore['saveCurrent']>>,
): StorageSaveResult {
  if (result.ok) return { ok: true }
  return { ok: false, reason: result.reason, message: result.message }
}

function graphFromWorldLoad(
  loaded: Awaited<ReturnType<WorldStore['loadCurrent']>>,
): StorageLoadResult {
  if (!loaded.ok) {
    return { ok: false, reason: mapLoadReason(loaded.reason) }
  }
  const graph = getActiveGalaxyGraph(loaded.world, DEFAULT_GALAXY_ID)
  if (!graph) {
    return { ok: false, reason: 'corrupt' }
  }
  rememberLoadedWorld(loaded.world, DEFAULT_GALAXY_ID)
  return { ok: true, document: graph }
}

export async function hasStoredDocument(): Promise<boolean> {
  const store = await getWorldStore()
  return store.hasCurrent()
}

export async function hasBackupDocument(): Promise<boolean> {
  const store = await getWorldStore()
  return store.hasBackup()
}

export async function saveDocumentToStorage(
  document: GraphDocumentV01,
): Promise<StorageSaveResult> {
  const store = await getWorldStore()
  const world = buildWorldForGraphSave(document)
  const saved = await store.saveCurrent(world)
  if (saved.ok) rememberSavedWorld(world)
  return mapSaveResult(saved)
}

export async function loadDocumentFromStorage(): Promise<StorageLoadResult> {
  const store = await getWorldStore()
  const loaded = await store.loadCurrent()
  return graphFromWorldLoad(loaded)
}

export async function backupDocumentToStorage(
  document: GraphDocumentV01,
): Promise<StorageSaveResult> {
  const store = await getWorldStore()
  const world = buildWorldForGraphSave(document)
  return mapSaveResult(await store.saveBackup(world))
}

export async function restoreBackupFromStorage(): Promise<StorageLoadResult> {
  const store = await getWorldStore()
  const loaded = await store.loadBackup()
  return graphFromWorldLoad(loaded)
}

export function storageFailureMessage(
  reason: 'quota' | 'too_large' | 'io' | undefined,
): string {
  if (reason === 'too_large') return '문서가 너무 커서 저장할 수 없습니다.'
  if (reason === 'io') return '저장소 I/O에 실패했습니다. 기존 문서는 유지됩니다.'
  return '로컬 저장에 실패했습니다 (용량 부족 등).'
}
