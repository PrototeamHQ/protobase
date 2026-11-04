import { workflowStepTypes, type StepInput } from '@protobase/schema/internal'
import type { TaskState } from '@protobase/workflows'
import { Select } from '../../../primitives/select'
import { Field } from '../../../record-view/field'
import { errorAt } from './field-errors'
import { inputLabel, stepTypeLabel } from './labels'
import type { NodeProblem } from './problems'
import { ValueField } from './value-field'
import { text } from './messages'

type TaskFieldsProps = { state: TaskState; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (state: TaskState) => void }

const inputsOf = (resource: string): readonly StepInput[] => (Object.hasOwn(workflowStepTypes, resource) ? workflowStepTypes[resource as keyof typeof workflowStepTypes] : [])

const withArgument = (state: TaskState, name: string, value: unknown): TaskState => {
  const given = typeof state.Arguments === 'object' && state.Arguments !== null ? (state.Arguments as Record<string, unknown>) : {}
  const { [name]: _, ...rest } = given
  return { ...state, Arguments: value === undefined ? rest : { ...rest, [name]: value } }
}

/**
 * A Task's step type, and a field for each argument it takes, from the step types' arguments: the ones it needs
 * marked. Arguments written as one expression are one field, since their names are known only when it runs.
 */
export const TaskFields = ({ state, problems, disabled, onChange }: TaskFieldsProps) => {
  const inputs = inputsOf(state.Resource)
  const whole = typeof state.Arguments === 'string'
  return (
    <>
      <Field label={text('stepType')} error={errorAt(problems, 'Resource')}>
        <Select value={state.Resource} disabled={disabled} onChange={(event) => onChange({ ...state, Resource: event.target.value })}>
          {!Object.hasOwn(workflowStepTypes, state.Resource) && <option value={state.Resource}>{state.Resource}</option>}
          {Object.keys(workflowStepTypes).map((type) => (
            <option key={type} value={type}>
              {stepTypeLabel(type)}
            </option>
          ))}
        </Select>
      </Field>
      {whole ? (
        <ValueField label={text('arguments')} kind="json" value={state.Arguments} error={errorAt(problems, 'Arguments')} disabled={disabled} onChange={(value) => onChange({ ...state, Arguments: value ?? {} })} />
      ) : (
        inputs.map((input) => (
          <ValueField
            key={`${state.Resource}:${input.name}`}
            label={inputLabel(input.name)}
            kind={input.kind}
            options={input.options}
            required={input.required}
            value={(state.Arguments as Record<string, unknown> | undefined)?.[input.name]}
            error={errorAt(problems, `Arguments.${input.name}`)}
            disabled={disabled}
            onChange={(value) => onChange(withArgument(state, input.name, value))}
          />
        ))
      )}
    </>
  )
}
