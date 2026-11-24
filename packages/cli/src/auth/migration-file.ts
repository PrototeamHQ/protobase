const numbered = /^(\d+)_.*\.sql$/
const namePart = /^[a-z0-9][a-z0-9_-]*$/

/**
 * The name of the next migration in a folder holding `files`: one past the highest number, as wide as the widest
 * (`009_…` after `008_…`; three digits in an empty folder), then `name`.
 */
export const nextMigrationName = (files: string[], name: string) => {
  if (!namePart.test(name)) throw new Error(`Invalid migration name "${name}": use lowercase letters, digits, "_" or "-"`)
  const numbers = files.map((file) => numbered.exec(file)?.[1]).filter((found) => found !== undefined)
  const next = Math.max(0, ...numbers.map(Number)) + 1
  const width = Math.max(3, ...numbers.map((found) => found.length))
  return `${String(next).padStart(width, '0')}_${name}.sql`
}

/** What an auth schema migration holds, its first line, whichever command wrote it. */
export const authMigrationTitle = 'The auth schema changes this version of Protobase needs'

/** The file's contents: what wrote it, `writer`, and why, then Better Auth's statements, one per paragraph. */
export const migrationText = (sql: string, writer = 'protobase auth migration') =>
  `-- ${authMigrationTitle}, written by \`${writer}\`.\n-- Applied with the project's other migrations; edit or remove statements the project handles differently.\n\n${sql}\n`

/** The text of the file that starts the snapshot of a project whose store is current already: no statements. */
export const currentStoreText = (writer = 'protobase auth migration') =>
  `-- ${authMigrationTitle}, written by \`${writer}\`: none, the store has every step of this version already.\n-- It starts protobase.snapshot.json from the project's earlier migrations.\n`

/** The text of the file that only records a store that is current already in the database's record of migrations. */
export const recordOnlyText = (writer = 'protobase auth migration') =>
  `-- ${authMigrationTitle}, written by \`${writer}\`: none, the store has every step of this version already.\n-- It records the store in the database's record of migrations, which the server reads at startup.\n`
