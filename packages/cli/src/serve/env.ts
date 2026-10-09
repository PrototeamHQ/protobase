// The environment the platform provides. Better Auth settings (BETTER_AUTH_SECRET, ...) are the project's own.
export type ServeEnv = {
  port: number
  // Not needed when protobase.config.ts exports `db`.
  databaseUrl?: string
  requestLog: boolean
}

export const defaultPort = 8787

export const readServeEnv = (env: Record<string, string | undefined>): ServeEnv => {
  const port = env.PORT ? Number(env.PORT) : defaultPort
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`PORT must be a port number, not "${env.PORT}"`)
  return { port, databaseUrl: env.DATABASE_URL || undefined, requestLog: Boolean(env.REQUEST_LOG) }
}
