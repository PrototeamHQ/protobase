import { parseCommentInput } from '../comments/comment-input'
import { notFound } from '../problem'
import { keyOf, keyParameter, refused, resourceOf, resourceParameter } from './record-tool-args'
import { approvalTexts } from './record-before'
import { defineTool, type ToolContext } from './tools'
import { commentApproval } from './write-prompts'
import { notApproved, onlyNote, outside, type WriteRecordToolsInput } from './write-tool-limits'

/** The resources whose records take comments (`.comments()`), the only ones the comment tools reach. */
export type CommentToolsInput = { commented: string[] }

const defaultPageSize = 20
const maxPageSize = 100

const resourceParameterOf = (resources: string[]) => ({ ...resourceParameter, description: `The resource's name: one of ${resources.join(', ')}, whose records take comments.` })

const commentsOf = (context: ToolContext) => {
  if (!context.comments) throw new Error('The comment tools need ToolContext.comments, which the MCP endpoint gives')
  return context.comments
}

// The same refusal as the REST API's for a resource without comments, before anything else is read.
const uncommented = ({ commented }: CommentToolsInput, resource: string) => (commented.includes(resource) ? undefined : refused(notFound(`${resource} takes no comments`)))

/** Reads a page of a record's comments, newest first, under the caller's access rules. */
export const listCommentsTool = (input: CommentToolsInput) =>
  defineTool({
    name: 'list_comments',
    description: 'Lists the comments on one record, newest first, as JSON ({ items: [{ author, created_at, text }], next_page_token }). Pass next_page_token back as page_token for the next page; it is empty on the last.',
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameterOf(input.commented),
        key: keyParameter,
        page_size: { type: 'integer', minimum: 1, maximum: maxPageSize, description: `Comments per page, ${defaultPageSize} by default.` },
        page_token: { type: 'string', description: 'The next_page_token of the previous page.' },
      },
      required: ['resource', 'key'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, context) => {
      const resource = resourceOf(args)
      const key = keyOf(args.key)
      if (!resource || key === undefined) return 'Pass the resource and key as { "resource": "<name>", "key": "<key>" }.'
      const refusal = uncommented(input, resource)
      if (refusal) return refusal
      const params = {
        page_size: typeof args.page_size === 'number' ? Math.min(args.page_size, maxPageSize) : defaultPageSize,
        ...(typeof args.page_token === 'string' && args.page_token && { page_token: args.page_token }),
      }
      return commentsOf(context).list(resource, key, params).then((page) => JSON.stringify(page), refused)
    },
  })

/**
 * Adds the caller's comment to a record once the user approves it, under the caller's access rules. Given `resources`,
 * it comments only on those, and refuses any other before asking.
 */
export const addCommentTool = (input: CommentToolsInput & WriteRecordToolsInput) =>
  defineTool({
    name: 'add_comment',
    description: `Adds a comment by you to one record and returns it as JSON ({ author, created_at, text }). The user approves each comment in their client first; nothing is written without it.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameterOf(input.resources ?? input.commented),
        key: keyParameter,
        text: { type: 'string', description: 'The comment, plain text.' },
      },
      required: ['resource', 'key', 'text'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (args, context) => {
      const resource = resourceOf(args)
      const key = keyOf(args.key)
      const text = typeof args.text === 'string' ? args.text : undefined
      if (!resource || key === undefined || text === undefined) return 'Pass the resource, key and text as { "resource": "<name>", "key": "<key>", "text": "<comment>" }.'
      const refusal = outside(input, resource) ?? uncommented(input, resource)
      if (refusal) return refusal
      // Refused before asking, as posting would refuse it after the user approved: an invalid comment, or a record the caller may not read.
      const invalid = await Promise.resolve()
        .then(() => parseCommentInput({ body: text }, String(context.session.user.id)))
        .then(() => undefined, refused)
      if (invalid) return invalid
      const current = await context.records.get(resource, key).catch(refused)
      if (typeof current === 'string') return current
      const { text: texts, described } = await approvalTexts(context, resource)
      const answer = await context.approve(commentApproval(texts, described, key, current.record, text))
      if (answer !== 'approved') return notApproved(answer)
      return commentsOf(context).add(resource, key, text).then((comment) => JSON.stringify(comment), refused)
    },
  })

/**
 * `list_comments`, and `add_comment` when `writes` allows writing: on the resources with comments, and of those only
 * the ones `writes` lists when it lists some. None when no resource takes comments.
 */
export const commentTools = ({ commented }: CommentToolsInput, writes: false | WriteRecordToolsInput) => {
  if (commented.length === 0) return []
  const list = listCommentsTool({ commented })
  if (writes === false) return [list]
  const resources = writes.resources?.filter((name) => commented.includes(name))
  if (resources?.length === 0) return [list]
  return [list, addCommentTool({ commented, ...(resources && { resources }) })]
}
