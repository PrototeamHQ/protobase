
/** The table the comments of every resource with `.comments()` are kept in, in a schema of its own. */
export const commentsTable = '"comments"."comments"'

/** An index for each read of the comments: the record pages', the admin list's filters, by name. */
export const commentsIndexes = [
  ['comments_record', '"resource", "record_key", "id"'],
  ['comments_tenant', '"tenant_id", "id"'],
  ['comments_author', '"author_id", "id"'],
  ['comments_created_at', '"created_at"'],
  ['comments_record_key', '"record_key"'],
] as const

// Step 1 of `commentsModule`: frozen once released, as every step is.
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
