import { userTableResources, userTablesSchema } from '@protobase/server/config-exports'
import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { readOnlyDb } from '../db/read-only-db'
import type { EjectedTable } from './eject-files'
import { readTableDdl, type TableDdl } from './table-ddl'

// Why the server serves no table of that name: the problem of its definition, or that none has it.
const notServed = (name: string, problems: string[]) =>
  problems.find((problem) => problem.startsWith(`The user table "${name}" `)) ?? `No table users added is named "${name}"`

/**
 * Each named table users added as the server serves it, with the constraints and indexes of its table, read from the
 * database at `url` in read-only sessions. A name the server serves no table of stops it, with why.
 */
export const readEjected = async (url: string, names: readonly string[]) => {
  const sql = connect(url)
  const db = readOnlyDb(url)
  try {
    const [relations, served] = await Promise.all([introspect(sql), userTableResources(db)])
    const tables: EjectedTable[] = names.map((name) => {
      const definition = served.definitions.find((each) => each.name === name)
      if (!definition) throw new Error(notServed(name, served.problems))
      // A served definition has its table, as its check proves.
      const table = relations.find((each) => each.schema === userTablesSchema && each.name === name)!
      const model = served.resources.map((resource) => resource.toModel()).find((each) => each.name === name)!
      return { table, definition, model }
    })
    const read: Array<{ ejected: EjectedTable; ddl: TableDdl }> = []
    for (const ejected of tables) read.push({ ejected, ddl: await readTableDdl(sql, ejected.table) })
    return read
  } finally {
    await Promise.all([sql.end(), db.destroy()])
  }
}
