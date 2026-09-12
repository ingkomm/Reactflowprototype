/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import {
  extractSvgFromClipboard,
  insertAtTextareaSelection,
  isValidSvgXml,
  wrapSvgMarkdownFence,
} from './clipboardSvg'
import { isSafeSvgForBlobImage, parseSvgFenceInfo } from './svgFence'
import {
  buildGraphDocument,
  parseGraphDocumentJson,
  serializeGraphDocument,
} from './graphDocument'
import { MAX_STRING_LENGTH } from './limits'
import { DEFAULT_SYMBOL_ID } from './librarySymbols'
import { INITIAL_NODE_ID } from './types'
import { MarkdownView } from './components/MarkdownView'
import { SvgBlobImage } from './components/SvgBlobImage'

function makeClipboard(data: Record<string, string>): DataTransfer {
  return {
    getData: (type: string) => data[type] ?? '',
  } as unknown as DataTransfer
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

const SIMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="10" fill="#0af"/></svg>'

const UNICODE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="12">한글✓</text></svg>'

const DRAWIO_STYLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">
  <defs><clipPath id="c"><rect width="120" height="80"/></clipPath></defs>
  <switch>
    <foreignObject width="120" height="80" requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility">
      <div xmlns="http://www.w3.org/1999/xhtml">Draw.io label</div>
    </foreignObject>
    <text x="4" y="16">fallback</text>
  </switch>
</svg>`

describe('TrainingLog.note persistence (no 500 clamp)', () => {
  it('keeps notes longer than MAX_STRING_LENGTH through parse/export roundtrip', () => {
    const longNote = `${'가'.repeat(MAX_STRING_LENGTH + 120)}\n\n\`\`\`svg\n${SIMPLE_SVG}\n\`\`\``
    expect(longNote.length).toBeGreaterThan(MAX_STRING_LENGTH)

    const raw = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: 0, y: 0 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: DEFAULT_SYMBOL_ID },
        },
        {
          id: 'notable-long',
          type: 'passive',
          position: { x: 40, y: 40 },
          data: {
            label: 'Drill',
            kind: 'notable',
            symbolId: DEFAULT_SYMBOL_ID,
            stages: [
              {
                id: 'stage-1',
                index: 1,
                label: '연습',
                goal: 3,
                completedManually: false,
                logs: [{ id: 'log-long', date: '2026-09-01', note: longNote }],
              },
              {
                id: 'stage-2',
                index: 2,
                label: '숙련',
                goal: 5,
                completedManually: false,
                logs: [],
              },
              {
                id: 'stage-3',
                index: 3,
                label: '완성',
                goal: 7,
                completedManually: false,
                logs: [],
              },
            ],
          },
        },
      ],
      edges: [],
      customSymbols: [],
    }

    const parsed = parseGraphDocumentJson(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const note = parsed.document.nodes.find((n) => n.id === 'notable-long')?.data.stages?.[0]
      ?.logs?.[0]?.note
    expect(note).toBe(longNote)

    const exported = buildGraphDocument({
      nodes: parsed.document.nodes,
      edges: parsed.document.edges,
      customSymbols: [],
    })
    const again = parseGraphDocumentJson(serializeGraphDocument(exported))
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(
      again.document.nodes.find((n) => n.id === 'notable-long')?.data.stages?.[0]?.logs?.[0]
        ?.note,
    ).toBe(longNote)
  })

  it('still clamps short metadata labels to MAX_STRING_LENGTH', () => {
    const hugeLabel = 'L'.repeat(MAX_STRING_LENGTH + 80)
    const raw = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: 0, y: 0 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: DEFAULT_SYMBOL_ID },
        },
        {
          id: 'shard-label',
          type: 'passive',
          position: { x: 10, y: 10 },
          data: {
            label: hugeLabel,
            kind: 'shard',
            symbolId: DEFAULT_SYMBOL_ID,
            stages: [],
          },
        },
      ],
      edges: [],
      customSymbols: [],
    }
    const parsed = parseGraphDocumentJson(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.nodes.find((n) => n.id === 'shard-label')?.data.label.length).toBe(
      MAX_STRING_LENGTH,
    )
  })
})

