import { createLinkPreviewClient } from '@steipete/summarizer/content'
import { describe, expect, it, vi } from 'vitest'

const htmlResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' },
  })

describe('link preview extraction (Firecrawl fallback)', () => {
  it('does not call Firecrawl when HTML looks usable', async () => {
    const html = `<!doctype html><html><head><title>Ok</title></head><body><article><p>${'A'.repeat(
      260
    )}</p></article></body></html>`

    const scrapeWithFirecrawl = vi.fn(async () => ({
      markdown: '# Should not run',
      html: null,
      metadata: null,
    }))

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') {
        return htmlResponse(html)
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithFirecrawl,
    })

    const result = await client.fetchLinkContent('https://example.com', { timeoutMs: 2000 })
    expect(result.diagnostics.strategy).toBe('html')
    expect(scrapeWithFirecrawl).not.toHaveBeenCalled()
  })

  it('does not call Firecrawl when firecrawl is off', async () => {
    const html =
      '<!doctype html><html><head><title>Blocked</title></head><body>Attention Required! | Cloudflare</body></html>'

    const scrapeWithFirecrawl = vi.fn(async () => ({
      markdown: 'Hello from Firecrawl',
      html: '<html><head><title>Firecrawl</title></head><body></body></html>',
      metadata: { title: 'Firecrawl title' },
    }))

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') {
        return htmlResponse(html)
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithFirecrawl,
    })

    const result = await client.fetchLinkContent('https://example.com', {
      timeoutMs: 2000,
      firecrawl: 'off',
    })
    expect(result.diagnostics.strategy).toBe('html')
    expect(scrapeWithFirecrawl).not.toHaveBeenCalled()
  })

  it('calls Firecrawl first when firecrawl is always', async () => {
    const html = `<!doctype html><html><head><title>Ok</title></head><body><article><p>${'A'.repeat(
      260
    )}</p></article></body></html>`

    const scrapeWithFirecrawl = vi.fn(async () => ({
      markdown: 'Hello from Firecrawl',
      html: '<html><head><title>Firecrawl</title></head><body></body></html>',
      metadata: { title: 'Firecrawl title' },
    }))

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') {
        return htmlResponse(html)
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithFirecrawl,
    })

    const result = await client.fetchLinkContent('https://example.com', {
      timeoutMs: 2000,
      firecrawl: 'always',
    })
    expect(result.diagnostics.strategy).toBe('firecrawl')
    expect(result.content).toContain('Hello from Firecrawl')
    expect(scrapeWithFirecrawl).toHaveBeenCalledTimes(1)
  })

  it('falls back to Firecrawl when HTML looks blocked', async () => {
    const html =
      '<!doctype html><html><head><title>Blocked</title></head><body>Attention Required! | Cloudflare</body></html>'

    const scrapeWithFirecrawl = vi.fn(async () => ({
      markdown: 'Hello from Firecrawl',
      html: '<html><head><title>Firecrawl</title></head><body></body></html>',
      metadata: { title: 'Firecrawl title' },
    }))

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') {
        return htmlResponse(html)
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithFirecrawl,
    })

    const result = await client.fetchLinkContent('https://example.com', { timeoutMs: 2000 })
    expect(result.diagnostics.strategy).toBe('firecrawl')
    expect(result.content).toContain('Hello from Firecrawl')
    expect(scrapeWithFirecrawl).toHaveBeenCalledTimes(1)
  })

  it('falls back to Firecrawl when HTML fetch fails', async () => {
    const scrapeWithFirecrawl = vi.fn(async () => ({
      markdown: 'Hello from Firecrawl',
      html: '<html><head><title>Firecrawl</title></head><body></body></html>',
      metadata: { title: 'Firecrawl title' },
    }))

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') {
        return htmlResponse('nope', 403)
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithFirecrawl,
    })

    const result = await client.fetchLinkContent('https://example.com', { timeoutMs: 2000 })
    expect(result.diagnostics.strategy).toBe('firecrawl')
    expect(result.content).toContain('Hello from Firecrawl')
  })
})
