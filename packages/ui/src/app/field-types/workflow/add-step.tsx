import type { WorkflowTypeList } from '@protobase/client'
import type { State } from '@protobase/workflows'
import { Select } from '../../../primitives/select'
import type { NewState } from './definition-edits'
import { stateTypeLabel, stepTypeLabel } from './labels'
import { text } from './messages'

const flowTypes: Exclude<State['Type'], 'Task'>[] = ['Choice', 'Map', 'Wait', 'Pass', 'Succeed', 'Fail']

// The menu's values: `task:<step type>` or `type:<state type>`
const chosen = (value: string): NewState | undefined => {
  if (value.startsWith('task:')) return { task: value.slice('task:'.length) }
  if (value.startsWith('type:')) return { type: value.slice('type:'.length) as Exclude<State['Type'], 'Task'> }
  return
}

/**
 * A menu of what a new state can be: a step of each step type of `types` the app can run, its plugins' included, and
 * the states that steer the run.
 */
export const AddStep = ({ types, inside, onAdd }: { types: WorkflowTypeList; inside: string | undefined; onAdd: (kind: NewState) => void }) => (
  <Select
    aria-label={inside ? text('addStepInside', { map: inside }) : text('addStep')}
    value=""
    className="w-auto max-w-full font-medium"
    onChange={(event) => {
      const kind = chosen(event.target.value)
      if (kind) onAdd(kind)
    }}
  >
    <option value="">{inside ? text('addStepInside', { map: inside }) : text('addStep')}</option>
    <optgroup label={text('steps')}>
      {types.step_types
        .filter((type) => type.available)
        .map((type) => (
          <option key={type.id} value={`task:${type.id}`}>
            {stepTypeLabel(type.id, type.label)}
          </option>
        ))}
    </optgroup>
    <optgroup label={text('flow')}>
      {flowTypes.map((type) => (
        <option key={type} value={`type:${type}`}>
          {stateTypeLabel(type)}
        </option>
      ))}
    </optgroup>
  </Select>
)
