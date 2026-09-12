/**
 * Asset Store — binary/text payloads owned by the app (not GraphDocument).
 * Desktop: files under AppData/storage-v02/assets/
 * Browser: localStorage keys (small payloads only).
 */
export type AssetPutInput = {
  assetId?: string
  kind: 'custom-symbol-markup'
  mimeType: string
  bytes: Uint8Array | string
  label?: string
}

export type AssetRecord = {
  assetId: string
  kind: 'custom-symbol-markup'
  mimeType: string
  byteLength: number
  label?: string
  /** UTF-8 text payload (symbol markup). */
  text: string
}

export type AssetStore = {
  put(input: AssetPutInput): Promise<AssetRecord>
  get(assetId: string): Promise<AssetRecord | null>
  has(assetId: string): Promise<boolean>
  delete(assetId: string): Promise<void>
  list(): Promise<Omit<AssetRecord, 'text'>[]>
}

export function createAssetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `asset_${crypto.randomUUID()}`
  }
  return `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
