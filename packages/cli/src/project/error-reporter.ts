import { errorReportingSettings, startErrorReporting, type ProjectConfig } from '@protobase/server'

/** The project's error reporter, when its `options.errorReporting` or `PROTOBASE_SENTRY_DSN` sets a DSN. */
export const projectErrorReporter = async (project: ProjectConfig, env: Record<string, string | undefined>) => {
  const settings = errorReportingSettings(project.options?.errorReporting, env)
  return settings ? startErrorReporting(settings) : undefined
}
