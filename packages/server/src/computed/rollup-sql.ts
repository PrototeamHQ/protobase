import type { FieldModel, ResourceModel } from '@protobase/schema'
import { identifier, quoteIdent } from '../changes/capture-sql'
import { columnType } from './column-sql'

/** The schema of the functions that keep rollups. */
export const rollupsSchema = 'rollups'

/** A rollup with what its SQL names: the tables, as the catalogue qualifies them, and the columns. */
export type RollupTarget = {
  model: ResourceModel
  field: FieldModel
  /** The resource whose records it rolls up. */
  from: ResourceModel
  /** The table of the rollup's resource. */
  table: string
  /** The table of `from`. */
  fromTable: string
}

/** The function that keeps one rollup, named for its resource's table and column. */
export const rollupFunctionName = ({ model, field }: RollupTarget) =>
  identifier([model.table.schema, model.table.name, field.column].filter(Boolean).join('_'))

/** The trigger on `from`'s table that calls it. */
export const rollupTriggerName = (target: RollupTarget) => identifier(`${rollupFunctionName(target)}_rollup`)

const functionSql = (target: RollupTarget) => `${quoteIdent(rollupsSchema)}.${quoteIdent(rollupFunctionName(target))}`

const viaColumn = ({ from, field }: RollupTarget) => quoteIdent(from.fields[field.rollup!.via]!.column)

const keyColumn = ({ model }: RollupTarget) => quoteIdent(model.fields[model.primaryKey[0]!]!.column)

// The aggregate over `c`, the records of `from`: `count` and `sum` are 0 without records, the others empty.
const aggregateSql = ({ from, field }: RollupTarget) => {
  const { fn, field: name } = field.rollup!
  const value = name === undefined ? '*' : `c.${quoteIdent(from.fields[name]!.column)}`
  if (fn === 'count') return `count(${value})`
  if (fn === 'sum') return `coalesce(sum(${value}), 0)`
  return `${fn}(${value})`
}

const liveRecords = ({ from }: RollupTarget) => (from.softDelete ? ` and c.${quoteIdent(from.fields[from.softDelete]!.column)} is null` : '')

// Sets the rollup of the records `where` picks, `p`, from their records of `from`.
const refreshSql = (target: RollupTarget, where: string) =>
  `update ${target.table} as p set ${quoteIdent(target.field.column)} = (select ${aggregateSql(target)} from ${target.fromTable} as c where c.${viaColumn(target)} = p.${keyColumn(target)}${liveRecords(target)}) where ${where}`

/**
 * The body of a rollup's function: after a record of `from` is written, it sets the rollup of the record it points at,
 * and of the one it pointed at before when the write moved it.
 */
export const rollupBody = (target: RollupTarget) => {
  const via = viaColumn(target)
  const key = keyColumn(target)
  return `
begin
  if TG_OP <> 'INSERT' then
    ${refreshSql(target, `p.${key} = OLD.${via}`)};
  end if;
  if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and NEW.${via} is distinct from OLD.${via}) then
    ${refreshSql(target, `p.${key} = NEW.${via}`)};
  end if;
  return null;
end
`
}

/**
 * The function runs as its owner, with a fixed search path and the tables qualified: a writer of `from` needs no rights
 * on the rollup's table.
 */
export const rollupFunctionSql = (target: RollupTarget) =>
  `create or replace function ${functionSql(target)}() returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $rollup$${rollupBody(target)}$rollup$`

// The columns a rollup reads of `from`: an update of any other leaves it as it is.
const readColumns = ({ from, field }: RollupTarget) =>
  [field.rollup!.via, field.rollup!.field, from.softDelete].filter((name) => name !== undefined).map((name) => quoteIdent(from.fields[name]!.column))

/** A rollup's trigger: after inserts, deletes and updates of the columns it reads, for each row. */
export const rollupTriggerSql = (target: RollupTarget) =>
  `create trigger ${quoteIdent(rollupTriggerName(target))} after insert or delete or update of ${readColumns(target).join(', ')} on ${target.fromTable} for each row execute function ${functionSql(target)}()`

export const dropRollupTriggerSql = (name: string, table: string) => `drop trigger if exists ${quoteIdent(name)} on ${table}`

export const dropRollupFunctionSql = (name: string) => `drop function if exists ${quoteIdent(rollupsSchema)}.${quoteIdent(name)}() cascade`

/** Sets every record's rollup from what `from` has now. */
export const backfillSql = (target: RollupTarget) => refreshSql(target, 'true')

/** The statement that adds the rollup's column, empty until the backfill sets it. */
export const addRollupColumnSql = ({ table, field }: RollupTarget) => `alter table ${table} add column ${quoteIdent(field.column)} ${columnType(field)}`
