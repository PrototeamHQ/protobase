import { sql } from 'kysely'
import { generatedName } from '../../names/identifier-length'
import type { ModuleId } from '../../names/modules'
import { ddl } from '../ddl'
import { statementsSql } from '../migration-sql'
import type { StoreNames } from '../store-names'
import { stillWrittenColumns } from './module-switches'

// What an archived module turned on again needs beyond its steps: the columns it left in use while off kept their
// values and their steps, but the archive took the foreign key each had to its tables, which now point at the new ones.

/**
 * The statements that give back to each column `module` left in use on the tables of `existing` the foreign key to its
 * table, once that table is made again, where the column has none: not checked against the rows there, whose values
 * may name a row the archive holds, such as a token's organization, which then no longer works. As SQL text after a
 * comment; `undefined` when it leaves none.
 */
export const restoredKeysSql = (names: StoreNames, module: ModuleId, existing: readonly ModuleId[]) => {
  const statements = stillWrittenColumns(names, module, existing).map(
    ({ table, column, references }) => ddl`do $restore$
begin
  if not exists (select from pg_constraint where conrelid = ${sql.lit(String(table))}::regclass and contype = 'f' and confrelid = ${sql.lit(String(references))}::regclass) then
    alter table ${table} add constraint ${sql.id(generatedName(`${table.name}_${column.name}_fkey`))} foreign key (${column}) references ${references} (id) on delete cascade not valid;
  end if;
end
$restore$`,
  )
  if (statements.length === 0) return
  return `-- ${module} on: the columns it left in use while off point at its tables again where an archive took their foreign key; a value the archive holds no longer names a row.\n${statementsSql(statements)}`
}
