import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/run.js'

const htmlResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' },
  })

function collectStream() {
  let text = ''
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString()
      callback()
    },
  })
  return { stream, getText: () => text }
}

function createTextStream(chunks: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

const streamTextMock = vi.fn(() => {
  return {
    textStream: createTextStream(['Hello **bo', 'ld**\n']),
    totalUsage: Promise.resolve({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    }),
  }
})

vi.mock('ai', () => ({
  streamText: streamTextMock,
}))

const createOpenAIMock = vi.fn(() => {
  return (_modelId: string) => ({})
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}))

describe('cli md-live rendering', () => {
  it('uses synchronized output for live markdown when --render auto on a TTY', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summarize-md-live-'))
    const cacheDir = join(root, '.summarize', 'cache')
    mkdirSync(cacheDir, { recursive: true })

    writeFileSync(
      join(cacheDir, 'litellm-model_prices_and_context_window.json'),
      JSON.stringify({
        'gpt-5.2': { input_cost_per_token: 0.00000175, output_cost_per_token: 0.000014 },
      }),
      'utf8'
    )
    writeFileSync(
      join(cacheDir, 'litellm-model_prices_and_context_window.meta.json'),
      JSON.stringify({ fetchedAtMs: Date.now() }),
      'utf8'
    )

    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('unexpected LiteLLM catalog fetch')
    })

    const html =
      '<!doctype html><html><head><title>Hello</title></head>' +
      '<body><article><p>Hi</p></article></body></html>'

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') return htmlResponse(html)
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const stdout = collectStream()
    ;(stdout.stream as unknown as { isTTY?: boolean; columns?: number }).isTTY = true
    ;(stdout.stream as unknown as { columns?: number }).columns = 80
    const stderr = collectStream()

    await runCli(
      ['--model', 'openai/gpt-5.2', '--timeout', '2s', '--stream', 'auto', '--render', 'auto', 'https://example.com'],
      {
        env: { HOME: root, OPENAI_API_KEY: 'test' },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }
    )

    const out = stdout.getText()
    expect(out).toContain('\u001b[?2026h')
    expect(out).toContain('\u001b[?2026l')
    expect(out).toContain('\u001b[2K')
    expect(out).toContain('\u001b[?25l')
    expect(out).toContain('\u001b[?25h')

    const bsuCount = out.match(/\u001b\[\?2026h/g)?.length ?? 0
    expect(bsuCount).toBeGreaterThanOrEqual(2)
    expect(out).toMatch(/\u001b\[[0-9]+A\r/)

    globalFetchSpy.mockRestore()
  })
})

