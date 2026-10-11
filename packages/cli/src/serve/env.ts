// The environment the platform provides. Better Auth settings (BETTER_AUTH_SECRET, ...) are the project's own.
export type ServeEnv = {
  port: number
  // Not needed when protobase.config.ts exports `db`.
  databaseUrl?: string
  requestLog: boolean
  // Minutes between runs of the scheduled file deletes; 0 leaves them to `protobase files cleanup` or the platform.
  filesCleanupMinutes: number
  // Whether this process runs the app's jobs (PROTOBASE_JOBS=off leaves them to `protobase worker`); it enqueues them either way.
  runJobs: boolean
  // The operator's bearer token for POST /api/jobs/drain (PROTOBASE_JOBS_DRAIN_TOKEN); without it there is no drain endpoint.
  drainToken?: string
}

export const defaultPort = 8787

export const readServeEnv = (env: Record<string, string | undefined>): ServeEnv => {
  const port = env.PORT ? Number(env.PORT) : defaultPort
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`PORT must be a port number, not "${env.PORT}"`)
  const minutes = env.PROTOBASE_FILES_CLEANUP_MINUTES ? Number(env.PROTOBASE_FILES_CLEANUP_MINUTES) : 60
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error(`PROTOBASE_FILES_CLEANUP_MINUTES must be a whole number of minutes, not "${env.PROTOBASE_FILES_CLEANUP_MINUTES}"`)
  const jobs = env.PROTOBASE_JOBS ?? 'on'
  if (jobs !== 'on' && jobs !== 'off') throw new Error(`PROTOBASE_JOBS must be on or off, not "${jobs}"`)
  return {
    port,
    databaseUrl: env.DATABASE_URL || undefined,
    requestLog: Boolean(env.REQUEST_LOG),
    filesCleanupMinutes: minutes,
    runJobs: jobs === 'on',
    ...(env.PROTOBASE_JOBS_DRAIN_TOKEN && { drainToken: env.PROTOBASE_JOBS_DRAIN_TOKEN }),
  }
}
