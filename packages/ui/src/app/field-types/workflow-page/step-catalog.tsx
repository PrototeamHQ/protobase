import { Bell, CircleCheck, CircleX, Database, GitBranch, Globe, Mail, Package, PenLine, Puzzle, Repeat, Timer, type LucideIcon } from 'lucide-react'
import type { WorkflowTypeEntry, WorkflowTypeList } from '@protobase/client'
import type { State } from '@protobase/workflows'
import type { PickerGroup, PickerItem } from '../../../search-picker'
import type { NewState } from '../workflow/definition-edits'
import { stateTypeLabel, stepTypeLabel } from '../workflow/labels'
import { text } from './messages'

type FlowType = Exclude<State['Type'], 'Task'>

const builtIn: Record<string, { icon: LucideIcon; keywords: string[] }> = {
  'app:http': { icon: Globe, keywords: ['api', 'fetch', 'url', 'webhook', 'get', 'post'] },
  'app:mail.send': { icon: Mail, keywords: ['email', 'send', 'message'] },
  'app:records.create': { icon: Database, keywords: ['insert', 'add', 'new', 'row'] },
  'app:records.update': { icon: Database, keywords: ['change', 'edit', 'row'] },
  'app:records.get': { icon: Database, keywords: ['read', 'find', 'row'] },
  'app:records.list': { icon: Database, keywords: ['read', 'find', 'query', 'rows'] },
}

const flow: { type: FlowType; icon: LucideIcon; description: () => string; keywords: string[] }[] = [
  { type: 'Choice', icon: GitBranch, description: () => text('flowChoice'), keywords: ['if', 'branch', 'switch', 'condition'] },
  { type: 'Map', icon: Repeat, description: () => text('flowMap'), keywords: ['loop', 'each', 'list', 'repeat'] },
  { type: 'Block', icon: Package, description: () => text('flowBlock'), keywords: ['cache', 'once', 'group', 'reuse', 'wrap'] },
  { type: 'Wait', icon: Timer, description: () => text('flowWait'), keywords: ['delay', 'sleep', 'pause', 'later'] },
  { type: 'Pass', icon: PenLine, description: () => text('flowPass'), keywords: ['variable', 'assign', 'transform'] },
  { type: 'Succeed', icon: CircleCheck, description: () => text('flowSucceed'), keywords: ['end', 'stop', 'done'] },
  { type: 'Fail', icon: CircleX, description: () => text('flowFail'), keywords: ['end', 'stop', 'error'] },
]

const stepItem = (type: WorkflowTypeEntry): PickerItem => ({
  id: `task:${type.id}`,
  title: stepTypeLabel(type.id, type.label),
  description: type.description,
  keywords: [type.id, ...(builtIn[type.id]?.keywords ?? [])],
  icon: builtIn[type.id]?.icon ?? (type.id.startsWith('app:') ? Bell : Puzzle),
})

// The plugin a step type comes from, by its id's prefix: `app:` is the app's own
const pluginOf = (id: string) => id.slice(0, Math.max(id.indexOf(':'), 0))

/** What a new step can be, as the step picker groups it: what the app has built in, each plugin's, and the states that steer the run. */
export const stepGroups = (types: WorkflowTypeList): PickerGroup[] => {
  const offered = types.step_types.filter((type) => type.available)
  const plugins = [...new Set(offered.map((type) => pluginOf(type.id)).filter((name) => name !== 'app'))]
  return [
    { title: text('builtIn'), items: offered.filter((type) => pluginOf(type.id) === 'app').map(stepItem) },
    ...plugins.map((plugin) => ({ title: plugin, items: offered.filter((type) => pluginOf(type.id) === plugin).map(stepItem) })),
    { title: text('flow'), items: flow.map((each) => ({ id: `type:${each.type}`, title: stateTypeLabel(each.type), description: each.description(), keywords: each.keywords, icon: each.icon })) },
  ].filter((group) => group.items.length > 0)
}

/** The new state a picked item stands for. */
export const pickedState = (id: string): NewState => (id.startsWith('task:') ? { task: id.slice('task:'.length) } : { type: id.slice('type:'.length) as FlowType })
