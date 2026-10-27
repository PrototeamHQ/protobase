import type { RecordKeyInput } from '../assistant/records'

/** A comment as a tool gives it: who wrote it, when, and what it says. */
export type ToolComment = { author: { id: string; name?: string }; created_at: string; text: string }

/** A page of a record's comments, newest first, and the token of the next page, empty on the last. */
export type ToolCommentPage = { items: ToolComment[]; next_page_token: string }

/**
 * A record's comments as the session's user, through the REST API's comments (`GET` and `POST
 * /{resource}/{key}:comments`): the same access rules, tenant and refusals, which reject with an `HttpProblem`.
 */
export type ToolComments = {
  list: (resource: string, key: RecordKeyInput, params?: { page_size?: number; page_token?: string }) => Promise<ToolCommentPage>
  add: (resource: string, key: RecordKeyInput, text: string) => Promise<ToolComment>
}
