import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { fetchWithTimeout } from '../../../fetch-with-timeout.js'
import { sanitizeYoutubeJsonResponse } from '../../utils.js'

const execFileAsync = promisify(execFile)

type YtDlpCaptionEntry = {
  ext?: unknown
  url?: unknown
  name?: unknown
}

type YtDlpInfo = {
  subtitles?: unknown
  automatic_captions?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseJson3Transcript = (raw: string): string | null => {
  type CaptionEventRecord = Record<string, unknown> & { segs?: unknown }
  type CaptionSegmentRecord = Record<string, unknown> & { utf8?: unknown }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return null
    }

    const eventsUnknown = (parsed as Record<string, unknown>).events
    if (!Array.isArray(eventsUnknown)) {
      return null
    }

    const lines: string[] = []
    for (const event of eventsUnknown) {
      if (!isRecord(event)) {
        continue
      }
      const eventRecord = event as CaptionEventRecord
      const segs = Array.isArray(eventRecord.segs) ? (eventRecord.segs as unknown[]) : null
      if (!segs) {
        continue
      }
      const text = segs
        .map((seg) => {
          if (!isRecord(seg)) {
            return ''
          }
          const segRecord = seg as CaptionSegmentRecord
          return typeof segRecord.utf8 === 'string' ? segRecord.utf8 : ''
        })
        .join('')
        .trim()
      if (text.length > 0) {
        lines.push(text)
      }
    }

    const transcript = lines.join('\n').trim()
    return transcript.length > 0 ? transcript : null
  } catch {
    return null
  }
}

function pickCaptionUrl(info: YtDlpInfo): string | null {
  const sources = [info.subtitles, info.automatic_captions]
  const candidates: Array<[string, unknown]> = []

  for (const source of sources) {
    if (!isRecord(source)) continue
    for (const [lang, entries] of Object.entries(source)) {
      candidates.push([lang, entries])
    }
  }

  const languagePreference = (lang: string): number => {
    const lower = lang.toLowerCase()
    if (lower === 'en') return 0
    if (lower.startsWith('en-')) return 1
    if (lower.startsWith('en')) return 2
    return 10
  }

  const sorted = candidates.toSorted(([a], [b]) => languagePreference(a) - languagePreference(b))

  for (const [, entries] of sorted) {
    if (!Array.isArray(entries)) continue
    const normalized = entries.filter((entry): entry is YtDlpCaptionEntry => isRecord(entry))
    const json3 = normalized.find((entry) => entry.ext === 'json3' && typeof entry.url === 'string')
    if (json3?.url && typeof json3.url === 'string') {
      return json3.url
    }
    const vtt = normalized.find((entry) => entry.ext === 'vtt' && typeof entry.url === 'string')
    if (vtt?.url && typeof vtt.url === 'string') {
      return vtt.url
    }
  }

  return null
}

export async function fetchTranscriptWithYtDlp(
  fetchImpl: typeof fetch,
  url: string,
  { timeoutMs }: { timeoutMs?: number } = {}
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      ['--dump-single-json', '--no-playlist', '--no-warnings', url],
      { timeout: typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? timeoutMs : 60_000 }
    )

    const parsed: unknown = JSON.parse(stdout)
    if (!isRecord(parsed)) {
      return null
    }

    const info = parsed as YtDlpInfo
    const captionUrl = pickCaptionUrl(info)
    if (!captionUrl) {
      return null
    }

    const response = await fetchWithTimeout(fetchImpl, captionUrl, undefined, 60_000)
    if (!response.ok) {
      return null
    }

    const raw = await response.text()
    const sanitized = sanitizeYoutubeJsonResponse(raw)
    return parseJson3Transcript(sanitized)
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : null
    if (code === 'ENOENT') {
      return null
    }
    return null
  }
}
