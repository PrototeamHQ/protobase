import type { WorkflowTypeList } from '@protobase/client'
import type { Trigger } from '@protobase/workflows'
import { Select } from '../../../primitives/select'
import { Field } from '../../../record-view/field'
import { errorAt } from './field-errors'
import { inputLabel, triggerType, triggerTypeLabel } from './labels'
import type { NodeProblem } from './problems'
import { schemaInputs } from './type-inputs'
import { ValueField } from './value-field'
import { text } from './messages'

type TriggerFieldsProps = { trigger: Trigger; types: WorkflowTypeList; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (trigger: Trigger) => void }

const withInput = (type: string, input: Record<string, unknown>, name: string, value: unknown): Trigger => {
  const { [name]: _, ...rest } = input
  return { [type]: value === undefined ? rest : { ...rest, [name]: value } }
}

/**
 * What starts the workflow's runs: its type, among the triggers of `types` the app can run, its plugins' included, and
 * a field for each input its input schema takes, the ones it needs marked. A trigger of a type the app cannot run or
 * does not have shows its type and its input as they are, to read only; choosing another type replaces it.
 */
export const TriggerFields = ({ trigger, types, problems, disabled, onChange }: TriggerFieldsProps) => {
  const type = triggerType(trigger)
  const offered = types.triggers.filter((entry) => entry.available)
  const chosen = offered.find((entry) => entry.id === type)
  const other = type !== undefined && !chosen ? type : undefined
  const input = type === undefined ? {} : (trigger[type as keyof Trigger] ?? {})
  return (
    <>
      <Field label={text('startsWhen')} error={errorAt(problems, 'trigger')} help={other && text('triggerOtherHelp')}>
        <Select value={type ?? ''} disabled={disabled} onChange={(event) => onChange({ [event.target.value]: {} })}>
          {other !== undefined && <option value={other}>{triggerTypeLabel(other, types.triggers.find((entry) => entry.id === other)?.label)}</option>}
          {type === undefined && <option value="">{text('triggerUnknown')}</option>}
          {offered.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {triggerTypeLabel(entry.id, entry.label)}
            </option>
          ))}
        </Select>
      </Field>
      {chosen &&
        schemaInputs(chosen.input).map((field) => (
          <ValueField
            key={`${chosen.id}:${field.name}`}
            label={inputLabel(field.name, field.title)}
            kind={field.kind}
            options={field.options}
            required={field.required}
            {...(field.kind === 'names' && { help: text('namesHelp') })}
            value={input[field.name]}
            error={errorAt(problems, `trigger.${chosen.id}.${field.name}`)}
            disabled={disabled}
            onChange={(value) => onChange(withInput(chosen.id, input, field.name, value))}
          />
        ))}
      {other !== undefined && <ValueField label={text('triggerInput')} kind="json" value={input} error={errorAt(problems, `trigger.${other}`)} disabled onChange={() => undefined} />}
    </>
  )
}
