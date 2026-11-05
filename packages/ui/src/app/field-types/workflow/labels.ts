import type { WorkflowTriggerType } from '@protobase/schema/internal'
import type { State, Trigger } from '@protobase/workflows'
import type { NodeStatus } from './node-trace'
import { text } from './messages'

/** The step types' names, by the `Resource` a Task names; a step type without one shows as it is written. */
const stepTypeLabels: Record<string, () => string> = {
  'app:http': () => text('stepHttp'),
  'app:records.create': () => text('stepRecordsCreate'),
  'app:records.update': () => text('stepRecordsUpdate'),
  'app:records.get': () => text('stepRecordsGet'),
  'app:records.list': () => text('stepRecordsList'),
  'app:mail.send': () => text('stepMailSend'),
  'app:piece': () => text('stepPiece'),
}

export const stepTypeLabel = (resource: string) => stepTypeLabels[resource]?.() ?? resource

/** The states' types other than Task, which shows its step type's name. */
const stateTypeLabels: Record<Exclude<State['Type'], 'Task'>, () => string> = {
  Pass: () => text('typePass'),
  Choice: () => text('typeChoice'),
  Wait: () => text('typeWait'),
  Map: () => text('typeMap'),
  Succeed: () => text('typeSucceed'),
  Fail: () => text('typeFail'),
}

export const stateTypeLabel = (type: Exclude<State['Type'], 'Task'>) => stateTypeLabels[type]?.() ?? type

/** What a state is, as its node and panel name it: its step type for a Task, else its type. */
export const stateLabel = (state: State) => (state.Type === 'Task' ? stepTypeLabel(String(state.Resource)) : stateTypeLabel(state.Type))

/** The arguments' and fields' names in the forms, by their name in the definition; one without shows as it is written. */
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

export const inputLabel = (name: string) => inputLabels[name]?.() ?? name

export type TriggerKind = 'manual' | WorkflowTriggerType

/** The triggers, in the order the trigger's menu lists them. */
export const triggerKinds: { kind: TriggerKind; label: () => string }[] = [
  { kind: 'manual', label: () => text('triggerManual') },
  { kind: 'app:record', label: () => text('triggerRecord') },
]

/** The trigger's kind: the one key it holds. */
export const triggerKind = (trigger: Trigger | undefined): TriggerKind | undefined => {
  const [kind] = Object.keys(trigger ?? {})
  return triggerKinds.find((entry) => entry.kind === kind)?.kind
}

/** The type a trigger names that the editor does not offer, such as one of the app's own plugins'. */
export const otherTriggerType = (trigger: Trigger | undefined): string | undefined => {
  const [type] = Object.keys(trigger ?? {})
  return type && triggerKind(trigger) === undefined ? type : undefined
}

/** The trigger's label: its kind's, or the type it names when the editor does not offer it. */
export const triggerLabel = (trigger: Trigger | undefined) => {
  const kind = triggerKind(trigger)
  return triggerKinds.find((entry) => entry.kind === kind)?.label() ?? otherTriggerType(trigger) ?? text('triggerUnknown')
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
