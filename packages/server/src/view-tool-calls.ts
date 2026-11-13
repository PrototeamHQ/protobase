import { pruneToolCalls, toolCallsProblems } from '@protobase/layout'
import type { ResourceModel, ThreadSectionModel } from '@protobase/schema'
import { matchErrors } from './view-related'

type RecordToolCalls = NonNullable<ThreadSectionModel['calls']>

// A sensitive value never leaves the server, so a call would show without it
const sensitiveErrors = (calls: RecordToolCalls, model: ResourceModel) =>
  [calls.name, calls.time, calls.status, calls.input, calls.result, calls.error].flatMap((name) => (name !== undefined && model.fields[name]?.sensitive ? [`"${name}" on ${model.name} is sensitive`] : []))

/** What is wrong with the tool calls of a record's conversation on the record page of `resource`; empty when they can be shown. */
export const toolCallsErrors = (calls: RecordToolCalls, resource: string, models: Record<string, ResourceModel>): string[] => {
  const problems = toolCallsProblems(calls, models)
  if (problems.length > 0) return problems
  const model = models[calls.resource]!
  return [...matchErrors(model, calls.field, resource).map((error) => `field: ${error}`), ...sensitiveErrors(calls, model)]
}

/** The tool calls of a record's conversation as a caller may see them: gone when they cannot read the calls of the record, without what of each they cannot read. */
export const pruneRecordToolCalls = (calls: RecordToolCalls, resource: string, models: Record<string, ResourceModel>): RecordToolCalls | undefined => {
  const kept = pruneToolCalls(calls, models)
  if (!kept || matchErrors(models[calls.resource]!, calls.field, resource).length > 0) return
  return kept
}
