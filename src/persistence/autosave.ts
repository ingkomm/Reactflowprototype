import type { GraphDocumentV01 } from '../graphDocument'
import { serializeGraphDocument, parseGraphDocumentJson } from '../graphDocument'

export const STORAGE_KEY = 'pob-graph-document-v01'
export const BACKUP_KEY = 'pob-graph-document-backup'
export const BOOTSTRAP_KEY = 'pob-bootstrap-choice'

export type BootstrapChoice = 'empty' | 'demo'

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

export function saveDocumentToStorage(document: GraphDocumentV01): void {
  localStorage.setItem(STORAGE_KEY, serializeGraphDocument(document))
}

export function loadDocumentFromStorage(): GraphDocumentV01 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = parseGraphDocumentJson(raw)
    if (!parsed.ok) return null
    return parsed.document
  } catch {
    return null
  }
}

export function backupDocumentToStorage(document: GraphDocumentV01): void {
  localStorage.setItem(BACKUP_KEY, serializeGraphDocument(document))
}

export function restoreBackupFromStorage(): GraphDocumentV01 | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    if (!raw) return null
    const parsed = parseGraphDocumentJson(raw)
    if (!parsed.ok) return null
    return parsed.document
  } catch {
    return null
  }
}
