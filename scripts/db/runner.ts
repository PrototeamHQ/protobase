/**
 * How `bun run db:up` runs the development databases, from POSTGRES_RUNNER in `.env`: `docker`, the default, starts
 * docker-compose.yml; `local` runs this machine's Postgres and PgBouncer as plain processes (scripts/db/local/).
 */
export const runners = ['docker', 'local'] as const

export type Runner = (typeof runners)[number]

export const parseRunner = (value: string | undefined): Runner => {
  if (value === undefined || value === '') return 'docker'
  const runner = runners.find((name) => name === value)
  if (!runner) throw new Error(`POSTGRES_RUNNER must be ${runners.join(' or ')}, not "${value}"`)
  return runner
}
