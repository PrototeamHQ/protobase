import { describe, expect, it } from 'vitest'
import { migrationSummary, signInGuide } from './summary'

describe('migrationSummary', () => {
  it('names the file written and the snapshot, relative to the current directory', () => {
    expect(migrationSummary('/app/db/migrations/001_auth.sql', '/app', { hasAuth: true, compared: true })).toBe("wrote db/migrations/001_auth.sql and protobase.snapshot.json\napply it with the project's migrations\n")
  })

  it('says nothing was written when nothing differs', () => {
    expect(migrationSummary(undefined, '/app', { hasAuth: true, compared: true })).toBe('the migrations make what the config needs; nothing to write\n')
  })

  it('says the features besides the auth store and the jobs schema were not compared without a database', () => {
    expect(migrationSummary(undefined, '/app', { hasAuth: true, compared: false })).toContain('DATABASE_URL is not set, so only the auth store and the jobs schema were compared, with the snapshot')
  })

  it('says sign-in is off rather than leave it to "nothing to write"', () => {
    expect(migrationSummary(undefined, '/app', { hasAuth: false, compared: true })).toBe(`the migrations make what the config needs; nothing to write\nsign-in is off, so nothing was written for it: see ${signInGuide}\n`)
  })
})
