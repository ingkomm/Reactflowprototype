import { Fragment, type ReactNode } from 'react'
import './MarkdownView.css'

type Props = {
  markdown: string
  className?: string
  emptyLabel?: string
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) != null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key++} className="markdown-view__code">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>)
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      if (linkMatch) {
        const href = linkMatch[2]!
        const safe =
          /^https?:\/\//i.test(href) || href.startsWith('mailto:') ? href : '#'
        nodes.push(
          <a
            key={key++}
            href={safe}
            target={safe === '#' ? undefined : '_blank'}
            rel="noopener noreferrer"
          >
            {linkMatch[1]}
          </a>,
        )
      }
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Lightweight read-only Markdown renderer (no HTML passthrough). */
export function MarkdownView({
  markdown,
  className,
  emptyLabel = '내용 없음',
}: Props) {
  const source = markdown.trim()
  if (!source) {
    return (
      <p className={`markdown-view__empty${className ? ` ${className}` : ''}`}>
        {emptyLabel}
      </p>
    )
  }

  const lines = source.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (!line.trim()) {
      i += 1
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as
        | 'h1'
        | 'h2'
        | 'h3'
      blocks.push(
        <Tag key={key++} className={`markdown-view__h${level}`}>
          {renderInline(heading[2]!)}
        </Tag>,
      )
      i += 1
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? '')) {
        items.push(
          <li key={key++}>
            {renderInline((lines[i] ?? '').replace(/^[-*]\s+/, ''))}
          </li>,
        )
        i += 1
      }
      blocks.push(
        <ul key={key++} className="markdown-view__list">
          {items}
        </ul>,
      )
      continue
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '')
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push(
        <pre key={key++} className="markdown-view__pre">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const para: string[] = [line]
    i += 1
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !/^(#{1,3})\s+/.test(lines[i] ?? '') &&
      !/^[-*]\s+/.test(lines[i] ?? '') &&
      !(lines[i] ?? '').startsWith('```')
    ) {
      para.push(lines[i] ?? '')
      i += 1
    }
    blocks.push(
      <p key={key++} className="markdown-view__p">
        {para.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? <br /> : null}
            {renderInline(part)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return (
    <div className={`markdown-view${className ? ` ${className}` : ''}`}>
      {blocks}
    </div>
  )
}
