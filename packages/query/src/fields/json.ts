import { sql, type Expression, type SqlBool } from 'kysely'
import type { Literal } from '@protobase/schema'

/** `field:value`: the json contains the scalar, as an array element, an equal value or (for text) an object key. */
export const jsonHas = (col: Expression<unknown>, value: Literal): Expression<SqlBool> => {
  switch (value.kind) {
    case 'string':
      return sql<SqlBool>`(jsonb_exists(${col}::jsonb, ${value.value}) or ${col}::jsonb @> to_jsonb(${value.value}::text))`
    case 'number':
      return sql<SqlBool>`${col}::jsonb @> to_jsonb(${value.raw}::numeric)`
    case 'boolean':
      return sql<SqlBool>`${col}::jsonb @> to_jsonb(${value.value}::boolean)`
    default:
      throw new Error(`Not implemented: json containment for ${value.kind} literals, the parser only produces strings, numbers and booleans`)
  }
}

/** `field:*`: a json value other than SQL NULL and JSON null. */
export const jsonPresent = (col: Expression<unknown>): Expression<SqlBool> =>
  sql<SqlBool>`(${col} is not null and ${col}::jsonb <> 'null'::jsonb)`
