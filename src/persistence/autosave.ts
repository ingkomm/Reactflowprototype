import type { GraphDocumentV01 } from '../graphDocument'
import { serializeGraphDocument, parseGraphDocumentJson } from '../graphDocument'
import { MAX_JSON_BYTES } from '../limits'

export const STORAGE_KEY = 'pob-graph-document-v01'
export const BACKUP_KEY = 'pob-graph-document-backup'
export const BOOTSTRAP_KEY = 'pob-bootstrap-choice'

export type BootstrapChoice = 'empty' | 'demo'

export type StorageLoadResult =
  | { ok: true; document: GraphDocumentV01 }
  | { ok: false; reason: 'missing' | 'corrupt' | 'quota' }

export type StorageSaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'too_large' }

export function readBootstrapChoice(): BootstrapChoice | null {
  try {
    const raw = localStorage.getItem(BOOTSTRAP_KEY)
    if (raw === 'empty' || raw === 'demo') return raw
  } catch {
    /* ignore */
  }
  return null
}

export function writeBootstrapChoice(choice: BootstrapChoice): void {
  localStorage.setItem(BOOTSTRAP_KEY, choice)
}

export function hasStoredDocument(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) != null
  } catch {
    return false
  }
}

export function hasBackupDocument(): boolean {
  try {
    return localStorage.getItem(BACKUP_KEY) != null
  } catch {
    return false
  }
}

export function saveDocumentToStorage(document: GraphDocumentV01): StorageSaveResult {
  const serialized = serializeGraphDocument(document)
  if (serialized.length > MAX_JSON_BYTES) {
    return { ok: false, reason: 'too_large' }
  }
  try {
    localStorage.setItem(STORAGE_KEY, serialized)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'quota' }
  }
}

export function loadDocumentFromStorage(): StorageLoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ok: false, reason: 'missing' }
    const parsed = parseGraphDocumentJson(raw)
    if (!parsed.ok) return { ok: false, reason: 'corrupt' }
    return { ok: true, document: parsed.document }
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
}

export function backupDocumentToStorage(document: GraphDocumentV01): StorageSaveResult {
  const serialized = serializeGraphDocument(document)
  if (serialized.length > MAX_JSON_BYTES) {
    return { ok: false, reason: 'too_large' }
  }
  try {
    localStorage.setItem(BACKUP_KEY, serialized)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'quota' }
  }
}

export function restoreBackupFromStorage(): StorageLoadResult {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    if (!raw) return { ok: false, reason: 'missing' }
    const parsed = parseGraphDocumentJson(raw)
    if (!parsed.ok) return { ok: false, reason: 'corrupt' }
    return { ok: true, document: parsed.document }
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
}
