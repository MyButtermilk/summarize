import { render as renderMarkdownAnsi } from 'markdansi'

type LiveMarkdownRenderer = {
  render: (markdown: string) => void
  finish: () => void
}

const BSU = '\u001b[?2026h'
const ESU = '\u001b[?2026l'
const HIDE_CURSOR = '\u001b[?25l'
const SHOW_CURSOR = '\u001b[?25h'
const CLEAR_LINE = '\u001b[2K'

function cursorUp(lines: number): string {
  if (lines <= 0) return ''
  return `\u001b[${lines}A`
}

export function createLiveMarkdownRenderer({
  stdout,
  width,
  color,
}: {
  stdout: NodeJS.WritableStream
  width: number
  color: boolean
}): LiveMarkdownRenderer {
  let previousLines = 0
  let cursorHidden = false

  const render = (markdown: string) => {
    const renderedRaw = renderMarkdownAnsi(markdown, { width, wrap: true, color })
    const rendered = renderedRaw.endsWith('\n') ? renderedRaw : `${renderedRaw}\n`

    const lines = rendered.split('\n')
    if (lines.length > 0 && lines.at(-1) === '') lines.pop()

    const newLines = lines.length
    const maxLines = Math.max(previousLines, newLines)

    let frame = ''
    if (!cursorHidden) {
      frame += HIDE_CURSOR
      cursorHidden = true
    }

    frame += BSU
    if (previousLines > 0) {
      frame += `${cursorUp(previousLines)}\r`
    } else {
      frame += '\r'
    }

    for (let i = 0; i < maxLines; i += 1) {
      frame += CLEAR_LINE
      frame += lines[i] ?? ''
      frame += '\n'
    }

    frame += ESU
    stdout.write(frame)

    previousLines = newLines
  }

  const finish = () => {
    if (!cursorHidden) return
    stdout.write(SHOW_CURSOR)
    cursorHidden = false
  }

  return { render, finish }
}

