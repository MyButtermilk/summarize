import { vi } from 'vitest'

if (process.env.SUMMARIZE_TEST_ENABLE_YTDLP !== '1') {
  vi.mock('node:child_process', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')

    return {
      ...actual,
      execFile: (
        _file: string,
        _args: readonly string[],
        optionsOrCallback:
          | import('node:child_process').ExecFileOptions
          | import('node:child_process').ExecFileCallback,
        maybeCallback?: import('node:child_process').ExecFileCallback
      ) => {
        const callback =
          typeof optionsOrCallback === 'function'
            ? optionsOrCallback
            : (maybeCallback ?? (() => {}))
        const error = Object.assign(new Error('yt-dlp disabled for unit tests'), { code: 'ENOENT' })
        callback(error as unknown as Error, '', '')
      },
    }
  })
}
