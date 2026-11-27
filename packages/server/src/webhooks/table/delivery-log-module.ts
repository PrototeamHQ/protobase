import type { Db } from '@protobase/query'
import { quoteIdent } from '../../changes/capture-sql'
import { hasIndexes } from '../../has-indexes'
import { relationFound } from '../../relation-found'
import type { ModuleInput, ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { deliveryLogIndexes, deliveryLogIndexesSql, deliveryLogSql } from './schema-sql'

/** The delivery log as the database has it: step 1 once it is there with every index. Refuses one without them, which no step records. */
const readDeliveryLog = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = names.schema!
  if (!(await relationFound(db, `${quoteIdent(schema)}."delivery_log"`))) return
  if (!(await hasIndexes(db, schema, 'delivery_log', deliveryLogIndexes))) {
    throw new Error(`The delivery log in schema "${schema}" lacks indexes no step of this version of Protobase records`)
  }
  return { lastStep: 1, replaceables: {}, names }
}

/**
 * The log of every try of the subscriptions' deliveries, with `deliveryLog`, in the webhooks schema (`names.schema`):
 * a module of its own, after the webhooks schema whose subscriptions it points at, so turning it on later writes it alone.
 */
export const webhookDeliveryLogModule: SchemaModule = {
  label: 'the webhook delivery log',
  title: "The log of every try of the webhook subscriptions' deliveries",
  steps: [{ step: 1, name: 'delivery_log', title: 'The delivery log and its indexes', additive: true, sql: (names) => `${deliveryLogSql(names.schema!)};\n${deliveryLogIndexesSql(names.schema!)};` }],
  replaceables: [],
  resourceReplaceables: [],
  read: readDeliveryLog,
}
