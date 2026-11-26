import type { Db } from '@protobase/query'
import type { ModuleInput, ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { tablesFound, triggersFound } from '../read-catalogue'
import { customStepsFunctionsSql, customStepsTables, customStepsTablesSql } from './custom-steps-sql'
import { runnersFunctionsSql, runnersTables, runnersTablesSql } from './runners-sql'

const triggers = ['custom_step_version', 'runner_written', 'custom_step_job_answered', 'custom_step_run_ended']

/**
 * The custom steps' tables as the database has them: step 1 once every one is there, their triggers at version 1 while
 * each is on its table. Refuses some of the tables without the others, which no step records.
 */
const readCustomSteps = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = names.schema!
  const tables = [...customStepsTables, ...runnersTables]
  if (!(await tablesFound(db, schema, tables.slice(0, 1)))) return
  if (!(await tablesFound(db, schema, tables))) {
    throw new Error(`The custom steps' tables in schema "${schema}" are not all there, which no step of this version of Protobase records`)
  }
  return { lastStep: 1, replaceables: (await triggersFound(db, schema, triggers)) ? { functions: 1 } : {}, names }
}

/**
 * The custom steps, their versions, runners and jobs, with `customSteps`, in the workflows schema (`names.schema`): a
 * module of its own, after the workflows schema, whose runs and task tokens its triggers are on.
 */
export const workflowCustomStepsModule: SchemaModule = {
  label: "the workflows' custom steps",
  title: "The custom steps, their versions, runners and jobs",
  // Step 1 calls `customStepsTablesSql` and `runnersTablesSql`: frozen once released, as every step is.
  steps: [
    { step: 1, name: 'custom_steps', title: 'The tables of the custom steps, their versions, runners and jobs, and their indexes', additive: true, sql: (names) => `${customStepsTablesSql(names.schema!)};\n\n${runnersTablesSql(names.schema!)};` },
  ],
  replaceables: [
    {
      name: 'functions',
      title: "The triggers that number a custom step's versions and keep its runners and jobs",
      version: 1,
      compatibleFrom: 1,
      sql: (names) => `${customStepsFunctionsSql(names.schema!)};\n\n${runnersFunctionsSql(names.schema!)};`,
    },
  ],
  resourceReplaceables: [],
  read: readCustomSteps,
}
