import type { Meta } from '@protobase/client'
import { redactSecrets } from '@protobase/schema/internal'

type Capture = (error: unknown, componentStack?: string) => void

let loading: Promise<void> | undefined
let capture: Capture | undefined

/**
 * Sends the app's uncaught errors to the error tracker `/meta` names, from the first call on; the Sentry SDK loads only
 * then, so an app without a DSN never loads it. Errors only, with no performance tracing and no session tracking,
 * every event without its secrets (see `redactSecrets`).
 */
export const startErrorReporting = ({ dsn, environment }: NonNullable<Meta['errorReporting']>) => {
  loading ??= import('@sentry/browser').then((sentry) => {
    sentry.init({
      dsn,
      ...(environment && { environment }),
      integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserSession'),
      beforeSend: (event) => redactSecrets(event),
    })
    capture = (error, componentStack) => sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined)
  })
  return loading
}

/** Reports an error a boundary caught while drawing, with the components it was drawn in; nothing before error reporting started. */
export const reportRenderError = (error: unknown, componentStack?: string | null) => capture?.(error, componentStack ?? undefined)
