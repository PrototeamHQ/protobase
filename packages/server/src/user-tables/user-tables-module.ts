import type { SchemaModule } from '../schema-modules/schema-module'
import { readUserTablesSchema, userTablesCurrent } from './schema'
import { definitionsSchema, userTablesSchema } from './names'
import { fieldsPositionIndexSql, fieldsSql, nameIndexesSql, schemasSql, tablesSql } from './schema-sql'

/**
 * pg_trgm, the definitions schema with its `tables` and `fields`, and the schema the tables users add live in. Those
 * tables are data, not schema: admins create them while the app serves, and no migration writes them. Never dropped.
 */
export const userTablesModule: SchemaModule = {
  label: `the ${definitionsSchema} and ${userTablesSchema} schemas of user tables`,
  title: 'The schemas of the tables users add and of their definitions, and pg_trgm',
  steps: [
    {
      step: 1,
      name: 'user_tables',
      title: 'The definitions of user tables and the schema of the tables themselves',
      additive: true,
      sql: () => `${[...schemasSql(), tablesSql(), ...nameIndexesSql(), fieldsSql(), fieldsPositionIndexSql()].join(';\n\n')};`,
    },
  ],
  replaceables: [],
  resourceReplaceables: [],
  // Step 1 once every part is there; a definitions table of an earlier shape is refused, as no step records it.
  read: async (db) => {
    const found = await readUserTablesSchema(db)
    if (!found.tables) return
    if (!userTablesCurrent(found)) {
      throw new Error(`The ${definitionsSchema} schema lacks the default of a definition's version, a definition's organization, the position index of its fields, the ${userTablesSchema} schema or pg_trgm, which no step of this version of Protobase records`)
    }
    return { lastStep: 1, replaceables: {} }
  },
}
