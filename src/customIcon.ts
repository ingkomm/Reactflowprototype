import { NODE_ICON_COLORS, type CustomIcon } from './types'

export const CUSTOM_ICON_SIZE = 16

/** Limited palette for the dot editor (matches node icon colors). */
export const CUSTOM_ICON_PALETTE = [...NODE_ICON_COLORS] as string[]

export function createEmptyCustomIconPixels(): (string | null)[] {
  return Array.from({ length: CUSTOM_ICON_SIZE * CUSTOM_ICON_SIZE }, () => null)
}

export function createCustomIconId() {
  return `ci-${crypto.randomUUID().slice(0, 8)}`
}

export function createCustomIcon(name: string, pixels?: (string | null)[]): CustomIcon {
  return {
    id: createCustomIconId(),
    name: name.trim() || '아이콘',
    width: CUSTOM_ICON_SIZE,
    height: CUSTOM_ICON_SIZE,
    pixels: normalizeCustomIconPixels(pixels ?? createEmptyCustomIconPixels()),
  }
}

export function normalizeCustomIconPixels(pixels: (string | null)[]): (string | null)[] {
  const expected = CUSTOM_ICON_SIZE * CUSTOM_ICON_SIZE
  const next = pixels.slice(0, expected)
  while (next.length < expected) next.push(null)
  return next.map((px) => (px == null ? null : normalizePaletteColor(px)))
}

function normalizePaletteColor(color: string): string | null {
  const upper = color.toUpperCase()
  return CUSTOM_ICON_PALETTE.find((c) => c.toUpperCase() === upper) ?? null
}

export function validateCustomIcon(value: unknown): CustomIcon | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<CustomIcon>
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (raw.width !== CUSTOM_ICON_SIZE || raw.height !== CUSTOM_ICON_SIZE) return null
  if (!Array.isArray(raw.pixels)) return null
  const pixels = normalizeCustomIconPixels(raw.pixels)
  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
    width: CUSTOM_ICON_SIZE,
    height: CUSTOM_ICON_SIZE,
    pixels,
  }
}

export function validateCustomIcons(value: unknown): CustomIcon[] | null {
  if (!Array.isArray(value)) return null
  const icons: CustomIcon[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const icon = validateCustomIcon(item)
    if (!icon) return null
    if (seen.has(icon.id)) return null
    seen.add(icon.id)
    icons.push(icon)
  }
  return icons
}

export function setCustomIconPixel(
  icon: CustomIcon,
  x: number,
  y: number,
  color: string | null,
): CustomIcon {
  if (x < 0 || y < 0 || x >= CUSTOM_ICON_SIZE || y >= CUSTOM_ICON_SIZE) return icon
  const pixels = [...icon.pixels]
  pixels[y * CUSTOM_ICON_SIZE + x] = color == null ? null : normalizePaletteColor(color)
  return { ...icon, pixels }
}

export function clearCustomIcon(icon: CustomIcon): CustomIcon {
  return { ...icon, pixels: createEmptyCustomIconPixels() }
}
