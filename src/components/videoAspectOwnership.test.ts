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
    expect(embed).toMatch(/\.video-embed\s*\{[^}]*^\s*width\s*:\s*100%/ms)
    expect(embed).toMatch(/\.video-embed--portrait\s*\{[^}]*width\s*:\s*min\(100%\s*,\s*420px\)/s)
    expect(embed).toMatch(/margin-inline\s*:\s*auto/)
    expect(embed).not.toMatch(/max-height\s*:\s*80vh/)
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
    expect(notable).not.toMatch(/747px/)
    expect(notable).not.toMatch(/max-height\s*:\s*80vh/)
    expect(notable).toMatch(/\.notable-log-viewer\s*\{[^}]*width\s*:\s*min\(800px,\s*calc\(100vw - 32px\)\)/s)
    expect(notable).not.toMatch(/\.notable-log-viewer\s*\{[^}]*width\s*:\s*fit-content/s)
    expect(pin).not.toMatch(/\.floating-video-popup__player \.video-embed\s*\{[^}]*^\s*width\s*:\s*100%/ms)
    expect(notable).not.toMatch(
      /\.notable-log-viewer__player \.video-embed[^{]*\{[^}]*^\s*width\s*:\s*100%/ms,
    )
  })

  it('Pin stays within viewport and is not user-resizable', () => {
    const notable = readCss('NotableLogViewer.css')
    const shard = readCss('ShardMarkdownPreview.css')
    expect(notable).toMatch(
      /\.notable-log-viewer\.is-pinned\s*\{[^}]*max-width\s*:\s*calc\(100vw - 16px\)\s*;/s,
    )
    expect(notable).not.toMatch(
      /\.notable-log-viewer\.is-pinned\s*\{[^}]*max-width\s*:\s*min\(720px\s*,\s*calc\(100vw - 16px\)\)/s,
    )
    expect(notable).not.toMatch(/\.notable-log-viewer\.is-pinned\s*\{[^}]*resize\s*:\s*both/s)
    expect(shard).not.toMatch(/\.shard-markdown-preview\.is-pinned\s*\{[^}]*resize\s*:\s*both/s)
  })
})
