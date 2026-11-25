import type { Db } from '@protobase/query'
import type { ModuleInput, ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { functionComment, tablesFound, triggersFound } from './read-catalogue'
import { commentVersion, functionsSql, workflowsTriggers, workflowsVersion } from './schema-sql'
import { statusFunctionsSql, statusTriggers } from './status-sql'
import { workflowsTablesSql } from './workflows-tables-sql'

/**
 * The workflows schema as the database has it: step 1 once its tables are there and the run trigger's function names
 * version 28, the version step 1 freezes, and its functions at that version while every trigger is on its table, or
 * written again when one is not. Refuses another version, which no step records.
 */
const readWorkflows = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = names.schema!
  if (!(await tablesFound(db, schema, ['runs']))) return
  const version = commentVersion(await functionComment(db, schema, 'run_version'))
  if (version !== undefined && version > workflowsVersion) throw new Error(`The ${schema} schema is at version ${version}, newer than the ${workflowsVersion} this version of Protobase writes: upgrade Protobase`)
  if (version !== workflowsVersion || !(await tablesFound(db, schema, ['triggers']))) {
    throw new Error(
      `The ${schema} schema is at ${version === undefined ? 'a version' : `version ${version}`} no step of this version of Protobase records: bring it to version ${workflowsVersion} with \`protobase migration\` and \`protobase migrate\` of Protobase 0.14.2 first, then run this command again`,
    )
  }
  const functions = await triggersFound(db, schema, [...workflowsTriggers, ...statusTriggers])
  return { lastStep: 1, replaceables: functions ? { functions: workflowsVersion } : {}, names }
}

/**
 * The workflows, their versions, runs and triggers, in the schema `workflows` names (`names.schema`): the tables, and
 * the functions and triggers that number a workflow's versions, pin a run's and keep a workflow's status. Its tables are
 * never dropped.
 */
export const workflowsSchemaModule: SchemaModule = {
  label: 'the workflows schema',
  title: 'The workflows, their versions, runs and steps',
  steps: [{ step: 1, name: 'workflows', title: 'The tables of the workflows, their versions, runs and triggers, and their indexes', additive: true, sql: (names) => workflowsTablesSql(names.schema!) }],
  // Not marked compatible with an earlier version: before it had steps, every version needed the one it wrote.
  replaceables: [
    {
      name: 'functions',
      title: "The functions and triggers that number a workflow's versions, pin a run's and keep a workflow's status",
      version: workflowsVersion,
      compatibleFrom: workflowsVersion,
      sql: (names) => `${functionsSql(names.schema!)};\n\n${statusFunctionsSql(names.schema!)};`,
    },
  ],
  resourceReplaceables: [],
  read: readWorkflows,
}
