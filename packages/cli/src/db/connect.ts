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
