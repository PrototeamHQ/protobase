import { describe, expect, it } from 'vitest'
import { nextSteps } from './next-steps'

describe('nextSteps', () => {
  it('migrates, creates a user and serves a project without seeds', () => {
    expect(nextSteps('my-app', { 'db:migrate': 'bun db/migrate.ts' })).toBe(
      [
        '  cd my-app',
        '  bun install',
        '  cp .env.example .env   # then set DATABASE_URL and BETTER_AUTH_SECRET',
        '  bun run db:migrate',
        '  bun run protobase users create you@example.com --generate-password',
        '  bun run dev            # http://localhost:5173',
        '',
      ].join('\n'),
    )
  })

  it('loads the base seed and offers the sample data before the first user', () => {
    const steps = nextSteps('my-erp', { 'db:migrate': '', 'db:seed:base': '', 'db:seed': '' }).split('\n')
    expect(steps.indexOf('  bun run db:seed:base')).toBe(4)
    expect(steps[5]).toContain('bun run db:seed --scale small')
    expect(steps[6]).toContain('users create')
  })
})
