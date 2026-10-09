import postgres from 'postgres'

export const databaseUrl = process.env.DATABASE_URL ?? 'postgres://protobase:protobase@localhost:55432/real_estate'

export const connect = (options: postgres.Options<{}> = {}) => postgres(databaseUrl, { onnotice: () => {}, ...options })

export type Db = ReturnType<typeof connect>
