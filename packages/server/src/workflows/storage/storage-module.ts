import type { Db } from '@protobase/query'
import type { ModuleInput, ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { tablesFound, triggersFound } from '../read-catalogue'
import { storageFunctionsSql, storageTablesSql } from './storage-sql'

/** The storage configurations as the database has them: step 1 once the table is there, its trigger at version 1 while it is on it. */
const readStorage = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = names.schema!
  if (!(await tablesFound(db, schema, ['storage_configurations']))) return
  return { lastStep: 1, replaceables: (await triggersFound(db, schema, ['storage_configuration_updated'])) ? { functions: 1 } : {}, names }
}

/**
 * The storage configurations workflows store files in, with `storage`, in the workflows schema (`names.schema`): a
 * module of its own, after the workflows schema, so turning `storage` on later writes it alone.
 */
export const workflowStorageModule: SchemaModule = {
  label: "the workflows' storage configurations",
  title: 'The storage configurations workflows store files in',
  // Step 1 calls `storageTablesSql`: frozen once released, as every step is.
  steps: [{ step: 1, name: 'storage_configurations', title: 'The storage configurations table and its indexes', additive: true, sql: (names) => `${storageTablesSql(names.schema!)};` }],
  replaceables: [{ name: 'functions', title: 'The trigger that gives a written storage configuration its new updated_at', version: 1, compatibleFrom: 1, sql: (names) => `${storageFunctionsSql(names.schema!)};` }],
  resourceReplaceables: [],
  read: readStorage,
}
