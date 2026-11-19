import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runDoctorWithoutDatabase } from './run-without-database'

// Building the app's sign-in gives its pool, which connects nothing until a query.
vi.unmock('pg')

const projectDir = path.join(import.meta.dirname, '..', '..', '..', '..', 'tests', 'apps', 'real-estate')

describe('doctor without a database', () => {
  it('passes an example from its config and migrations alone, and lists the checks it skipped', async () => {
    let text = ''
    const { errors, skipped } = await runDoctorWithoutDatabase({ configDir: path.join(projectDir, 'config'), projectDir }, (chunk) => (text += chunk))
    expect(errors).toBe(0)
    expect(skipped).toEqual([
      'the tables, columns, types and keys of the resources, and the indexes their reads need',
      "the server's startup checks of the database's schemas, but for the change capture of the resources whose table a migration creates",
    ])
    expect(text).toContain(`Skipped without a database:\n  ${skipped[0]}\n`)
    expect(text).toMatch(/Checked 19 resources, and the server's build of the app, without a database: 0 errors, 0 warnings\.\n$/)
  }, 60_000)
})
