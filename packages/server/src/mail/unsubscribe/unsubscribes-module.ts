import type { Db } from '@protobase/query'
import { hasIndexes } from '../../has-indexes'
import { relationFound } from '../../relation-found'
import type { ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { unsubscribesIndexes, unsubscribesTableSql } from './unsubscribe-schema'
import { unsubscribesSchema, unsubscribesTable } from './unsubscribe-store'

/** The opt-outs table as the database has it: step 1 once it is there with every index. Refuses one without them, which no step records. */
const readUnsubscribes = async (db: Db): Promise<ModuleModel | undefined> => {
  if (!(await relationFound(db, unsubscribesTable))) return
  if (!(await hasIndexes(db, unsubscribesSchema, 'unsubscribes', unsubscribesIndexes.map(([name]) => name)))) {
    throw new Error(`The opt-outs table ${unsubscribesTable} lacks indexes no step of this version of Protobase records`)
  }
  return { lastStep: 1, replaceables: {} }
}

/** The table of who unsubscribed from which topic of the bulk mail, with `unsubscribe`. Never dropped. */
export const unsubscribesModule: SchemaModule = {
  label: 'the opt-outs table',
  title: 'The table of who unsubscribed from which topic of the bulk mail',
  steps: [{ step: 1, name: 'unsubscribes', title: 'The opt-outs table and its indexes', additive: true, sql: () => unsubscribesTableSql() }],
  replaceables: [],
  resourceReplaceables: [],
  read: readUnsubscribes,
}
