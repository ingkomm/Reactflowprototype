/**
 * File / localStorage Asset Store implementations.
 */
import {
  bytesToText,
  createAssetId,
  textToBytes,
  type AssetPutInput,
  type AssetRecord,
  type AssetStore,
} from './assetStore'
import type { FsBackend } from './fsBackend'

const META_SUFFIX = '.meta.json'

export type FileAssetStore = AssetStore & { rootDir: string }

export function createFileAssetStore(fs: FsBackend, assetsDir: string): FileAssetStore {
  const ensureDir = async () => {
    await fs.mkdir(assetsDir, { recursive: true })
  }

  const dataPath = (assetId: string) => `${assetsDir}/${assetId}`
  const metaPath = (assetId: string) => `${assetsDir}/${assetId}${META_SUFFIX}`

  return {
    rootDir: assetsDir,

    async put(input: AssetPutInput): Promise<AssetRecord> {
      await ensureDir()
      const assetId = input.assetId ?? createAssetId()
      const bytes = typeof input.bytes === 'string' ? textToBytes(input.bytes) : input.bytes
      const text = typeof input.bytes === 'string' ? input.bytes : bytesToText(bytes)
      const record: AssetRecord = {
        assetId,
        kind: input.kind,
        mimeType: input.mimeType,
        byteLength: bytes.byteLength,
        label: input.label,
        text,
      }
      await fs.writeFile(dataPath(assetId), bytes)
      await fs.writeTextFile(
        metaPath(assetId),
        JSON.stringify({
          assetId: record.assetId,
          kind: record.kind,
          mimeType: record.mimeType,
          byteLength: record.byteLength,
          label: record.label,
        }),
      )
      return record
    },

    async get(assetId: string): Promise<AssetRecord | null> {
      try {
        if (!(await fs.exists(dataPath(assetId)))) return null
        const bytes = await fs.readFile(dataPath(assetId))
        let meta: {
          mimeType?: string
          kind?: AssetRecord['kind']
          label?: string
          byteLength?: number
        } = {}
        if (await fs.exists(metaPath(assetId))) {
          meta = JSON.parse(await fs.readTextFile(metaPath(assetId))) as typeof meta
        }
        return {
          assetId,
          kind: meta.kind ?? 'custom-symbol-markup',
          mimeType: meta.mimeType ?? 'image/svg+xml',
          byteLength: meta.byteLength ?? bytes.byteLength,
          label: meta.label,
          text: bytesToText(bytes),
        }
      } catch {
        return null
      }
    },

    async has(assetId: string): Promise<boolean> {
      try {
        return await fs.exists(dataPath(assetId))
      } catch {
        return false
      }
    },

    async delete(assetId: string): Promise<void> {
      try {
        if (await fs.exists(dataPath(assetId))) await fs.remove(dataPath(assetId))
      } catch {
        /* ignore */
      }
      try {
        if (await fs.exists(metaPath(assetId))) await fs.remove(metaPath(assetId))
      } catch {
        /* ignore */
      }
    },

    async list(): Promise<Omit<AssetRecord, 'text'>[]> {
      await ensureDir()
      try {
        const entries = await fs.readDir(assetsDir)
        const out: Omit<AssetRecord, 'text'>[] = []
        for (const entry of entries) {
          if (entry.isDirectory) continue
          if (entry.name.endsWith(META_SUFFIX)) continue
          const got = await this.get(entry.name)
          if (got) {
            const { text: _t, ...rest } = got
            out.push(rest)
          }
        }
        return out
      } catch {
        return []
      }
    },
  }
}

/** Browser fallback: asset payloads in localStorage under a prefix. */
export function createLocalStorageAssetStore(prefix = 'pob-asset-v02:'): AssetStore {
  return {
    async put(input: AssetPutInput): Promise<AssetRecord> {
      const assetId = input.assetId ?? createAssetId()
      const text = typeof input.bytes === 'string' ? input.bytes : bytesToText(input.bytes)
      const record: AssetRecord = {
        assetId,
        kind: input.kind,
        mimeType: input.mimeType,
        byteLength: textToBytes(text).byteLength,
        label: input.label,
        text,
      }
      localStorage.setItem(
        `${prefix}${assetId}`,
        JSON.stringify({
          assetId: record.assetId,
          kind: record.kind,
          mimeType: record.mimeType,
          byteLength: record.byteLength,
          label: record.label,
          text: record.text,
        }),
      )
      return record
    },

    async get(assetId: string): Promise<AssetRecord | null> {
      try {
        const raw = localStorage.getItem(`${prefix}${assetId}`)
        if (!raw) return null
        const parsed = JSON.parse(raw) as AssetRecord
        if (typeof parsed.text !== 'string') return null
        return {
          assetId,
          kind: 'custom-symbol-markup',
          mimeType: parsed.mimeType ?? 'image/svg+xml',
          byteLength: parsed.byteLength ?? textToBytes(parsed.text).byteLength,
          label: parsed.label,
          text: parsed.text,
        }
      } catch {
        return null
      }
    },

    async has(assetId: string): Promise<boolean> {
      try {
        return localStorage.getItem(`${prefix}${assetId}`) != null
      } catch {
        return false
      }
    },

    async delete(assetId: string): Promise<void> {
      try {
        localStorage.removeItem(`${prefix}${assetId}`)
      } catch {
        /* ignore */
      }
    },

    async list(): Promise<Omit<AssetRecord, 'text'>[]> {
      const out: Omit<AssetRecord, 'text'>[] = []
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key?.startsWith(prefix)) continue
          const got = await this.get(key.slice(prefix.length))
          if (got) {
            const { text: _t, ...rest } = got
            out.push(rest)
          }
        }
      } catch {
        /* ignore */
      }
      return out
    },
  }
}
