import { useId, useState } from 'react'
import { ApiError } from '@protobase/client'
import { maxStatusText, type PersonStatus, type StatusInput } from '@protobase/schema/internal'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { Segmented } from '../primitives/segmented'
import { clearChoices, type ClearChoice } from './clear-time'
import { text } from './messages'
import { draftOf, pickedStatus, type StatusDraft } from './status-draft'

export type StatusDialogProps = {
  /** The person's status now, which the picker starts from; `null` without one. */
  current: Pick<PersonStatus, 'availability' | 'text' | 'clearsAt'> | null | undefined
  /** Rejects with `ApiError`, whose detail the dialog shows; resolves once the status is set. */
  onSave: (status: StatusInput) => Promise<void>
  /** Resolves once the status is cleared. */
  onClear: () => Promise<void>
  onClose: () => void
}

const choiceLabels: Record<ClearChoice, 'never' | 'thirtyMinutes' | 'oneHour' | 'fourHours' | 'today' | 'thisWeek' | 'custom'> = {
  never: 'never',
  thirty_minutes: 'thirtyMinutes',
  one_hour: 'oneHour',
  four_hours: 'fourHours',
  today: 'today',
  this_week: 'thisWeek',
  custom: 'custom',
}

/**
 * "Set a status": the person picks an availability, automatic, busy or do not disturb, a custom text, and when it
 * clears; Save sets it, and Clear status, with a status to clear, removes it.
 */
export const StatusDialog = ({ current, onSave, onClear, onClose }: StatusDialogProps) => {
  const [draft, setDraft] = useState<StatusDraft>(() => draftOf(current))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [checked, setChecked] = useState(false)
  const formId = useId()
  const textId = useId()
  const timeId = useId()
  const change = (changes: Partial<StatusDraft>) => setDraft({ ...draft, ...changes })
  const picked = pickedStatus(draft, new Date())
  const problem = checked && 'problem' in picked ? picked : undefined

  const run = async (step: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await step()
      onClose()
    } catch (failure) {
      if (!(failure instanceof ApiError)) throw failure
      setError(failure.status === 400 ? failure.message : text('couldNotSave'))
      setBusy(false)
    }
  }

  const save = () => {
    setChecked(true)
    if ('input' in picked) void run(() => onSave(picked.input))
  }

  return (
    <Dialog
      title={current ? text('editStatus') : text('setStatus')}
      onClose={onClose}
      actions={
        <>
          {current && (
            <Button variant="ghost" className="sm:mr-auto" disabled={busy} onClick={() => void run(onClear)}>
              {text('clear')}
            </Button>
          )}
          <Button onClick={onClose}>{text('cancel')}</Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            {text('save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={textId} className="font-medium">
            {text('statusText')}
          </label>
          <Input
            id={textId}
            name="status"
            autoComplete="off"
            autoFocus
            placeholder={text('statusPlaceholder')}
            value={draft.text}
            maxLength={maxStatusText * 2}
            invalid={problem?.problem === 'text'}
            {...(problem?.problem === 'text' && { 'aria-describedby': `${textId}-problem` })}
            onChange={(event) => change({ text: event.target.value })}
          />
          {problem?.problem === 'text' && (
            <span id={`${textId}-problem`} className="text-xs text-danger-text">
              {problem.message}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 font-medium">
          {text('availability')}
          <Segmented
            label={text('availability')}
            value={draft.availability}
            onChange={(availability) => change({ availability })}
            options={[
              { value: 'automatic', label: text('automatic') },
              { value: 'busy', label: text('busy') },
              { value: 'do_not_disturb', label: text('doNotDisturb') },
            ]}
          />
          {draft.availability === 'do_not_disturb' && <span className="text-xs font-normal text-muted-foreground">{text('doNotDisturbHint')}</span>}
        </div>
        <label className="flex flex-col gap-1.5 font-medium">
          {text('clearsAfter')}
          <select name="clears" value={draft.clears} onChange={(event) => change({ clears: event.target.value as ClearChoice })} className="h-8 rounded-md border border-border-strong bg-background px-2 font-normal">
            {clearChoices.map((value) => (
              <option key={value} value={value}>
                {text(choiceLabels[value])}
              </option>
            ))}
          </select>
        </label>
        {draft.clears === 'custom' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={timeId} className="font-medium">
              {text('clearsAt')}
            </label>
            <Input
              id={timeId}
              type="datetime-local"
              name="clears-at"
              value={draft.custom}
              invalid={problem?.problem === 'time'}
              {...(problem?.problem === 'time' && { 'aria-describedby': `${timeId}-problem` })}
              onChange={(event) => change({ custom: event.target.value })}
            />
            {problem?.problem === 'time' && (
              <span id={`${timeId}-problem`} className="text-xs text-danger-text">
                {text('pickTime')}
              </span>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger-text">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
