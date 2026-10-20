import type { ForeignKey } from './foreign-keys'
import { restError } from './rest-error'

export type Cardinality = 'many-to-one' | 'one-to-many' | 'one-to-one'

/**
 * How rows of a source table relate to rows of a target table: through a foreign key, in either direction, with each
 * pair of a source column and the target column it equals.
 */
export type Relationship = { foreignKey: ForeignKey; cardinality: Cardinality; join: { source: string; target: string }[] }

const pairs = (sources: readonly string[], targets: readonly string[]) => sources.map((source, i) => ({ source, target: targets[i]! }))

/** The relationships from `source` to `target`: its foreign keys to `target`, and `target`'s foreign keys to it. */
const relationshipsBetween = (keys: readonly ForeignKey[], source: string, target: string): Relationship[] => [
  ...keys.filter((key) => key.table === source && key.foreignTable === target).map((key): Relationship => ({
    foreignKey: key,
    cardinality: key.unique ? 'one-to-one' : 'many-to-one',
    join: pairs(key.columns, key.foreignColumns),
  })),
  ...keys.filter((key) => key.foreignTable === source && key.table === target).map((key): Relationship => ({
    foreignKey: key,
    cardinality: key.unique ? 'one-to-one' : 'one-to-many',
    join: pairs(key.foreignColumns, key.columns),
  })),
]

// A hint names the foreign key, or the one column of a single-column one on either side.
const matchesHint = (relationship: Relationship, hint: string) => {
  const { name, columns, foreignColumns } = relationship.foreignKey
  return name === hint || (columns.length === 1 && (columns[0] === hint || foreignColumns[0] === hint))
}

const columnList = (table: string, columns: readonly string[]) => `${table}(${columns.join(', ')})`

const ambiguity = (source: string, target: string, found: readonly Relationship[]) =>
  restError(
    300,
    'PGRST201',
    `Could not embed because more than one relationship was found for '${source}' and '${target}'`,
    found.map((one) => ({
      cardinality: one.cardinality,
      embedding: `${source} with ${target}`,
      relationship: `${one.foreignKey.name} using ${columnList(source, one.join.map((pair) => pair.source))} and ${columnList(target, one.join.map((pair) => pair.target))}`,
    })),
    `Try changing '${target}' to one of the following: ${found.map((one) => `'${target}!${one.foreignKey.name}'`).join(', ')}. Find the desired relationship in the 'details' key.`,
  )

/**
 * The one relationship an embed of `target` in rows of `source` goes through, narrowed by its hint: PGRST200 when
 * there is none, PGRST201 when several remain.
 */
export const findRelationship = (keys: readonly ForeignKey[], source: string, target: string, hint?: string) => {
  const found = relationshipsBetween(keys, source, target).filter((one) => hint === undefined || matchesHint(one, hint))
  if (found.length === 1) return found[0]!
  if (found.length > 1) throw ambiguity(source, target, found)
  const using = hint === undefined ? '' : ` using the hint '${hint}'`
  throw restError(
    400,
    'PGRST200',
    `Could not find a relationship between '${source}' and '${target}' in the schema cache`,
    `Searched for a foreign key relationship between '${source}' and '${target}'${using} in the schema 'public', but no matches were found.`,
  )
}
