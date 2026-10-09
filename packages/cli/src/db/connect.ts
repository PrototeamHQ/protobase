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

export const resolveConnectionUrl = (arg: string | undefined, envName: string | undefined) => {
  if (arg && envName) throw new Error('Pass either a connection string or --env, not both')
  if (arg) return arg
  if (!envName) throw new Error('Pass a connection string or --env <VARIABLE>')
  const value = process.env[envName]
  if (!value) throw new Error(`Environment variable ${envName} is not set`)
  return value
}
