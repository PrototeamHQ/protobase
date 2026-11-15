import type { WorkflowTypeList } from '@protobase/client'
import { customStepOf, limits, taskResource, waitSuffix, type TaskState } from '@protobase/workflows'
import { Select } from '../../../primitives/select'
import { Switch } from '../../../primitives/switch'
import { Field } from '../../../record-view/field'
import { CacheField } from './cache-field'
import { errorAt } from './field-errors'
import { inputLabel, stepTypeLabel } from './labels'
import type { NodeProblem } from './problems'
import { schemaInputs } from './type-inputs'
import { ValueField } from './value-field'
import { text } from './messages'

type TaskFieldsProps = { state: TaskState; types: WorkflowTypeList; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (state: TaskState) => void }

// The Task with `field` set, or left out when empty.
const withField = (state: TaskState, field: 'TimeoutSeconds' | 'HeartbeatSeconds', value: unknown): TaskState => {
  const { [field]: _, ...rest } = state
  return value === undefined || value === null || value === '' ? rest : { ...rest, [field]: value as number }
}

// The Task waiting for an outside result or not: a step that no longer waits keeps no heartbeat, nor a timeout longer
// than a step type runs.
const waiting = (state: TaskState, waits: boolean): TaskState => {
  const { type } = taskResource(state.Resource)
  if (waits) {
    const { Cache: _, ...rest } = state
    return { ...rest, Resource: `${type}${waitSuffix}` }
  }
  const { HeartbeatSeconds: _, TimeoutSeconds: timeout, ...rest } = state
  return { ...rest, Resource: type, ...(timeout !== undefined && timeout <= limits.taskTimeoutSeconds && { TimeoutSeconds: timeout }) }
}

/**
 * Whether a Task's form offers to make it wait for an outside result: not for a custom step, which waits for the
 * runner that runs it already and whose save refuses `.waitForTaskToken`.
 */
export const offersWaiting = (type: string) => customStepOf(type) === undefined

/** The Task with another step type, still waiting for an outside result if it did and the new type may. */
export const withStepType = (state: TaskState, type: string): TaskState => ({ ...state, Resource: `${type}${taskResource(state.Resource).waits && offersWaiting(type) ? waitSuffix : ''}` })

const withArgument = (state: TaskState, name: string, value: unknown): TaskState => {
  const given = typeof state.Arguments === 'object' && state.Arguments !== null ? (state.Arguments as Record<string, unknown>) : {}
  const { [name]: _, ...rest } = given
  return { ...state, Arguments: value === undefined ? rest : { ...rest, [name]: value } }
}

/**
 * A Task's step type, among those of `types` the app can run, and a field for each argument its input schema takes:
 * the ones it needs marked. Arguments written as one expression, or of a type the list does not have, are one field.
 * A switch makes it wait for an outside result after the type handed the work off (`.waitForTaskToken`), with how long
 * it waits and how often a heartbeat must come; a custom step has no switch, as it waits for its runner, with both.
 */
export const TaskFields = ({ state, types, problems, disabled, onChange }: TaskFieldsProps) => {
  const available = types.step_types.filter((type) => type.available)
  const { type: id, waits } = taskResource(state.Resource)
  const offered = offersWaiting(id)
  const type = types.step_types.find((entry) => entry.id === id)
  const whole = typeof state.Arguments === 'string' || !type
  return (
    <>
      <Field label={text('stepType')} error={errorAt(problems, 'Resource')}>
        <Select value={id} disabled={disabled} onChange={(event) => onChange(withStepType(state, event.target.value))}>
          {!available.some((entry) => entry.id === id) && <option value={id}>{stepTypeLabel(id, type?.label)}</option>}
          {available.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {stepTypeLabel(entry.id, entry.label)}
            </option>
          ))}
        </Select>
      </Field>
      {whole ? (
        <ValueField label={text('arguments')} kind="json" value={state.Arguments} error={errorAt(problems, 'Arguments')} disabled={disabled} onChange={(value) => onChange({ ...state, Arguments: value ?? {} })} />
      ) : (
        schemaInputs(type.input).map((input) => (
          <ValueField
            key={`${id}:${input.name}`}
            label={inputLabel(input.name, input.title)}
            kind={input.kind}
            options={input.options}
            required={input.required}
            {...(input.kind === 'names' && { help: text('namesHelp') })}
            value={(state.Arguments as Record<string, unknown> | undefined)?.[input.name]}
            error={errorAt(problems, `Arguments.${input.name}`)}
            disabled={disabled}
            onChange={(value) => onChange(withArgument(state, input.name, value))}
          />
        ))
      )}
      {offered && (
        <Field label={text('waitsForResult')} help={text('waitsForResultHelp')}>
          <Switch checked={waits} onChange={(on) => !disabled && onChange(waiting(state, on))} />
        </Field>
      )}
      {waits || !offered ? (
        <>
          <ValueField label={text('waitTimeout')} help={text('waitTimeoutHelp')} kind="json" value={state.TimeoutSeconds} error={errorAt(problems, 'TimeoutSeconds')} disabled={disabled} onChange={(value) => onChange(withField(state, 'TimeoutSeconds', value))} />
          <ValueField label={text('heartbeatSeconds')} help={text('heartbeatHelp')} kind="json" value={state.HeartbeatSeconds} error={errorAt(problems, 'HeartbeatSeconds')} disabled={disabled} onChange={(value) => onChange(withField(state, 'HeartbeatSeconds', value))} />
        </>
      ) : (
        <CacheField state={state} types={types} disabled={disabled} onChange={onChange} />
      )}
    </>
  )
}
