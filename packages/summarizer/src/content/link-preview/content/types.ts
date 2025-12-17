import type { ContentFetchDiagnostics, TranscriptDiagnostics, TranscriptSource } from '../types.js'

export const DEFAULT_MAX_CONTENT_CHARACTERS = 8000
export const DEFAULT_TIMEOUT_MS = 5000
export type YoutubeTranscriptMode = 'auto' | 'web' | 'apify'
export type FirecrawlMode = 'off' | 'auto' | 'always'

export interface FetchLinkContentOptions {
  maxCharacters?: number
  timeoutMs?: number
  youtubeTranscript?: YoutubeTranscriptMode
  firecrawl?: FirecrawlMode
}

export interface TranscriptResolution {
  diagnostics?: TranscriptDiagnostics
  source: TranscriptSource | null
  text: string | null
}

export interface ExtractedLinkContent {
  url: string
  title: string | null
  description: string | null
  siteName: string | null
  content: string
  truncated: boolean
  totalCharacters: number
  wordCount: number
  transcriptCharacters: number | null
  transcriptLines: number | null
  transcriptSource: TranscriptSource | null
  diagnostics: ContentFetchDiagnostics
}

export interface FinalizationArguments {
  url: string
  baseContent: string
  maxCharacters: number
  title: string | null
  description: string | null
  siteName: string | null
  transcriptResolution: TranscriptResolution
  diagnostics: ContentFetchDiagnostics
}
