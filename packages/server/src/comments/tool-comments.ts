import { toolKey } from '../assistant/records'
import type { Deps } from '../deps'
import type { Session } from '../types'
import type { CommentItem } from './comment-item'
import { postComment } from './post-comment'
import { readComments } from './read-comments'
import type { ToolComment, ToolComments } from './tool-comment-types'

const compact = ({ author, created_at, body }: CommentItem): ToolComment => ({ author, created_at, text: body })

/** `ToolComments` over the admin's resources for `session`; `requestURL` is the request's, as `postComment` takes it. */
export const toolComments = (deps: Deps, session: Session, requestURL: string): ToolComments => ({
  list: async (resource, input, { page_size, page_token } = {}) => {
    const { entry, key } = toolKey(deps, resource, input)
    const query = { ...(page_size !== undefined && { page_size: String(page_size) }), ...(page_token !== undefined && { page_token }) }
    const page = await readComments(deps, entry, session, key, query)
    return { items: page.items.map(compact), next_page_token: page.next_page_token }
  },
  add: async (resource, input, text) => {
    const { entry, key } = toolKey(deps, resource, input)
    return compact(await postComment(deps, entry, session, key, { body: text }, requestURL))
  },
})
