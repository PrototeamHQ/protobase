import { useId, useState, type ComponentType } from 'react'
import type { ActionInputModel, ActionModel, JsonValue } from '@protobase/schema'
import { Button } from '../../../primitives/button'
import { ResponsiveDialog } from '../../../primitives/responsive-dialog'
import { Field } from '../../../record-view'
import { isChosen, type Draft } from '../../create/create-values'
import { ErrorBanner } from '../../error-banner'
import { FieldEditor } from '../../field-editor'
import { useAdminMeta } from '../../meta-gate'
import { useActionMailbox } from '../../../mailbox/use-action-mailbox'
import { useProjectUi } from '../project-ui'
import { checklistBoxes } from './checklist-boxes'
import { ChecklistInput } from './checklist-input'
import { answeredValues, inputField, inputHints, refusedAnswers, startingAnswers } from './input-answers'
import { inputErrors } from './input-errors'
import { text } from '../messages'

/** What a custom input's component gets, as a field type's editor does: the answer, a way to set it, whether it is refused, and `props`. */
export type ActionInputProps<V = unknown, P = Record<string, JsonValue>> = {
  /** The input, as the action declares it. */
  input: ActionInputModel
  value: V | null
  onChange: (value: V | null) => void
  invalid: boolean
  /** What the input gives in `props`; `{}` without. */
  props: P
}

type InputEditorProps = { input: ActionInputModel; held: unknown; invalid: boolean; onChange: (value: unknown) => void; boxes: string[] }

const InputEditor = ({ input, held, invalid, onChange, boxes }: InputEditorProps) => {
  const { resources, views } = useAdminMeta()
  const { components } = useProjectUi()
  if (input.kind === 'custom') {
    const Custom = components?.[input.component ?? ''] as ComponentType<ActionInputProps> | undefined
    if (!Custom) throw new Error(`Input "${input.name}": the app has no component "${input.component}"`)
    return <Custom input={input} value={held ?? null} onChange={onChange} invalid={invalid} props={input.props ?? {}} />
  }
  if (input.kind === 'checklist') return <ChecklistInput boxes={boxes} ticked={Array.isArray(held) ? (held as string[]) : []} onChange={onChange} />
  const target = input.resource === undefined ? undefined : resources[input.resource]
  return (
    <FieldEditor
      field={inputField(input)}
      hints={inputHints(input)}
      value={isChosen(held) ? held.key : held}
      stored={undefined}
      relationLabel={isChosen(held) ? held.label : undefined}
      relationPicker={target ? { target, view: views[target.name] } : undefined}
      invalid={invalid}
      onChange={onChange}
    />
  )
}

type ActionInputsDialogProps = {
  action: ActionModel & { inputs: ActionInputModel[] }
  label: string
  danger?: boolean
  /** The records it runs on, whose `from` fields hold a checklist's boxes. */
  records?: Array<Record<string, unknown>>
  /** The titles of the records, named above the inputs when it runs on several. */
  names?: string[]
  onCancel: () => void
  /** Runs the action with the answers; a failure it throws keeps the dialog open, its messages under their inputs. */
  onSubmit: (values: Record<string, unknown>) => Promise<void>
}

/** The dialog an action with inputs opens: the inputs that show, edited as on the create form, and the action's button. */
export const ActionInputsDialog = ({ action, label, danger, records = [], names = [], onCancel, onSubmit }: ActionInputsDialogProps) => {
  const [draft, setDraft] = useState<Draft>(() => startingAnswers(action.inputs))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<unknown>()
  const [running, setRunning] = useState(false)
  const formId = useId()
  const { shown, values } = answeredValues(action.inputs, draft)
  const mailbox = useActionMailbox(action, failure)
  const boxes = Object.fromEntries(action.inputs.filter((input) => input.kind === 'checklist').map((input) => [input.name, checklistBoxes(input, records)]))

  const submit = async () => {
    const refused = refusedAnswers(action.inputs, values, boxes)
    setErrors(refused)
    setFailure(undefined)
    if (Object.keys(refused).length > 0 || mailbox.blocked) return
    setRunning(true)
    await onSubmit(values).catch((error: unknown) => {
      setErrors(inputErrors(error, action.inputs))
      setFailure(error)
    })
    setRunning(false)
  }

  const change = (name: string, value: unknown) => {
    setErrors(({ [name]: _, ...rest }) => rest)
    setDraft((current) => ({ ...current, [name]: value }))
  }

  return (
    <ResponsiveDialog
      title={label}
      description={action.confirm}
      open
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{text('cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} type="submit" form={formId} loading={running} disabled={mailbox.blocked}>
            {label}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {failure !== undefined && Object.keys(errors).length === 0 && !mailbox.explained && <ErrorBanner title={text('failed', { label })} error={failure} />}
        {mailbox.notice}
        {names.length > 1 && <p className="text-sm">{text('forRecords', { records: names.join(', ') })}</p>}
        {action.inputs
          .filter((input) => shown.has(input.name))
          .map((input) => (
            <Field key={input.name} label={input.label} required={input.required} help={input.help} error={errors[input.name]}>
              <InputEditor input={input} held={draft[input.name]} invalid={Boolean(errors[input.name])} onChange={(next) => change(input.name, next)} boxes={boxes[input.name] ?? []} />
            </Field>
          ))}
      </form>
    </ResponsiveDialog>
  )
}
