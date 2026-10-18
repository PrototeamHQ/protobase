/** One comment as the API gives it: its author and the people it mentions, with their names when the project's auth knows them. */
export type CommentItem = {
  id: string
  created_at: string
  body: string
  author: { id: string; name?: string }
  mentions: { id: string; name?: string }[]
}

/** A comment as the table keeps it. */
export type CommentRow = { id: string; created_at: string; body: string; author_id: string; mentions: string[] }

const person = (id: string, names: Record<string, string>) => ({ id, ...(names[id] !== undefined && { name: names[id] }) })

/** The user ids a page of comments names, once each. */
export const namedUsers = (rows: readonly CommentRow[]) => [...new Set(rows.flatMap((row) => [row.author_id, ...row.mentions]))]

export const commentItem = (row: CommentRow, names: Record<string, string>): CommentItem => ({
  id: row.id,
  created_at: row.created_at,
  body: row.body,
  author: person(row.author_id, names),
  mentions: row.mentions.map((id) => person(id, names)),
})

/** The columns of a `CommentRow`, `created_at` as ISO text in UTC. */
export const commentColumns = `"id"::text as id, to_char("created_at" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at, "body", "author_id", "mentions"`
