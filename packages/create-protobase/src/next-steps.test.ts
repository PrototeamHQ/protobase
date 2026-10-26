import { describe, expect, it } from 'vitest'
import { nextSteps } from './next-steps'

const both = { bun: true, docker: true }

describe('nextSteps', () => {
  it('starts the database, migrates, creates a user and serves a project without seeds', () => {
    expect(nextSteps('my-app', { 'db:migrate': 'bun db/migrate.ts' }, 55432, both)).toBe(
      [
        '  cd my-app',
        '  bun install',
        '  bun run db:up          # Postgres 18 in Docker on port 55432',
        '  bun run db:migrate',
        '  bun run protobase users create you@example.com --generate-password',
        '  bun run dev            # http://localhost:5173',
        '',
      ].join('\n'),
    )
  })

  it('loads the base seed and offers the sample data before the first user', () => {
    const steps = nextSteps('my-erp', { 'db:migrate': '', 'db:seed:base': '', 'db:seed': '' }, 55432, both).split('\n')
    expect(steps.indexOf('  bun run db:seed:base')).toBe(4)
    expect(steps[5]).toContain('bun run db:seed --scale small')
    expect(steps[6]).toContain('users create')
  })

  it('points at a database of their own without Docker', () => {
    const steps = nextSteps('my-app', {}, 55432, { bun: true, docker: false }).split('\n')
    expect(steps[2]).toBe('  # no Docker found: set DATABASE_URL in .env to a Postgres database of yours')
  })

  it('says to install Bun first without it', () => {
    const steps = nextSteps('my-app', {}, 55432, { bun: false, docker: true })
    expect(steps).toMatch(/^Bun 1\.4 runs the project's scripts: install it first \(https:\/\/bun\.sh\)\.\n\n  cd my-app\n/)
  })
})
