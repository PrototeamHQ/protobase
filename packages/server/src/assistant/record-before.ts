import { ifMatchSatisfied } from '../etag'
import { HttpProblem, preconditionFailed } from '../problem'
import { refused } from './record-tool-args'
import type { RecordKeyInput, ToolRecord } from './records'
import type { ToolContext } from './tools'
import { writeText } from './write-messages'
import { describedResource } from './write-prompts'

// The caller's read rules hide the record from them, which leaves the write's own rules to decide
const hidden = (error: unknown) => error instanceof HttpProblem && (error.status === 403 || error.status === 404)

/**
 * The record as the caller reads it now, for what an approval names and shows before a write: undefined when they may
 * not read it. A record changed since `etag` is refused before asking, as the write would refuse it after the user
 * approved; so is any other refusal of the read, as the model's to read.
 */
export const recordBefore = (context: ToolContext, resource: string, key: RecordKeyInput, etag: string | undefined): Promise<ToolRecord | undefined | string> =>
  context.records.get(resource, key).then(
    (current) => (etag && !ifMatchSatisfied(etag, current.etag) ? refused(preconditionFailed('The record changed since it was read; fetch it again')) : current),
    (error: unknown) => (hidden(error) ? undefined : refused(error)),
  )

/** What an approval is written with: the texts of the user's language, and the resource as the caller may read it. */
export const approvalTexts = async (context: ToolContext, resource: string) => ({ text: writeText(context.locale ?? 'en'), described: describedResource(await context.resources(), resource) })
