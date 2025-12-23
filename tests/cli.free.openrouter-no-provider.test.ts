import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/run.js'

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

vi.mock('../src/llm/generate-text.js', () => ({
  generateTextWithModelId: vi.fn(async () => {
    throw new Error('No allowed providers are available for the selected model.')
  }),
  streamTextWithModelId: vi.fn(async () => {
    throw new Error('No allowed providers are available for the selected model.')
  }),
}))

describe('--model free OpenRouter provider routing errors', () => {
  it('fails loudly instead of returning extracted text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summarize-free-openrouter-no-provider-'))
    const html = `<!doctype html><html><head><title>Ok</title></head><body><article><p>${'A'.repeat(
      2000
    )}</p></article></body></html>`

    const fetchMock = vi.fn(async () => new Response(html, { status: 200 }))

    const stdout = collectStream()
    const stderr = collectStream()

    await expect(
      runCli(['--model', 'free', '--timeout', '2s', 'https://example.com'], {
        env: { HOME: root, OPENROUTER_API_KEY: 'test' },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: stdout.stream,
        stderr: stderr.stream,
      })
    ).rejects.toThrow(/OpenRouter could not route any :free models/i)

    expect(stdout.getText()).not.toContain('A'.repeat(50))
    expect(stdout.getText().trim()).toBe('')
  })
})
