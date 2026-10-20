/** A table the data dump fills, with how many rows the source had when it was dumped. */
export type DumpedTable = { schema: string; table: string; rows: number }

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`

export const qualified = (table: { schema: string; table: string }) => `${identifier(table.schema)}.${identifier(table.table)}`

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

/** Fails the transaction when a table holds other than the source's number of rows. */
const checkRows = (table: DumpedTable) =>
  `DO $$ DECLARE found bigint; BEGIN SELECT count(*) INTO found FROM ${qualified(table)}; IF found <> ${table.rows} THEN RAISE EXCEPTION 'table %.% has % rows after the load, the source had ${table.rows}', ${literal(table.schema)}, ${literal(table.table)}, found; END IF; END $$;\n`

/**
 * The psql script that loads the data dump at `dataFile` into `tables`, for `psql --single-transaction`: the app's
 * triggers are off while it loads, so a sign-up trigger on auth.users does not run again for users who already have
 * their rows, then back on; every table's rows are counted against the source's before the transaction commits.
 */
export const loadScript = (dataFile: string, tables: DumpedTable[]) =>
  [
    ...tables.map((table) => `ALTER TABLE ${qualified(table)} DISABLE TRIGGER USER;\n`),
    `\\i ${literal(dataFile)}\n`,
    ...tables.map((table) => `ALTER TABLE ${qualified(table)} ENABLE TRIGGER USER;\n`),
    ...tables.map(checkRows),
  ].join('')
