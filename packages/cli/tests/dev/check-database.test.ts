import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDatabase } from '../../src/dev/check-database'

const project = (scripts: Record<string, string>) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'protobase-check-database-'))
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'shop', scripts }))
  return dir
}

describe('checkDatabase', () => {
  it('names the problem and the way to start the project database', async () => {
    await expect(checkDatabase('postgres://u:p@127.0.0.1:1/db', project({ 'db:up': 'docker compose up -d' }))).rejects.toThrow(
      /Cannot reach the database at 127\.0\.0\.1:1\/db: the connection was refused.*Start it with the project's db:up script/s,
    )
  })

  it('names only the problem when the project cannot start its database', async () => {
    await expect(checkDatabase('postgres://u:p@127.0.0.1:1/db', project({}))).rejects.toThrow(/^(?![\s\S]*db:up)Cannot reach the database/)
  })
})
