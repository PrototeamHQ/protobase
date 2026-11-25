import type { Db } from '@protobase/query'
import { hasIndexes } from '../../has-indexes'
import { relationFound } from '../../relation-found'
import type { ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { feedbackIndexes, feedbackTableSql } from './feedback-schema'
import { feedbackSchema, feedbackTable } from './feedback-store'

/**
 * The feedback table as the database has it: step 1 once it is there with every index. Refuses one without them, such
 * as one written before a complaint could leave its recipient out, which no step records.
 */
const readMailFeedback = async (db: Db): Promise<ModuleModel | undefined> => {
  if (!(await relationFound(db, feedbackTable))) return
  if (!(await hasIndexes(db, feedbackSchema, 'feedback', feedbackIndexes.map(([name]) => name)))) {
    throw new Error(`The table ${feedbackTable} of mailFeedback lacks indexes no step of this version of Protobase records: bring it there with \`protobase migration\` and \`protobase migrate\` of Protobase 0.14.2 first, then run this command again`)
  }
  return { lastStep: 1, replaceables: {} }
}

/**
 * The table of the bounces and complaints of the mail the app sends, with `mailFeedback`: before the change capture,
 * whose triggers capture its events. Never dropped.
 */
export const mailFeedbackModule: SchemaModule = {
  label: 'the mail feedback table',
  title: 'The table of the bounces and complaints of the mail the app sends',
  steps: [{ step: 1, name: 'feedback', title: 'The feedback table and its indexes', additive: true, sql: () => feedbackTableSql() }],
  replaceables: [],
  resourceReplaceables: [],
  read: readMailFeedback,
}
