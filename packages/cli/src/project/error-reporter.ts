import { errorReportingSettings, startErrorReporting } from '@protobase/server'
import type { MergedConfig } from '../config/merge-config'

/** The project's error reporter, when its `errorReporting` or `PROTOBASE_SENTRY_DSN` sets a DSN. */
export const projectErrorReporter = async (config: Pick<MergedConfig, 'errorReporting'>, env: Record<string, string | undefined>) => {
  const settings = errorReportingSettings(config.errorReporting, env)
  return settings ? startErrorReporting(settings) : undefined
}
