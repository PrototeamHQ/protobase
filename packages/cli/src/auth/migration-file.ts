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

/** The file's contents: what wrote it and why, then Better Auth's statements, one per paragraph. */
export const migrationText = (sql: string) =>
  `-- The auth schema changes this version of Protobase needs, written by \`protobase auth migration\`.\n-- Applied with the project's other migrations; edit or remove statements the project handles differently.\n\n${sql}\n`
