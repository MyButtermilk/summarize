import type { Settings } from './settings'

export type ExtractedPage = {
  url: string
  title: string | null
  text: string
  truncated: boolean
}

export function buildDaemonRequestBody({
  extracted,
  settings,
  noCache,
}: {
  extracted: ExtractedPage
  settings: Settings
  noCache?: boolean
}): Record<string, unknown> {
  const promptOverride = settings.promptOverride?.trim()
  const advancedEnabled = settings.advancedOverrides
  const maxOutputTokens = settings.maxOutputTokens?.trim()
  const timeout = settings.timeout?.trim()
  return {
    url: extracted.url,
    title: extracted.title,
    text: extracted.text,
    truncated: extracted.truncated,
    model: settings.model,
    length: settings.length,
    language: settings.language,
    ...(promptOverride ? { prompt: promptOverride } : {}),
    ...(noCache ? { noCache: true } : {}),
    ...(advancedEnabled
      ? {
          mode: settings.requestMode,
          firecrawl: settings.firecrawlMode,
          markdownMode: settings.markdownMode,
          preprocess: settings.preprocessMode,
          youtube: settings.youtubeMode,
          ...(timeout ? { timeout } : {}),
          ...(Number.isFinite(settings.retries) ? { retries: settings.retries } : {}),
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
        }
      : { mode: 'auto' }),
    maxCharacters: settings.maxChars,
  }
}
