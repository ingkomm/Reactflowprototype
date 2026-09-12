/**
 * Autosave facade over WorkspaceStore (v0.2).
 * Bootstrap preference stays in localStorage; graph payloads go through WorkspaceStore.
 */
import type { GraphDocumentV01 } from '../graphDocument'
import {
  getWorkspaceStore,
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  type WorkspaceStore,
} from './workspaceStore'

export const STORAGE_KEY = LEGACY_STORAGE_KEY
export const BACKUP_KEY = LEGACY_BACKUP_KEY
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
  result: Awaited<ReturnType<WorkspaceStore['saveCurrent']>>,
): StorageSaveResult {
  if (result.ok) return { ok: true }
  return { ok: false, reason: result.reason, message: result.message }
}

export async function hasStoredDocument(): Promise<boolean> {
  const store = await getWorkspaceStore()
  return store.hasCurrent()
}

export async function hasBackupDocument(): Promise<boolean> {
  const store = await getWorkspaceStore()
  return store.hasBackup()
}

export async function saveDocumentToStorage(
  document: GraphDocumentV01,
): Promise<StorageSaveResult> {
  const store = await getWorkspaceStore()
  return mapSaveResult(await store.saveCurrent(document))
}

export async function loadDocumentFromStorage(): Promise<StorageLoadResult> {
  const store = await getWorkspaceStore()
  const loaded = await store.loadCurrent()
  if (loaded.ok) return { ok: true, document: loaded.document }
  return { ok: false, reason: mapLoadReason(loaded.reason) }
}

export async function backupDocumentToStorage(
  document: GraphDocumentV01,
): Promise<StorageSaveResult> {
  const store = await getWorkspaceStore()
  return mapSaveResult(await store.saveBackup(document))
}

export async function restoreBackupFromStorage(): Promise<StorageLoadResult> {
  const store = await getWorkspaceStore()
  const loaded = await store.loadBackup()
  if (loaded.ok) return { ok: true, document: loaded.document }
  return { ok: false, reason: mapLoadReason(loaded.reason) }
}

export function storageFailureMessage(
  reason: 'quota' | 'too_large' | 'io' | undefined,
): string {
  if (reason === 'too_large') return '문서가 너무 커서 저장할 수 없습니다.'
  if (reason === 'io') return '저장소 I/O에 실패했습니다. 기존 문서는 유지됩니다.'
  return '로컬 저장에 실패했습니다 (용량 부족 등).'
}
