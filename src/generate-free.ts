import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import JSON5 from 'json5'

import type { LlmApiKeys } from './llm/generate-text.js'
import { generateTextWithModelId } from './llm/generate-text.js'

function assertNoComments(raw: string, path: string): void {
  let inString: '"' | "'" | null = null
  let escaped = false
  let line = 1
  let col = 1

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? ''
    const next = raw[i + 1] ?? ''

    if (inString) {
      if (escaped) {
        escaped = false
        col += 1
        continue
      }
      if (ch === '\\') {
        escaped = true
        col += 1
        continue
      }
      if (ch === inString) {
        inString = null
      }
      if (ch === '\n') {
        line += 1
        col = 1
      } else {
        col += 1
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = ch as '"' | "'"
      escaped = false
      col += 1
      continue
    }

    if (ch === '/' && next === '/') {
      throw new Error(
        `Invalid config file ${path}: comments are not allowed (found // at ${line}:${col}).`
      )
    }

    if (ch === '/' && next === '*') {
      throw new Error(
        `Invalid config file ${path}: comments are not allowed (found /* at ${line}:${col}).`
      )
    }

    if (ch === '\n') {
      line += 1
      col = 1
    } else {
      col += 1
    }
  }
}

function resolveConfigPath(env: Record<string, string | undefined>): string {
  const home = env.HOME?.trim() || homedir()
  if (!home) throw new Error('Missing HOME')
  return join(home, '.summarize', 'config.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency))
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const current = nextIndex
      nextIndex += 1
      if (current >= items.length) return
      results[current] = await fn(items[current] as T, current)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

export async function generateFree({
  env,
  fetchImpl,
  stdout,
  stderr,
  verbose = false,
}: {
  env: Record<string, string | undefined>
  fetchImpl: typeof fetch
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
  verbose?: boolean
}): Promise<void> {
  const openrouterKey =
    typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.trim().length > 0
      ? env.OPENROUTER_API_KEY.trim()
      : null
  if (!openrouterKey) {
    throw new Error('Missing OPENROUTER_API_KEY (required for generate-free)')
  }

  const CONCURRENCY = 4
  const TIMEOUT_MS = 10_000
  const MAX_CANDIDATES = 8
  const TARGET_WORKING = MAX_CANDIDATES * 3

  stderr.write(`OpenRouter: fetching models…\n`)
  const response = await fetchImpl('https://openrouter.ai/api/v1/models', {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`OpenRouter /models failed: HTTP ${response.status}`)
  }
  const payload = (await response.json()) as { data?: Array<{ id?: unknown } | null> }
  const ids = (Array.isArray(payload.data) ? payload.data : [])
    .map((entry) => (entry && typeof entry.id === 'string' ? entry.id.trim() : null))
    .filter((id): id is string => Boolean(id))

  const freeIds = ids.filter((id) => id.endsWith(':free'))
  if (freeIds.length === 0) {
    throw new Error('OpenRouter /models returned no :free models')
  }

  stderr.write(`OpenRouter: found ${freeIds.length} :free models; testing…\n`)

  const apiKeys: LlmApiKeys = {
    xaiApiKey: null,
    openaiApiKey: null,
    googleApiKey: null,
    anthropicApiKey: null,
    openrouterApiKey: openrouterKey,
  }

  type Ok = { openrouterModelId: string; latencyMs: number }
  type Result = { ok: true; value: Ok } | { ok: false; openrouterModelId: string; error: string }

  const results: Result[] = []
  for (let i = 0; i < freeIds.length; i += TARGET_WORKING * 5) {
    const batch = freeIds.slice(i, i + TARGET_WORKING * 5)
    const batchResults = await mapWithConcurrency(batch, CONCURRENCY, async (openrouterModelId) => {
      const startedAt = Date.now()
      try {
        await generateTextWithModelId({
          modelId: `openai/${openrouterModelId}`,
          apiKeys,
          prompt: 'Reply with a single word: OK',
          temperature: 0,
          maxOutputTokens: 16,
          timeoutMs: TIMEOUT_MS,
          fetchImpl,
          forceOpenRouter: true,
          retries: 0,
        })
        return {
          ok: true,
          value: { openrouterModelId, latencyMs: Date.now() - startedAt },
        } satisfies Result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (verbose) stderr.write(`fail ${openrouterModelId}: ${message}\n`)
        return { ok: false, openrouterModelId, error: message } satisfies Result
      }
    })

    for (const r of batchResults) results.push(r)
    const okCount = results.reduce((n, r) => n + (r.ok ? 1 : 0), 0)
    if (okCount >= TARGET_WORKING) break
  }

  const ok = results
    .filter((r): r is Extract<Result, { ok: true }> => r.ok)
    .map((r) => r.value)
    .sort((a, b) => a.latencyMs - b.latencyMs)

  if (ok.length === 0) {
    throw new Error(`No working :free models found (tested ${results.length})`)
  }

  const selected = ok.slice(0, MAX_CANDIDATES).map((r) => `openrouter/${r.openrouterModelId}`)
  stderr.write(`OpenRouter: selected ${selected.length} candidates.\n`)

  const configPath = resolveConfigPath(env)
  let root: Record<string, unknown> = {}
  try {
    const raw = await readFile(configPath, 'utf8')
    assertNoComments(raw, configPath)
    const parsed = JSON5.parse(raw) as unknown
    if (!isRecord(parsed)) {
      throw new Error(`Invalid config file ${configPath}: expected an object at the top level`)
    }
    root = parsed
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    if (code !== 'ENOENT') throw error
  }

  const modelsRaw = root.models
  const models = (() => {
    if (typeof modelsRaw === 'undefined') return {}
    if (!isRecord(modelsRaw)) {
      throw new Error(`Invalid config file ${configPath}: "models" must be an object.`)
    }
    return { ...modelsRaw }
  })()

  models.free = { rules: [{ candidates: selected }] }
  root.models = models

  await mkdir(dirname(configPath), { recursive: true })
  const next = `${JSON.stringify(root, null, 2)}\n`
  const tmp = `${configPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, next, 'utf8')
  await rename(tmp, configPath)

  stdout.write(`Wrote ${configPath} (models.free)\n`)
}
