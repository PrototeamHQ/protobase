// The environment the platform provides. Better Auth settings (BETTER_AUTH_SECRET, ...) are the project's own.
export type ServeEnv = {
  port: number
  // Not needed when protobase.config.ts exports `db`.
  databaseUrl?: string
  requestLog: boolean
  // Minutes between runs of the scheduled file deletes; 0 leaves them to `protobase files cleanup` or the platform.
  filesCleanupMinutes: number
}

export const defaultPort = 8787

export const readServeEnv = (env: Record<string, string | undefined>): ServeEnv => {
  const port = env.PORT ? Number(env.PORT) : defaultPort
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`PORT must be a port number, not "${env.PORT}"`)
  const minutes = env.PROTOBASE_FILES_CLEANUP_MINUTES ? Number(env.PROTOBASE_FILES_CLEANUP_MINUTES) : 60
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error(`PROTOBASE_FILES_CLEANUP_MINUTES must be a whole number of minutes, not "${env.PROTOBASE_FILES_CLEANUP_MINUTES}"`)
  return { port, databaseUrl: env.DATABASE_URL || undefined, requestLog: Boolean(env.REQUEST_LOG), filesCleanupMinutes: minutes }
}
