import type postgres from 'postgres'

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

/**
 * The statements, run in order on one connection, whose third answers which of `names` the connected role may create
 * in its database, one row per name. It tries each in a transaction it rolls back, since only trying tells: a Supabase
 * style image lets a database owner create its allowlisted extensions, pg_cron only in the database it serves, and
 * Postgres alone only its trusted ones. A failure to create is the answer, so the function returns it instead.
 */
export const extensionProbe = (names: string[]) => [
  'BEGIN',
  `CREATE FUNCTION pg_temp.may_create_extension(name text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I CASCADE', name);
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END $$`,
  `SELECT name, pg_temp.may_create_extension(name) AS creatable FROM unnest(ARRAY[${names.map(literal).join(', ')}]::text[]) AS name ORDER BY 1`,
  'ROLLBACK',
]

/** Which of `names` the role at `sql` may create in the project's database. */
export const creatableExtensions = async (sql: postgres.Sql, names: string[]) => {
  const reserved = await sql.reserve()
  try {
    const [begin, define, probe, rollback] = extensionProbe(names)
    await reserved.unsafe(begin!)
    await reserved.unsafe(define!)
    const rows = await reserved.unsafe<{ name: string; creatable: boolean }[]>(probe!)
    await reserved.unsafe(rollback!)
    return new Set(rows.filter((row) => row.creatable).map((row) => row.name))
  } finally {
    reserved.release()
  }
}
