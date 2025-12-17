import { createLinkPreviewClient } from '@steipete/summarizer/content'
import {
  buildLinkSummaryPrompt,
  estimateMaxCompletionTokensForCharacters,
  SUMMARY_LENGTH_TO_TOKENS,
} from '@steipete/summarizer/prompts'
import { Command } from 'commander'
import { createFirecrawlScraper } from './firecrawl.js'
import { parseDurationMs, parseFirecrawlMode, parseLengthArg, parseYoutubeMode } from './flags.js'

type RunEnv = {
  env: Record<string, string | undefined>
  fetch: typeof fetch
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

type JsonOutput = {
  input: {
    url: string
    timeoutMs: number
    youtube: string
    firecrawl: string
    length: { kind: 'preset'; preset: string } | { kind: 'chars'; maxCharacters: number }
  }
  env: {
    hasOpenAIKey: boolean
    hasApifyToken: boolean
    hasFirecrawlKey: boolean
  }
  extracted: unknown
  prompt: string
  openai: { model: string; maxCompletionTokens: number } | null
  summary: string | null
}

function buildProgram() {
  return new Command()
    .name('summarize')
    .description(
      'Summarize web pages and YouTube links (prompt-only when OPENAI_API_KEY is missing).'
    )
    .argument('<url>', 'URL to summarize')
    .option(
      '--youtube <mode>',
      'YouTube transcript source: auto (web then apify), web (youtubei/captionTracks), apify',
      'auto'
    )
    .option(
      '--firecrawl <mode>',
      'Firecrawl usage: off, auto (fallback), always (try Firecrawl first)',
      'auto'
    )
    .option(
      '--length <length>',
      'Summary length: short|medium|long|xl|xxl or a character limit like 20000, 20k',
      'medium'
    )
    .option(
      '--timeout <duration>',
      'Timeout for content fetching and OpenAI request: 30 (seconds), 30s, 2m, 5000ms',
      '30s'
    )
    .option('--model <model>', 'OpenAI model', undefined)
    .option('--prompt', 'Print the prompt and exit', false)
    .option('--extract-only', 'Print extracted content and exit', false)
    .option('--json', 'Output structured JSON', false)
    .allowExcessArguments(false)
}

async function summarizeWithOpenAI({
  apiKey,
  model,
  prompt,
  maxOutputTokens,
  timeoutMs,
  fetchImpl,
}: {
  apiKey: string
  model: string
  prompt: string
  maxOutputTokens: number
  timeoutMs: number
  fetchImpl: typeof fetch
}): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: maxOutputTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI request failed (${response.status}): ${body}`)
    }

    const json = (await response.json()) as unknown
    const content = readFirstChoiceContent(json)
    if (!content) {
      throw new Error('OpenAI response missing message content')
    }
    return content
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('OpenAI request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function readFirstChoiceContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const choices = (payload as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return null
  }
  const first = choices[0]
  if (!first || typeof first !== 'object') {
    return null
  }
  const message = (first as Record<string, unknown>).message
  if (!message || typeof message !== 'object') {
    return null
  }
  const content = (message as Record<string, unknown>).content
  return typeof content === 'string' ? content : null
}

export async function runCli(
  argv: string[],
  { env, fetch, stdout, stderr }: RunEnv
): Promise<void> {
  const normalizedArgv = argv.filter((arg) => arg !== '--')
  const program = buildProgram()
  program.parse(normalizedArgv, { from: 'user' })

  const url = program.args[0]
  if (!url) {
    throw new Error(
      'Usage: summarize <url> [--youtube auto|web|apify] [--length 20k] [--timeout 30s] [--json]'
    )
  }

  const youtubeMode = parseYoutubeMode(program.opts().youtube as string)
  const lengthArg = parseLengthArg(program.opts().length as string)
  const timeoutMs = parseDurationMs(program.opts().timeout as string)
  const printPrompt = Boolean(program.opts().prompt)
  const extractOnly = Boolean(program.opts().extractOnly)
  const json = Boolean(program.opts().json)
  const firecrawlMode = parseFirecrawlMode(program.opts().firecrawl as string)

  if (printPrompt && extractOnly) {
    throw new Error('--prompt and --extract-only are mutually exclusive')
  }

  const model =
    (typeof program.opts().model === 'string' ? (program.opts().model as string) : null) ??
    env.OPENAI_MODEL ??
    'gpt-5.2'

  const apiKey = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY : null
  const apifyToken = typeof env.APIFY_API_TOKEN === 'string' ? env.APIFY_API_TOKEN : null
  const firecrawlKey = typeof env.FIRECRAWL_API_KEY === 'string' ? env.FIRECRAWL_API_KEY : null

  const firecrawlApiKey = firecrawlKey && firecrawlKey.trim().length > 0 ? firecrawlKey : null
  const firecrawlConfigured = firecrawlApiKey !== null
  if (firecrawlMode === 'always' && !firecrawlConfigured) {
    throw new Error('--firecrawl always requires FIRECRAWL_API_KEY')
  }

  const scrapeWithFirecrawl =
    firecrawlConfigured && firecrawlMode !== 'off'
      ? createFirecrawlScraper({ apiKey: firecrawlApiKey, fetchImpl: fetch })
      : null

  const client = createLinkPreviewClient({
    apifyApiToken: apifyToken,
    scrapeWithFirecrawl,
    fetch,
  })

  const extracted = await client.fetchLinkContent(url, {
    timeoutMs,
    youtubeTranscript: youtubeMode,
    firecrawl: firecrawlMode,
  })

  const isYouTube = extracted.siteName === 'YouTube'
  const prompt = buildLinkSummaryPrompt({
    url: extracted.url,
    title: extracted.title,
    siteName: extracted.siteName,
    description: extracted.description,
    content: extracted.content,
    truncated: extracted.truncated,
    hasTranscript:
      isYouTube ||
      (extracted.transcriptSource !== null && extracted.transcriptSource !== 'unavailable'),
    summaryLength:
      lengthArg.kind === 'preset' ? lengthArg.preset : { maxCharacters: lengthArg.maxCharacters },
    shares: [],
  })

  if (extractOnly) {
    if (json) {
      const payload: JsonOutput = {
        input: {
          url,
          timeoutMs,
          youtube: youtubeMode,
          firecrawl: firecrawlMode,
          length:
            lengthArg.kind === 'preset'
              ? { kind: 'preset', preset: lengthArg.preset }
              : { kind: 'chars', maxCharacters: lengthArg.maxCharacters },
        },
        env: {
          hasOpenAIKey: Boolean(apiKey),
          hasApifyToken: Boolean(apifyToken),
          hasFirecrawlKey: firecrawlConfigured,
        },
        extracted,
        prompt,
        openai: null,
        summary: null,
      }
      stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
      return
    }

    stdout.write(`${extracted.content}\n`)
    return
  }

  if (printPrompt || !apiKey) {
    if (!apiKey && !json) {
      stderr.write('Missing OPENAI_API_KEY; printing prompt instead.\n')
    }

    if (json) {
      const payload: JsonOutput = {
        input: {
          url,
          timeoutMs,
          youtube: youtubeMode,
          firecrawl: firecrawlMode,
          length:
            lengthArg.kind === 'preset'
              ? { kind: 'preset', preset: lengthArg.preset }
              : { kind: 'chars', maxCharacters: lengthArg.maxCharacters },
        },
        env: {
          hasOpenAIKey: Boolean(apiKey),
          hasApifyToken: Boolean(apifyToken),
          hasFirecrawlKey: firecrawlConfigured,
        },
        extracted,
        prompt,
        openai: null,
        summary: null,
      }
      stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
      return
    }

    stdout.write(`${prompt}\n`)
    return
  }

  const maxCompletionTokens =
    lengthArg.kind === 'preset'
      ? SUMMARY_LENGTH_TO_TOKENS[lengthArg.preset]
      : estimateMaxCompletionTokensForCharacters(lengthArg.maxCharacters)

  let summary = await summarizeWithOpenAI({
    apiKey,
    model,
    prompt,
    maxOutputTokens: maxCompletionTokens,
    timeoutMs,
    fetchImpl: fetch,
  })

  summary = summary.trim()

  if (json) {
    const payload: JsonOutput = {
      input: {
        url,
        timeoutMs,
        youtube: youtubeMode,
        firecrawl: firecrawlMode,
        length:
          lengthArg.kind === 'preset'
            ? { kind: 'preset', preset: lengthArg.preset }
            : { kind: 'chars', maxCharacters: lengthArg.maxCharacters },
      },
      env: {
        hasOpenAIKey: true,
        hasApifyToken: Boolean(apifyToken),
        hasFirecrawlKey: firecrawlConfigured,
      },
      extracted,
      prompt,
      openai: { model, maxCompletionTokens },
      summary,
    }

    stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }

  stdout.write(`${summary}\n`)
}
