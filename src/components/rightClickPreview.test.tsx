import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownView } from './MarkdownView'
import { createDailyLog, sortedDailyLogs } from '../dailyLog'
import { extractDailyLogsFromNodeData } from '../dailyLogNode'
import { createPassiveData } from '../graphFactory'

describe('MarkdownView', () => {
  it('renders headings, emphasis, and links without raw HTML', () => {
    const html = renderToStaticMarkup(
      <MarkdownView
        markdown={
          '## Title\n\nHello **bold** and [doc](https://example.com)\n\n<script>x</script>'
        }
      />,
    )
    expect(html).toContain('<h2')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows empty state when markdown is blank', () => {
    const html = renderToStaticMarkup(
      <MarkdownView markdown="   " emptyLabel="비어 있음" />,
    )
    expect(html).toContain('비어 있음')
  })
})

describe('Notable daily logs remain readable for Log Viewer', () => {
  it('extracts and sorts notable logs newest first without mutating schema', () => {
    const data = createPassiveData('notable', 'Drill', {
      stages: [
        {
          id: 'stage-1',
          index: 1,
          label: '연습',
          goal: 3,
          completedManually: false,
          logs: [
            createDailyLog('2026-08-01', 'older'),
            createDailyLog('2026-09-01', 'newer', [
              {
                id: 'vid-1',
                url: 'https://youtu.be/abcdefghijk',
                title: 'clip',
              },
            ]),
          ],
        },
      ],
    })
    const logs = extractDailyLogsFromNodeData(data)
    const sorted = sortedDailyLogs(logs)
    expect(sorted.map((log) => log.date)).toEqual(['2026-09-01', '2026-08-01'])
    expect(sorted[0]?.media?.[0]?.url).toContain('youtu.be')
    expect(data.kind).toBe('notable')
  })
})
