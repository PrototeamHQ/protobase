import type { Db } from '@protobase/query'
import { hasIndexes } from '../has-indexes'
import { relationFound } from '../relation-found'
import type { ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { commentsIndexes, commentsTable, commentsTableSql } from './comments-sql'

/** The comments table as the database has it: step 1 once it is there with every index. Refuses one without them, which no step records. */
const readComments = async (db: Db): Promise<ModuleModel | undefined> => {
  if (!(await relationFound(db, commentsTable))) return
  if (!(await hasIndexes(db, 'comments', 'comments', commentsIndexes.map(([name]) => name)))) {
    throw new Error(`The comments table ${commentsTable} lacks indexes no step of this version of Protobase records`)
  }
  return { lastStep: 1, replaceables: {} }
}

/** The comments table of the resources with `.comments()`, in a `comments` schema of its own. Never dropped. */
export const commentsModule: SchemaModule = {
  label: 'the comments table',
  title: 'The comments table of the resources with comments',
  steps: [{ step: 1, name: 'comments', title: 'The comments table and its indexes', additive: true, sql: () => `create schema if not exists "comments";\n${commentsTableSql()};` }],
  replaceables: [],
  resourceReplaceables: [],
  read: readComments,
}
