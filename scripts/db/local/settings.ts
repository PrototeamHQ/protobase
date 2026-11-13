import path from 'node:path'

/** The databases' settings from `.env`, the ones docker-compose.yml reads too, with the same defaults. */
export const readSettings = (env: Record<string, string | undefined>) => ({
  user: required(env, 'POSTGRES_USER'),
  password: required(env, 'POSTGRES_PASSWORD'),
  database: required(env, 'POSTGRES_DB'),
  port: Number(required(env, 'POSTGRES_PORT')),
  poolerPort: Number(env.PGBOUNCER_PORT || '55442'),
  bin: env.POSTGRES_BIN || undefined,
})

export type Settings = ReturnType<typeof readSettings>

const required = (env: Record<string, string | undefined>, name: string) => {
  const value = env[name]
  if (!value) throw new Error(`${name} is not set in .env`)
  return value
}

/** Where the local databases keep their files: in the repository's gitignored `.protobase` folder. */
export const folder = path.join(import.meta.dirname, '..', '..', '..', '.protobase', 'postgres')
