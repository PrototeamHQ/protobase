import type { ResourceModel } from '@protobase/schema'
import { hasUniqueIndexOn } from '../db/keys'
import { tableKey, type DbTable } from '../db/model'
import type { Issue } from './check'

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`

/**
 * A lookup field that reads the one record of another resource pointing at each record needs a unique index on that
 * relation: without one a record may have several, and every read of the field fails.
 */
export const lookupIssues = (model: ResourceModel, models: ResourceModel[], tables: DbTable[]): Issue[] =>
  Object.values(model.lookups ?? {}).flatMap((field): Issue[] => {
    const { from, via } = field.lookup!
    const linked = from === undefined ? undefined : models.find((each) => each.name === from)
    const column = linked && Object.hasOwn(linked.fields, via) ? linked.fields[via]!.column : undefined
    const table = linked && tables.find((each) => each.schema === (linked.table.schema ?? 'public') && each.name === linked.table.name)
    if (!column || !table || table.kind === 'view' || hasUniqueIndexOn(table, [column])) return []
    return [{
      severity: 'error',
      resource: model.name,
      message: `${field.name}: looks up the one ${from} record whose "${via}" points at each record, but no unique index on ${tableKey(table)} (${column}) makes it one, so a read fails once a record has two`,
      suggestion: `create unique index on ${quoteIdent(table.schema)}.${quoteIdent(table.name)} (${quoteIdent(column)});`,
    }]
  })
