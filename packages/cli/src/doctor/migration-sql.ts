import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { migrationsDir } from '../migration/migrate-project'

type TableName = { schema?: string; name: string }

/**
 * SQL as doctor matches it: without comments, each identifier as Postgres keeps it (a quoted one as written, an unquoted
 * one in lower case), and every run of whitespace one space.
 */
export const normalisedSql = (text: string) =>
  text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"((?:[^"]|"")*)"|[A-Za-z_][A-Za-z0-9_$]*/g, (word, quoted: string | undefined) => (quoted === undefined ? word.toLowerCase() : quoted.replaceAll('""', '"')))
    .replace(/\s+/g, ' ')

/** The project's db/migrations/*.sql in the order they apply, as one normalised text; `undefined` without the folder. */
export const readMigrationSql = async (projectDir: string) => {
  const dir = path.join(projectDir, migrationsDir)
  if (!existsSync(dir)) return
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const texts = await Promise.all(files.map((file) => readFile(path.join(dir, file), 'utf8')))
  return normalisedSql(texts.join(';\n'))
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A table in `public` may be named without its schema, which the default search path finds.
const qualified = ({ schema, name }: TableName) => (schema && schema !== 'public' ? `${escape(schema)}\\.${escape(name)}` : `(?:public\\.)?${escape(name)}`)

const end = '(?=[\\s(;]|$)'

/** Whether `sql` creates the table. */
export const createsTable = (sql: string, table: TableName) => new RegExp(`\\bcreate (?:unlogged )?table (?:if not exists )?${qualified(table)}${end}`).test(sql)

/** Whether `sql` creates a trigger of that name on the table. */
export const createsTrigger = (sql: string, trigger: string, table: TableName) =>
  new RegExp(`\\bcreate (?:or replace )?(?:constraint )?trigger ${escape(trigger)} [^;]*?\\bon ${qualified(table)}${end}`).test(sql)

/** Whether `sql` creates the function in the schema. */
export const createsFunction = (sql: string, schema: string, name: string) => new RegExp(`\\bcreate (?:or replace )?function ${qualified({ schema, name })} ?\\(`).test(sql)
