import type { Trigger } from '@protobase/workflows'
import { Select } from '../../../primitives/select'
import { Field } from '../../../record-view/field'
import { errorAt } from './field-errors'
import { triggerKind, triggerKinds, type TriggerKind } from './labels'
import type { NodeProblem } from './problems'
import { ValueField } from './value-field'
import { text } from './messages'

type TriggerFieldsProps = { trigger: Trigger; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (trigger: Trigger) => void }

// A trigger of each kind as it starts out, its fields still to fill in where it has any
const fresh: Record<TriggerKind, Trigger> = {
  manual: { manual: {} },
  webhook: { webhook: {} },
  schedule: { schedule: { cron: '' } },
  mail: { mail: { mailbox: '' } },
  record: { record: { events: [] } },
}

const eventNames = (typed: string) =>
  typed
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

const eventsText = (value: unknown) => (Array.isArray(value) ? value.join(', ') : '')

/** What starts the workflow's runs: its kind, and the schedule, mailbox or record events it waits for. */
export const TriggerFields = ({ trigger, problems, disabled, onChange }: TriggerFieldsProps) => {
  const kind = triggerKind(trigger)
  return (
    <>
      <Field label={text('startsWhen')} error={errorAt(problems, 'trigger')}>
        <Select value={kind ?? ''} disabled={disabled} onChange={(event) => onChange(fresh[event.target.value as TriggerKind])}>
          {kind === undefined && <option value="">{text('triggerUnknown')}</option>}
          {triggerKinds.map((entry) => (
            <option key={entry.kind} value={entry.kind}>
              {entry.label()}
            </option>
          ))}
        </Select>
      </Field>
      {'schedule' in trigger && (
        <>
          <ValueField label={text('cron')} kind="text" required help={text('cronHelp')} value={trigger.schedule.cron} error={errorAt(problems, 'trigger.schedule.cron')} disabled={disabled} onChange={(cron) => onChange({ schedule: { ...trigger.schedule, cron: String(cron ?? '') } })} />
          <ValueField
            label={text('timezone')}
            kind="text"
            help={text('timezoneHelp')}
            value={trigger.schedule.timezone}
            error={errorAt(problems, 'trigger.schedule.timezone')}
            disabled={disabled}
            onChange={(timezone) => {
              const { timezone: _, ...rest } = trigger.schedule
              onChange({ schedule: timezone === undefined ? rest : { ...rest, timezone: String(timezone) } })
            }}
          />
        </>
      )}
      {'mail' in trigger && <ValueField label={text('mailbox')} kind="text" required value={trigger.mail.mailbox} error={errorAt(problems, 'trigger.mail')} disabled={disabled} onChange={(mailbox) => onChange({ mail: { mailbox: String(mailbox ?? '') } })} />}
      {'record' in trigger && (
        <ValueField
          label={text('events')}
          kind="text"
          required
          help={text('eventsHelp')}
          value={trigger.record.events}
          read={eventNames}
          write={eventsText}
          error={errorAt(problems, 'trigger.record')}
          disabled={disabled}
          onChange={(events) => onChange({ record: { events: events as string[] } })}
        />
      )}
    </>
  )
}
