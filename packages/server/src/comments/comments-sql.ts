import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { migrationCommand } from '../changes/capture-schema'
import { hasIndexes } from '../has-indexes'

/** The table the comments of every resource with `.comments()` are kept in, in a schema of its own. */
export const commentsTable = '"comments"."comments"'

/** An index for each read of the comments: the record pages', the admin list's filters, by name. */
const commentsIndexes = [
  ['comments_record', '"resource", "record_key", "id"'],
  ['comments_tenant', '"tenant_id", "id"'],
  ['comments_author', '"author_id", "id"'],
  ['comments_created_at', '"created_at"'],
  ['comments_record_key', '"record_key"'],
] as const

/**
 * A row per comment: the record it is on by resource and encoded key, its tenant, its author and the user ids it
 * mentions (`[]` for none). Every column the admin list filters on has an index.
 */
export const commentsTableSql = () => `create table if not exists ${commentsTable} (
  "id" bigint generated always as identity primary key,
  "resource" text not null,
  "record_key" text not null,
  "tenant_id" text,
  "author_id" text not null,
  "body" text not null,
  "mentions" jsonb not null,
  "created_at" timestamptz not null default now()
);
${commentsIndexes.map(([name, columns]) => `create index if not exists "${name}" on ${commentsTable} (${columns})`).join(';\n')}`

// Only reads the catalogue.
const hasCommentsTable = async (db: Db) =>
  (await sql<{ found: boolean }>`select to_regclass('comments.comments') is not null as found`.execute(db)).rows[0]!.found &&
  (await hasIndexes(db, 'comments', 'comments', commentsIndexes.map(([name]) => name)))

/**
 * The SQL that adds the `comments` schema and its table, or the indexes it lacks, `undefined` when it has them all. The
 * table is never dropped.
 */
export const commentsMigration = async (db: Db) => {
  if (await hasCommentsTable(db)) return undefined
  return `create schema if not exists "comments";\n\n${commentsTableSql()};`
}

/** Refuses to go on while a resource has `.comments()` and the database lacks their table; the project's migrations add it. */
export const checkComments = async (db: Db, models: readonly ResourceModel[]) => {
  if (!models.some((model) => model.comments)) return
  if (await hasCommentsTable(db)) return
  throw new Error(`The comments schema is missing or behind this version of Protobase, and resources with .comments() keep their comments in comments.comments. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
