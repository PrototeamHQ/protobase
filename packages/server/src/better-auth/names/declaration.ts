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

export type TableDeclaration = {
  /** Better Auth's model the table holds; none for a table only Protobase reads, such as the record of migrations. */
  model?: string
  /** Whether a row belongs to one organization or to the whole app. */
  scope: 'global' | 'organization'
  /** Each column but `id`, which keeps its name, by internal name. */
  columns: Record<string, ColumnDeclaration>
  /** The indexes Protobase makes, by internal name, each starting with the table's internal name and `_`. */
  indexes?: string[]
}

export type ModuleDeclaration = {
  id: string
  /** The modules whose tables this one's point at or add columns to. */
  requires: string[]
  tables: Record<string, TableDeclaration>
  /** The columns it adds to other modules' tables, by table and internal column name; a table of a module that is off gets none. */
  columns?: Record<string, Record<string, ColumnDeclaration>>
}
