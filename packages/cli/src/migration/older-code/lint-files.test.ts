import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { headerText, type Header } from '../snapshot/header'
import { readMigrationFiles, type MigrationFile } from '../snapshot/migration-files'
import { fileWarnings, lintFiles } from './lint-files'

const header = (id: string, kind: Partial<Header> = {}): Header => ({ id, version: '1.0.0', steps: {}, model: 'hash', organizationsEverOn: false, custom: false, additive: false, breaksOlderCode: false, ...kind })

const file = (number: number, id: string, statements: string, kind: Partial<Header> = {}): MigrationFile => {
  const text = `${headerText(header(id, kind))}\n${statements}`
  return { file: `00${number}_part.sql`, number, text, header: header(id, kind) }
}

describe("the lint of a project's migrations", () => {
  it('takes a contract mark in a file Protobase wrote only when it names a migration before it', async () => {
    const retired = file(1, 'retired-id', 'alter table orders alter column code drop not null;\n')
    expect(await lintFiles([retired, file(2, 'contract-id', '-- protobase:contract retired-id\nalter table orders drop column code;\n')])).toEqual([])
    expect(await lintFiles([retired, file(2, 'contract-id', '-- protobase:contract later-id\nalter table orders drop column code;\n')])).toEqual([
      '002_part.sql has `-- protobase:contract later-id`, which names no migration before it',
    ])
  })

  it('warns of a statement that locks reads, and of one in a file Protobase wrote that takes from older code unmarked', { timeout: 30_000 }, () => {
    const files = [
      file(1, 'a', 'alter table orders alter column code set not null;\n'),
      file(2, 'b', '-- protobase:contract a\nalter table orders drop column code;\n'),
      file(3, 'c', 'alter table orders drop column note;\n', { custom: true, breaksOlderCode: true }),
    ]
    expect(fileWarnings(files)).toEqual([
      expect.stringMatching(/^001_part\.sql line 5 holds a lock that blocks reads while it scans or rewrites the table \(adding-not-nullable-field\): /),
      expect.stringMatching(/^001_part\.sql line 5 takes from older code without `-- protobase:contract` \(adding-not-nullable-field\): /),
    ])
  })

  it("finds nothing in the test apps' migrations", { timeout: 60_000 }, async () => {
    for (const app of ['automations', 'erp', 'property-portal', 'real-estate', 'scratch']) {
      const files = await readMigrationFiles(path.join(import.meta.dirname, '../../../../../tests/apps', app, 'db/migrations'))
      expect([app, await lintFiles(files), fileWarnings(files)]).toEqual([app, [], []])
    }
  })
})
