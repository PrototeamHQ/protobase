import type { ErrorReporter } from '@protobase/server'

type CrashingProcess = {
  on: (event: 'uncaughtException' | 'unhandledRejection', listener: (error: unknown) => void) => unknown
  exit: (code: number) => void
}

/**
 * Reports an exception or a rejection nothing handled, then ends the process as Node and Bun do without a listener:
 * the error printed, exit code 1. The report has `flushMs` to reach the error tracker.
 */
export const reportCrashes = (reporter: ErrorReporter, target: CrashingProcess = process, flushMs = 2000) => {
  const crash = (error: unknown) => {
    console.error(error)
    reporter.report(error)
    void reporter.flush(flushMs).then(() => target.exit(1))
  }
  target.on('uncaughtException', crash)
  target.on('unhandledRejection', crash)
}
