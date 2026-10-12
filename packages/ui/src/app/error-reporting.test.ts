import { describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }))
vi.mock('@sentry/browser', () => sentry)

const { reportRenderError, startErrorReporting } = await import('./error-reporting')

describe('error reporting in the app', () => {
  it('reports nothing before it starts, then starts Sentry once, for errors only and without secrets', async () => {
    reportRenderError(new Error('early'))
    expect(sentry.captureException).not.toHaveBeenCalled()

    await startErrorReporting({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
    await startErrorReporting({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
    expect(sentry.init).toHaveBeenCalledTimes(1)
    const options = sentry.init.mock.calls[0]![0]
    expect(options).toMatchObject({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
    expect(options.tracesSampleRate).toBeUndefined()
    expect(options.integrations([{ name: 'GlobalHandlers' }, { name: 'BrowserSession' }])).toEqual([{ name: 'GlobalHandlers' }])
    expect(options.beforeSend({ request: { headers: { Authorization: 'Bearer abc' } } })).toEqual({ request: { headers: { Authorization: '[Filtered]' } } })

    const error = new Error('render')
    reportRenderError(error, '\n    at Card')
    expect(sentry.captureException).toHaveBeenCalledWith(error, { contexts: { react: { componentStack: '\n    at Card' } } })
  })
})
