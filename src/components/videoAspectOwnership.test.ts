import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

function readCss(name: string) {
  return readFileSync(join(here, name), 'utf8')
}

describe('video aspect ownership (CSS regression)', () => {
  it('does not put a generic 16/9 on .video-embed in VideoEmbed.css', () => {
    const css = readCss('VideoEmbed.css')
    expect(css).not.toMatch(/\.video-embed\s*\{[^}]*aspect-ratio\s*:\s*16\s*\/\s*9/s)
  })

  it('does not force 16/9 on NotableLogViewer player wrapper', () => {
    const css = readCss('NotableLogViewer.css')
    expect(css).not.toMatch(/\.notable-log-viewer__player\s*\{[^}]*aspect-ratio\s*:\s*16\s*\/\s*9/s)
    expect(css).not.toMatch(
      /\.notable-log-viewer__player\s+\.video-embed[^{]*\{[^}]*position\s*:\s*absolute/s,
    )
  })

  it('does not redefine .video-embed aspect-ratio in VideoMediaPanel.css', () => {
    const css = readCss('VideoMediaPanel.css')
    expect(css).not.toMatch(/\.video-embed\s*\{[^}]*aspect-ratio/s)
  })

  it('does not unset VideoEmbed aspect-ratio with !important in FloatingVideoPopup.css', () => {
    const css = readCss('FloatingVideoPopup.css')
    expect(css).not.toMatch(/aspect-ratio\s*:\s*unset\s*!important/)
    expect(css).not.toMatch(/object-fit\s*:\s*cover/)
    expect(css).toMatch(/\.floating-video-popup__player\s*\{[^}]*height\s*:\s*auto/s)
  })

  it('defines portrait max-width on VideoEmbed and mirrors it on Notable player via :has', () => {
    const embed = readCss('VideoEmbed.css')
    expect(embed).toMatch(/\.video-embed--portrait\s*\{[^}]*width\s*:\s*min\(100%\s*,\s*420px\)/s)
    expect(embed).toMatch(/margin-inline\s*:\s*auto/)
    const pin = readCss('FloatingVideoPopup.css')
    const notable = readCss('NotableLogViewer.css')
    // FloatingVideoPopup path is out of scope for Notable Pin; keep it free of a 420 chrome rule.
    expect(pin).not.toMatch(/420px/)
    expect(notable).toMatch(
      /\.notable-log-viewer__player:has\(\.video-embed--portrait\)\s*\{[^}]*width\s*:\s*min\(100%\s*,\s*420px\)/s,
    )
    expect(notable).toMatch(
      /\.notable-log-viewer__player:has\(\.video-embed--portrait\)\s*\{[^}]*margin-inline\s*:\s*auto/s,
    )
    expect(pin).not.toMatch(/\.floating-video-popup__player \.video-embed\s*\{[^}]*^\s*width\s*:\s*100%/ms)
    expect(notable).not.toMatch(
      /\.notable-log-viewer__player \.video-embed[^{]*\{[^}]*^\s*width\s*:\s*100%/ms,
    )
  })

  it('allows Notable Pin window resize up to the viewport (not a 720px ceiling)', () => {
    const notable = readCss('NotableLogViewer.css')
    expect(notable).toMatch(
      /\.notable-log-viewer\.is-pinned\s*\{[^}]*max-width\s*:\s*calc\(100vw - 16px\)\s*;/s,
    )
    expect(notable).not.toMatch(
      /\.notable-log-viewer\.is-pinned\s*\{[^}]*max-width\s*:\s*min\(720px\s*,\s*calc\(100vw - 16px\)\)/s,
    )
  })
})
