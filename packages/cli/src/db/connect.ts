import postgres from 'postgres'

// Every session is read-only, so introspection and doctor can never write.
export const connect = (url: string, options: { connectTimeout?: number } = {}) =>
  postgres(url, {
    max: 1,
    ...(options.connectTimeout && { connect_timeout: options.connectTimeout }),
    onnotice: () => {},
    connection: { default_transaction_read_only: true },
  })

export type Sql = ReturnType<typeof connect>

/** Whether a command's first argument is a connection string rather than a target. */
export const isConnectionString = (value: string) => /^postgres(ql)?:\/\//.test(value)

// The variable read without a connection string or --env, from the environment or the nearest .env, as `dev` reads it.
export const defaultConnectionEnv = 'DATABASE_URL'

export const resolveConnectionUrl = (arg: string | undefined, envName: string | undefined) => {
  if (arg && envName) throw new Error('Pass either a connection string or --env, not both')
  if (arg) return arg
  const value = process.env[envName ?? defaultConnectionEnv]
  if (value) return value
  if (envName) throw new Error(`Environment variable ${envName} is not set`)
  throw new Error(`Pass a connection string or --env <VARIABLE>, or set ${defaultConnectionEnv} in .env`)
}
