import type { ErrorReportingSettings } from './error-reporting-settings'
import type { ErrorReporter } from './sentry-reporter'

export type { ErrorReporter }

/** A reporter to the tracker of `settings`. The Sentry client loads only here, so an app without a DSN never loads it. */
export const startErrorReporting = async (settings: ErrorReportingSettings): Promise<ErrorReporter> =>
  (await import('./sentry-reporter')).sentryReporter(settings)
