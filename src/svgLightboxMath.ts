/** Pure helpers for SVG lightbox Fit / pan (UI-only). */

export const SVG_LIGHTBOX_MIN_SCALE = 0.5
export const SVG_LIGHTBOX_MAX_SCALE = 4
export const SVG_LIGHTBOX_SCALE_STEP = 0.25

export function clampSvgScale(n: number): number {
  return Math.min(SVG_LIGHTBOX_MAX_SCALE, Math.max(SVG_LIGHTBOX_MIN_SCALE, n))
}

/** Fit: shrink to viewport if larger; never upscale past intrinsic (1). */
export function computeFitScale(nw: number, nh: number, vw: number, vh: number): number {
  if (nw <= 0 || nh <= 0 || vw <= 0 || vh <= 0) return 1
  return Math.min(1, vw / nw, vh / nh)
}

export function clampSvgPan(
  tx: number,
  ty: number,
  scale: number,
  nw: number,
  nh: number,
  vw: number,
  vh: number,
): { tx: number; ty: number } {
  const sw = nw * scale
  const sh = nh * scale
  const minTx = Math.min(0, vw - sw)
  const maxTx = Math.max(0, vw - sw)
  const minTy = Math.min(0, vh - sh)
  const maxTy = Math.max(0, vh - sh)
  return {
    tx: Math.min(maxTx, Math.max(minTx, tx)),
    ty: Math.min(maxTy, Math.max(minTy, ty)),
  }
}
