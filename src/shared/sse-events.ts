export type SseMetaData = {
  model: string | null
  modelLabel: string | null
  inputSummary: string | null
  summaryFromCache?: boolean | null
}

export type SseMetricsData = {
  elapsedMs: number
  summary: string
  details: string | null
  summaryDetailed: string
  detailsDetailed: string | null
}

export type SseEvent =
  | { event: 'meta'; data: SseMetaData }
  | { event: 'status'; data: { text: string } }
  | { event: 'chunk'; data: { text: string } }
  | { event: 'metrics'; data: SseMetricsData }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } }

export type RawSseMessage = { event: string; data: string }

export function encodeSseEvent(event: SseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
}

export function parseSseEvent(message: RawSseMessage): SseEvent | null {
  switch (message.event) {
    case 'meta':
      return { event: 'meta', data: JSON.parse(message.data) as SseMetaData }
    case 'status':
      return { event: 'status', data: JSON.parse(message.data) as { text: string } }
    case 'chunk':
      return { event: 'chunk', data: JSON.parse(message.data) as { text: string } }
    case 'metrics':
      return { event: 'metrics', data: JSON.parse(message.data) as SseMetricsData }
    case 'done':
      return { event: 'done', data: JSON.parse(message.data) as Record<string, never> }
    case 'error':
      return { event: 'error', data: JSON.parse(message.data) as { message: string } }
    default:
      return null
  }
}
