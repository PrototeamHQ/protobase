import { createStackParser, createTransport, dedupeIntegration, eventFiltersIntegration, functionToStringIntegration, linkedErrorsIntegration, requestDataIntegration, Scope, winterCGRequestToRequestData, type BaseTransportOptions } from '@sentry/core'
import { nodeStackLineParser, ServerRuntimeClient } from '@sentry/core/server'
import { redactSecrets } from '@protobase/schema'
import type { ErrorReportingSettings } from './error-reporting-settings'

/** Sends errors to the error tracker. `request`: the one being handled when the error happened, without its secrets. */
export type ErrorReporter = {
  report: (error: unknown, request?: Request) => void
  /** Waits until every error reported so far is sent, or `timeoutMs` passed: false then. */
  flush: (timeoutMs: number) => Promise<boolean>
}

// Sends with `fetch`, which Bun and Node both have.
const fetchTransport = (options: BaseTransportOptions) =>
  createTransport(options, async ({ body }) => {
    // Sentry types the envelope's bytes over any ArrayBufferLike; they are always over an ArrayBuffer.
    const response = await fetch(options.url, { method: 'POST', body: body as BodyInit, ...(options.headers && { headers: options.headers }) })
    await response.body?.cancel()
    return { statusCode: response.status, headers: { 'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'), 'retry-after': response.headers.get('Retry-After') } }
  })

const runtime = () => {
  const bun = (globalThis as { Bun?: { version: string } }).Bun
  return bun ? { name: 'bun', version: bun.version } : { name: 'node', version: globalThis.process?.version }
}

/**
 * A reporter on Sentry's runtime-neutral client: errors only, with no performance tracing and no instrumentation of
 * the process, every event without its secrets (see `redactSecrets`).
 */
export const sentryReporter = ({ dsn, environment }: ErrorReportingSettings): ErrorReporter => {
  const client = new ServerRuntimeClient({
    dsn,
    ...(environment && { environment }),
    platform: 'node',
    runtime: runtime(),
    traceLifecycle: 'static',
    stackParser: createStackParser(nodeStackLineParser()),
    integrations: [eventFiltersIntegration(), functionToStringIntegration(), linkedErrorsIntegration(), dedupeIntegration(), requestDataIntegration()],
    transport: fetchTransport,
    beforeSend: (event) => redactSecrets(event),
  })
  client.init()
  return {
    report: (error, request) => {
      const scope = new Scope()
      if (request) scope.setSDKProcessingMetadata({ normalizedRequest: winterCGRequestToRequestData(request) })
      client.captureException(error, { mechanism: { type: 'protobase', handled: false } }, scope)
    },
    flush: async (timeoutMs) => client.flush(timeoutMs),
  }
}
