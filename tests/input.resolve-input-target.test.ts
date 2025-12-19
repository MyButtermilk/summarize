import { describe, expect, it } from 'vitest'

import { resolveInputTarget } from '../src/content/asset.js'

describe('resolveInputTarget', () => {
  it('accepts valid URLs unchanged', () => {
    expect(resolveInputTarget('https://example.com')).toEqual({
      kind: 'url',
      url: 'https://example.com',
    })
  })

  it('unescapes common pasted backslash escapes for query separators', () => {
    expect(resolveInputTarget('https://www.youtube.com/watch\\?v\\=497Ov6kV4KM')).toEqual({
      kind: 'url',
      url: 'https://www.youtube.com/watch?v=497Ov6kV4KM',
    })
  })

  it('removes percent-encoded backslashes directly before query separators', () => {
    expect(resolveInputTarget('https://www.youtube.com/watch%5C?v%5C=497Ov6kV4KM')).toEqual({
      kind: 'url',
      url: 'https://www.youtube.com/watch?v=497Ov6kV4KM',
    })
  })

  it('extracts the last URL from pasted text and normalizes it', () => {
    expect(
      resolveInputTarget(
        'https://www.youtube.com/watch\\?v\\=497Ov6kV4KM (https://www.youtube.com/watch%5C?v%5C=497Ov6kV4KM)'
      )
    ).toEqual({
      kind: 'url',
      url: 'https://www.youtube.com/watch?v=497Ov6kV4KM',
    })
  })

  it('extracts embedded URLs from arbitrary text', () => {
    expect(resolveInputTarget('foo https://example.com/bar baz')).toEqual({
      kind: 'url',
      url: 'https://example.com/bar',
    })
  })

  it('throws when neither file nor URL can be resolved', () => {
    expect(() => resolveInputTarget('not a url')).toThrow(/Invalid URL or file path/i)
  })
})
