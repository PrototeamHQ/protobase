import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mergeConfig, type Authenticator, type ProjectConfig } from '@protobase/server'
import { importProjectFile } from './import-project-file'
import { projectAdmin } from './project-admin'

// Each example's auth makes its pg pool when imported, which connects nothing until a query.
vi.unmock('pg')

const examplesDir = path.join(import.meta.dirname, '..', '..', '..', '..', 'examples')
const examples = readdirSync(examplesDir).filter((name) => existsSync(path.join(examplesDir, name, 'protobase.config.ts')))

// Each example, which is also what a preset starts an app from, built as `dev` and `serve` build its admin API: with
// its own auth, so the startup checks that look at the auth instance, such as an owner field that must hold its user
// ids, refuse here instead of on an app's first start. Building the API reaches no database.
describe.each(examples)('the %s example', (name) => {
  beforeAll(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'a-secret-only-this-test-uses-0123456789')
    vi.stubEnv('DATABASE_URL', 'postgres://nobody@127.0.0.1:1/none')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('passes the startup checks with its own auth', async () => {
    const project = mergeConfig(((await importProjectFile(path.join(examplesDir, name, 'protobase.config.ts'))).default ?? {}) as ProjectConfig)
    expect(project.auth, 'every example signs in with Better Auth').toBeDefined()
    expect(() => projectAdmin({ ...project, authenticate: project.authenticate as Authenticator }, project.config ?? {}, {} as never)).not.toThrow()
  }, 60_000)
})
