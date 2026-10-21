import type { RawBuilder } from 'kysely'
import type { EmbedParams } from './embed-params'
import { findRelationship, type Relationship } from './find-relationship'
import type { ForeignKey } from './foreign-keys'
import { embedKey, type ColumnItem, type SelectItem } from './parse-select'

/**
 * An embed resolved to its relationship: the table its rows come from, the name they go by in SQL (`profiles_1`, unique
 * in the query), the name they go by in a row, and the filters, order and range of its parameters. A to-one embed is
 * an object or null, a to-many one an array.
 */
export type Embed = {
  kind: 'embed'
  key: string
  table: string
  from: RawBuilder<unknown>
  alias: string
  relationship: Relationship
  toOne: boolean
  inner: boolean
  /** Whether the row shows it: an embed of nothing (`comments()`) only filters, with `inner`. */
  shown: boolean
  shape: ShapeItem[]
  params: EmbedParams
}

/** An item of a read's select list, its embeds resolved. */
export type ShapeItem = ColumnItem | Embed

export type ShapeContext = {
  foreignKeys: readonly ForeignKey[]
  /** The table `/api/sb/rest/v1` serves under `name`, as SQL; undefined when it serves none, which nothing relates to. */
  served: (name: string) => RawBuilder<unknown> | undefined
  embedded: ReadonlyMap<string, EmbedParams>
}

const noParams: EmbedParams = { filters: [], order: [], range: { offset: 0 } }

/**
 * Resolves the embeds of `select`, read from rows of `source`, to the relationships they go through, depth first:
 * PGRST200 or PGRST201 for an embed without one or with several.
 */
export const resolveShape = (context: ShapeContext, source: string, select: readonly SelectItem[]): ShapeItem[] => {
  let count = 0
  const resolve = (table: string, items: readonly SelectItem[], prefix: string): ShapeItem[] =>
    items.map((item) => {
      if (item.kind !== 'embed') return item
      const from = context.served(item.name)
      const relationship = findRelationship(from ? context.foreignKeys : [], table, item.name, item.hint)
      const path = prefix + embedKey(item)
      const alias = `${item.name}_${++count}`
      return {
        kind: 'embed',
        key: embedKey(item),
        table: item.name,
        from: from!,
        alias,
        relationship,
        toOne: relationship.cardinality !== 'one-to-many',
        inner: item.inner,
        shown: item.select.length > 0,
        shape: resolve(item.name, item.select, `${path}.`),
        params: context.embedded.get(path) ?? noParams,
      }
    })
  return resolve(source, select, '')
}

/** Every embed of the shape, nested ones included. */
export const embedsOf = (shape: readonly ShapeItem[]): Embed[] =>
  shape.flatMap((item) => (item.kind === 'embed' ? [item, ...embedsOf(item.shape)] : []))

/** The name of the lateral subquery an embed's JSON comes from, as `body`. */
export const lateralName = (embed: Embed) => `pgrst_${embed.alias}`
