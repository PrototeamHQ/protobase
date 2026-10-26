import { describe, expect, it } from 'vitest'
import { migrationSummary } from './summary'

describe('migrationSummary', () => {
  it('lists the files written, relative to the project', () => {
    expect(migrationSummary(['/app/db/migrations/001_auth.sql'], '/app', true)).toBe("wrote db/migrations/001_auth.sql\napply them with the project's migrations\n")
  })

  it('says the database is current', () => {
    expect(migrationSummary([], '/app', true)).toBe('the database is up to date; nothing to write\n')
  })

  it('says a config without auth has no sign-in, whose tables it never writes', () => {
    expect(migrationSummary([], '/app', false)).toBe(
      'the database is up to date; nothing to write\nsign-in is off, so nothing was written for it: see https://docs.protobase.net/guides/existing-database/\n',
    )
  })
})