describe('clipboardSvg', () => {
  it('PRIMARY: restores UTF-8 SVG from text/html data URI base64 (incl. Unicode)', () => {
    const b64 = utf8ToBase64(UNICODE_SVG)
    const html = `<html><body><img src="data:image/svg+xml;base64,${b64}"></body></html>`
    const svg = extractSvgFromClipboard(
      makeClipboard({
        'text/html': html,
        'image/svg+xml': '',
      }),
    )
    expect(svg).toBe(UNICODE_SVG)
    expect(svg).toContain('한글✓')
  })

  it('supports percent-encoded data:image/svg+xml', () => {
    const encoded = encodeURIComponent(SIMPLE_SVG)
    const html = `<img src="data:image/svg+xml;charset=utf-8,${encoded}">`
    expect(extractSvgFromClipboard(makeClipboard({ 'text/html': html }))).toBe(SIMPLE_SVG)
  })

  it('FALLBACK: non-empty image/svg+xml and text/plain raw svg', () => {
    expect(
      extractSvgFromClipboard(
        makeClipboard({ 'text/html': '', 'image/svg+xml': SIMPLE_SVG }),
      ),
    ).toBe(SIMPLE_SVG)
    expect(extractSvgFromClipboard(makeClipboard({ 'text/plain': SIMPLE_SVG }))).toBe(SIMPLE_SVG)
  })

  it('does not treat ordinary html/plain as svg', () => {
    expect(
      extractSvgFromClipboard(
        makeClipboard({
          'text/html': '<p>hello <img src="https://example.com/a.png"></p>',
          'text/plain': 'just text',
        }),
      ),
    ).toBeNull()
  })

  it('rejects malformed base64 / xml / non-svg root', () => {
    expect(
      extractSvgFromClipboard(
        makeClipboard({
          'text/html': '<img src="data:image/svg+xml;base64,@@@">',
        }),
      ),
    ).toBeNull()
    expect(isValidSvgXml('<svg><')).toBe(false)
    expect(isValidSvgXml('<div xmlns="http://www.w3.org/1999/xhtml">x</div>')).toBe(false)
  })

  it('inserts fence at caret / replaces selection', () => {
    const fence = wrapSvgMarkdownFence(SIMPLE_SVG)
    const base = 'AAA BBB'
    const mid = insertAtTextareaSelection(base, 4, 4, fence)
    expect(mid.value).toBe(`AAA ${fence}BBB`)
    expect(mid.caret).toBe(4 + fence.length)

    const replaced = insertAtTextareaSelection(base, 0, 3, fence)
    expect(replaced.value).toBe(`${fence} BBB`)
  })
})

describe('svgFence safety', () => {
  it('allows Draw.io-style foreignObject/switch SVG', () => {
    expect(isSafeSvgForBlobImage(DRAWIO_STYLE_SVG)).toBe(true)
    expect(parseSvgFenceInfo('```svg')).toBe('svg')
    expect(parseSvgFenceInfo('```js')).toBe('js')
  })

  it('rejects script / event attrs / javascript: URLs', () => {
    expect(
      isSafeSvgForBlobImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ).toBe(false)
    expect(
      isSafeSvgForBlobImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle onload="x()" r="1"/></svg>',
      ),
    ).toBe(false)
    expect(
      isSafeSvgForBlobImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"/></svg>',
      ),
    ).toBe(false)
  })
})

describe('MarkdownView svg fence', () => {
  function mount(ui: ReactNode) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(ui)
    })
    return {
      host,
      unmount() {
        act(() => root.unmount())
        host.remove()
      },
    }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders ```svg as blob img; other fences stay pre/code; unsafe falls back to code', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock-svg'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    const createSpy = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>
    const revokeSpy = URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>

    const view = mount(
      <MarkdownView
        markdown={`intro\n\n\`\`\`svg\n${SIMPLE_SVG}\n\`\`\`\n\n\`\`\`js\nconsole.log(1)\n\`\`\`\n\n\`\`\`svg\n<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>\n\`\`\``}
      />,
    )

    expect(view.host.querySelector('[data-testid="markdown-svg-block"]')).toBeTruthy()
    expect(view.host.querySelector('[data-testid="markdown-svg-image"]')).toBeTruthy()
    expect(createSpy).toHaveBeenCalled()
    const pres = [...view.host.querySelectorAll('pre.markdown-view__pre')]
    expect(pres.some((el) => el.textContent?.includes('console.log'))).toBe(true)
    expect(pres.some((el) => el.textContent?.includes('<script>'))).toBe(true)

    view.unmount()
    expect(revokeSpy).toHaveBeenCalled()
  })

  it('SvgBlobImage revokes on source change', () => {
    const createMock = vi
      .fn()
      .mockReturnValueOnce('blob:a')
      .mockReturnValueOnce('blob:b')
    const revokeMock = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createMock,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeMock,
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(<SvgBlobImage source={SIMPLE_SVG} />)
    })
    act(() => {
      root.render(
        <SvgBlobImage source='<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>' />,
      )
    })
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(revokeMock).toHaveBeenCalledWith('blob:a')
    act(() => root.unmount())
    host.remove()
  })
})
