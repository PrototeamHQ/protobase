import type { DBFieldAttribute } from '@better-auth/core/db'

// How a built-in module declares its tables, once, under internal names: each table's and column's internal name is
// also its default name in the database, and Better Auth's model and field name it holds.

/**
 * A column: the Better Auth field it holds, and, for a field Protobase adds itself rather than Better Auth or its
 * plugin, the field's attribute without its name, which the model fills in.
 */
export type ColumnDeclaration = { field: string; attribute?: Omit<DBFieldAttribute, 'fieldName'> }

/** A column of a field Better Auth or its plugin defines. */
export const field = <Field extends string>(name: Field) => ({ field: name })

/** A column of a field Protobase defines, with its attribute, whose type Better Auth infers the field's from. */
export const own = <Field extends string, const Attribute extends Omit<DBFieldAttribute, 'fieldName'>>(name: Field, attribute: Attribute) => ({ field: name, attribute })

/**
 * What an index of a table whose rows belong to an organization serves: lookups within one organization, which lead
 * with its `organization_id`, or across them, such as a lookup key or a secret, which stays unique app-wide.
 */
export type IndexScope = 'organization' | 'global'

type TableBase = {
  /** Better Auth's model the table holds; none for a table only Protobase reads, such as the record of migrations. */
  model?: string
  /** Each column but `id`, which keeps its name, by internal name. */
  columns: Record<string, ColumnDeclaration>
}

/**
 * A table: whether a row belongs to the whole app or to one organization, and the indexes Protobase makes, by
 * internal name, each starting with the table's internal name and `_`; each index of a table of an organization's
 * rows says what it serves.
 */
export type TableDeclaration = TableBase & ({ scope: 'global'; indexes?: string[] } | { scope: 'organization'; indexes?: Record<string, IndexScope> })

/** The indexes a table declares with what each serves: every index of a table of the whole app's rows serves it whole. */
export const indexScopes = (table: TableDeclaration): Record<string, IndexScope> =>
  table.scope === 'organization' ? (table.indexes ?? {}) : Object.fromEntries((table.indexes ?? []).map((index) => [index, 'global' as const]))

export type ModuleDeclaration = {
  id: string
  /** The modules whose tables this one's point at or add columns to. */
  requires: string[]
  tables: Record<string, TableDeclaration>
  /** The columns it adds to other modules' tables, by table and internal column name; a table of a module that is off gets none. */
  columns?: Record<string, Record<string, ColumnDeclaration>>
  /** The indexes it adds to other modules' tables, by table and internal index name, as `columns`. */
  indexes?: Record<string, Record<string, IndexScope>>
}
