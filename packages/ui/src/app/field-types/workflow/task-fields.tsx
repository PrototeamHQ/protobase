import type { WorkflowTypeList } from '@protobase/client'
import type { TaskState } from '@protobase/workflows'
import { Select } from '../../../primitives/select'
import { Field } from '../../../record-view/field'
import { CacheField } from './cache-field'
import { errorAt } from './field-errors'
import { inputLabel, stepTypeLabel } from './labels'
import type { NodeProblem } from './problems'
import { schemaInputs } from './type-inputs'
import { ValueField } from './value-field'
import { text } from './messages'

type TaskFieldsProps = { state: TaskState; types: WorkflowTypeList; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (state: TaskState) => void }

const withArgument = (state: TaskState, name: string, value: unknown): TaskState => {
  const given = typeof state.Arguments === 'object' && state.Arguments !== null ? (state.Arguments as Record<string, unknown>) : {}
  const { [name]: _, ...rest } = given
  return { ...state, Arguments: value === undefined ? rest : { ...rest, [name]: value } }
}

/**
 * A Task's step type, among those of `types` the app can run, and a field for each argument its input schema takes:
 * the ones it needs marked. Arguments written as one expression, or of a type the list does not have, are one field.
 */
export const TaskFields = ({ state, types, problems, disabled, onChange }: TaskFieldsProps) => {
  const offered = types.step_types.filter((type) => type.available)
  const type = types.step_types.find((entry) => entry.id === state.Resource)
  const whole = typeof state.Arguments === 'string' || !type
  return (
    <>
      <Field label={text('stepType')} error={errorAt(problems, 'Resource')}>
        <Select value={state.Resource} disabled={disabled} onChange={(event) => onChange({ ...state, Resource: event.target.value })}>
          {!offered.some((entry) => entry.id === state.Resource) && <option value={state.Resource}>{stepTypeLabel(state.Resource, type?.label)}</option>}
          {offered.map((entry) => (
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
            key={`${state.Resource}:${input.name}`}
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
      <CacheField state={state} types={types} disabled={disabled} onChange={onChange} />
    </>
  )
}
