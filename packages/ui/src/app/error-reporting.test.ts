import { describe, expect, it, vi } from 'vitest'
import type { Event } from '@sentry/browser'

type Integration = ReturnType<typeof import('@sentry/browser').thirdPartyErrorFilterIntegration>

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }))
vi.mock('@sentry/browser', async (importActual) => {
  const { thirdPartyErrorFilterIntegration } = await importActual<typeof import('@sentry/browser')>()
  return { ...sentry, thirdPartyErrorFilterIntegration }
})

const { reportRenderError, startErrorReporting } = await import('./error-reporting')

// A stack frame of the app's own scripts, as the SDK reads their build's mark, or of any other script.
const ownFrame = { filename: 'https://app.example.com/assets/app-1a2b.js', lineno: 1, colno: 10, module_metadata: { '_sentryBundlerPluginAppKey:protobase-app': true } }
const injectedFrame = { filename: 'user-script:1', lineno: 3, colno: 7 }
const eventWith = (...frames: object[]): Event => ({ exception: { values: [{ type: 'TypeError', stacktrace: { frames } }] } })

// The integrations a fresh start of error reporting runs with.
const startedIntegrations = async (): Promise<Integration[]> => {
  vi.resetModules()
  await (await import('./error-reporting')).startErrorReporting({ dsn: 'https://public@errors.example.com/42' })
  return sentry.init.mock.lastCall![0].integrations([])
}

describe('error reporting in the app', () => {
  it('reports nothing before it starts, then starts Sentry once, for errors only and without secrets', async () => {
    vi.stubEnv('DEV', false)
    reportRenderError(new Error('early'))
    expect(sentry.captureException).not.toHaveBeenCalled()

    await startErrorReporting({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
    await startErrorReporting({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
    expect(sentry.init).toHaveBeenCalledTimes(1)
    const options = sentry.init.mock.calls[0]![0]
    expect(options).toMatchObject({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
    expect(options.tracesSampleRate).toBeUndefined()
    const names = options.integrations([{ name: 'GlobalHandlers' }, { name: 'BrowserSession' }]).map((integration: Integration) => integration.name)
    expect(names).toEqual(['GlobalHandlers', 'ThirdPartyErrorsFilter'])
    expect(options.beforeSend({ request: { headers: { Authorization: 'Bearer abc' } } })).toEqual({ request: { headers: { Authorization: '[Filtered]' } } })

    const error = new Error('render')
    reportRenderError(error, '\n    at Card')
    expect(sentry.captureException).toHaveBeenCalledWith(error, { contexts: { react: { componentStack: '\n    at Card' } } })
    vi.unstubAllEnvs()
  })

  it("drops an error raised only in scripts that are not the app's, and sends one that passes through the app's", async () => {
    vi.stubEnv('DEV', false)
    const filter = (await startedIntegrations()).find((integration) => integration.name === 'ThirdPartyErrorsFilter')!
    const process = (event: Event) => filter.processEvent!(event, {}, {} as never)

    expect(process(eventWith(injectedFrame))).toBeNull()
    expect(process(eventWith(ownFrame))).not.toBeNull()
    expect(process(eventWith(ownFrame, injectedFrame))).not.toBeNull()
    vi.unstubAllEnvs()
  })

  it('filters nothing in development, where no script carries the mark', async () => {
    vi.stubEnv('DEV', true)
    expect(await startedIntegrations()).toEqual([])
    vi.unstubAllEnvs()
  })
})
