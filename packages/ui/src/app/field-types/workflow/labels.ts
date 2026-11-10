import type { WorkflowTypeList } from '@protobase/client'
import type { State, Trigger } from '@protobase/workflows'
import type { NodeStatus } from './node-trace'
import { text } from './messages'

/**
 * The built-in step types' names, by the `Resource` a Task names; another shows the label the type list gives it,
 * `listed`, or, without one, as it is written.
 */
const stepTypeLabels: Record<string, () => string> = {
  'app:http': () => text('stepHttp'),
  'app:records.create': () => text('stepRecordsCreate'),
  'app:records.update': () => text('stepRecordsUpdate'),
  'app:records.get': () => text('stepRecordsGet'),
  'app:records.list': () => text('stepRecordsList'),
  'app:mail.send': () => text('stepMailSend'),
  'app:piece': () => text('stepPiece'),
}

export const stepTypeLabel = (resource: string, listed?: string) => stepTypeLabels[resource]?.() ?? listed ?? resource

/** The states' types other than Task, which shows its step type's name. */
const stateTypeLabels: Record<Exclude<State['Type'], 'Task'>, () => string> = {
  Pass: () => text('typePass'),
  Choice: () => text('typeChoice'),
  Wait: () => text('typeWait'),
  Map: () => text('typeMap'),
  Block: () => text('typeBlock'),
  Succeed: () => text('typeSucceed'),
  Fail: () => text('typeFail'),
}

export const stateTypeLabel = (type: Exclude<State['Type'], 'Task'>) => stateTypeLabels[type]?.() ?? type

/** What a state is, as its node and panel name it: its step type for a Task, by the label `types` lists, else its type. */
export const stateLabel = (state: State, types?: WorkflowTypeList) => {
  if (state.Type !== 'Task') return stateTypeLabel(state.Type)
  const resource = String(state.Resource)
  return stepTypeLabel(resource, types?.step_types.find((type) => type.id === resource)?.label)
}

/**
 * The arguments' and fields' names in the forms, by their name in the definition; another shows the title its schema
 * gives it, or, without one, as it is written.
 */
const inputLabels: Record<string, () => string> = {
  url: () => text('inputUrl'),
  method: () => text('inputMethod'),
  headers: () => text('inputHeaders'),
  query: () => text('inputQuery'),
  body: () => text('inputBody'),
  response: () => text('inputResponse'),
  resource: () => text('inputResource'),
  data: () => text('inputData'),
  key: () => text('inputKey'),
  filter: () => text('inputFilter'),
  order_by: () => text('inputOrderBy'),
  limit: () => text('inputLimit'),
  to: () => text('inputTo'),
  subject: () => text('inputSubject'),
  text: () => text('inputText'),
  html: () => text('inputHtml'),
  attachments: () => text('inputAttachments'),
  piece: () => text('inputPiece'),
  action: () => text('inputAction'),
  connection: () => text('inputConnection'),
  props: () => text('inputProps'),
  when: () => text('inputWhen'),
}

export const inputLabel = (name: string, title?: string) => inputLabels[name]?.() ?? title ?? name

/** The built-in triggers' names; another shows the label the type list gives it, `listed`, or as it is written. */
const triggerLabels: Record<string, () => string> = {
  manual: () => text('triggerManual'),
  'app:record': () => text('triggerRecord'),
}

export const triggerTypeLabel = (type: string, listed?: string) => triggerLabels[type]?.() ?? listed ?? type

/** The type a trigger names: the one key it holds. */
export const triggerType = (trigger: Trigger | undefined): string | undefined => Object.keys(trigger ?? {})[0]

/** The trigger's label: its type's, by the label `types` lists, or a prompt to choose one when it has none. */
export const triggerLabel = (trigger: Trigger | undefined, types?: WorkflowTypeList) => {
  const type = triggerType(trigger)
  return type === undefined ? text('triggerUnknown') : triggerTypeLabel(type, types?.triggers.find((entry) => entry.id === type)?.label)
}

const nodeStatusLabels: Record<NodeStatus, () => string> = {
  succeeded: () => text('traceSucceeded'),
  caught: () => text('traceCaught'),
  retrying: () => text('traceRetrying'),
  failed: () => text('traceFailed'),
  current: () => text('traceCurrent'),
}

/** How a state did in a run, as its node's mark says it. */
export const nodeStatusLabel = (status: NodeStatus) => nodeStatusLabels[status]()
