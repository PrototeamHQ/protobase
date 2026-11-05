import { workflowTriggerTypes } from '@protobase/schema/internal'
import type { Trigger } from '@protobase/workflows'
import { Select } from '../../../primitives/select'
import { Field } from '../../../record-view/field'
import { errorAt } from './field-errors'
import { inputLabel, triggerKind, triggerKinds, type TriggerKind } from './labels'
import type { NodeProblem } from './problems'
import { ValueField } from './value-field'
import { text } from './messages'

type TriggerFieldsProps = { trigger: Trigger; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (trigger: Trigger) => void }

const withInput = (kind: TriggerKind, input: Record<string, unknown>, name: string, value: unknown): Trigger => {
  const { [name]: _, ...rest } = input
  return { [kind]: value === undefined ? rest : { ...rest, [name]: value } }
}

/** What starts the workflow's runs: its kind, and a field for each input its trigger type takes, the ones it needs marked. */
export const TriggerFields = ({ trigger, problems, disabled, onChange }: TriggerFieldsProps) => {
  const kind = triggerKind(trigger)
  const input = kind === undefined ? {} : (trigger[kind] ?? {})
  const inputs = kind === undefined || kind === 'manual' ? [] : workflowTriggerTypes[kind]
  return (
    <>
      <Field label={text('startsWhen')} error={errorAt(problems, 'trigger')}>
        <Select value={kind ?? ''} disabled={disabled} onChange={(event) => onChange({ [event.target.value]: {} })}>
          {kind === undefined && <option value="">{text('triggerUnknown')}</option>}
          {triggerKinds.map((entry) => (
            <option key={entry.kind} value={entry.kind}>
              {entry.label()}
            </option>
          ))}
        </Select>
      </Field>
      {kind !== undefined &&
        inputs.map((field) => (
          <ValueField
            key={`${kind}:${field.name}`}
            label={inputLabel(field.name)}
            kind={field.kind}
            required={'required' in field && field.required}
            value={input[field.name]}
            error={errorAt(problems, `trigger.${kind}.${field.name}`)}
            disabled={disabled}
            onChange={(value) => onChange(withInput(kind, input, field.name, value))}
          />
        ))}
    </>
  )
}
