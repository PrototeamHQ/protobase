import type { WorkflowTypeList } from '@protobase/client'
import type { State } from '@protobase/workflows'
import { CatchFields } from './catch-fields'
import { ChoiceFields } from './choice-fields'
import { errorAt } from './field-errors'
import type { NodeProblem } from './problems'
import { TargetField } from './target-field'
import { TaskFields } from './task-fields'
import { ValueField } from './value-field'
import { text } from './messages'

export type StateFieldsProps = {
  state: State
  /** The app's trigger and step types, which a Task's step type is one of. */
  types: WorkflowTypeList
  /** The names of the states of its machine, which it may lead to. */
  names: readonly string[]
  problems: readonly NodeProblem[]
  disabled?: boolean
  onChange: (state: State) => void
}

// A field of the state left out when emptied
const withField = <S extends State>(state: S, name: string, value: unknown): S => {
  const { [name as keyof S]: _, ...rest } = state
  return (value === undefined ? rest : { ...rest, [name]: value }) as S
}

// Where a Task, Pass, Wait or Map goes on to: its Next, or the end of the run or of its Map item
const NextField = ({ state, names, problems, disabled, onChange }: StateFieldsProps) => {
  const flow = state as { Next?: string; End?: boolean }
  const set = (name: string | undefined) => {
    const { Next: _, End: __, ...rest } = flow
    onChange((name === undefined ? { ...rest, End: true } : { ...rest, Next: name }) as State)
  }
  return <TargetField label={text('goesOnTo')} value={flow.Next} names={names} none={text('endsHere')} error={errorAt(problems, 'Next') ?? errorAt(problems, 'End')} disabled={disabled} onChange={set} />
}

/** The fields of a state by its type: what it does, where it goes on to, and a Task's or Map's error paths. */
export const StateFields = (props: StateFieldsProps) => {
  const { state, types, problems, disabled, onChange } = props
  const value = (field: string, label: string, kind: 'text' | 'json', help?: string) => (
    <ValueField label={label} kind={kind} help={help} value={(state as Record<string, unknown>)[field]} error={errorAt(problems, field)} disabled={disabled} onChange={(next) => onChange(withField(state, field, next))} />
  )
  if (state.Type === 'Task') {
    return (
      <>
        <TaskFields state={state} types={types} problems={problems} disabled={disabled} onChange={onChange} />
        <NextField {...props} />
        <CatchFields {...props} state={state} />
      </>
    )
  }
  if (state.Type === 'Choice') return <ChoiceFields {...props} state={state} />
  if (state.Type === 'Map') {
    return (
      <>
        {value('Items', text('items'), 'json', text('itemsHelp'))}
        {value('MaxConcurrency', text('maxConcurrency'), 'json')}
        <NextField {...props} />
        <CatchFields {...props} state={state} />
      </>
    )
  }
  if (state.Type === 'Wait') {
    return (
      <>
        {value('Seconds', text('seconds'), 'json')}
        <NextField {...props} />
      </>
    )
  }
  if (state.Type === 'Pass') {
    return (
      <>
        {value('Output', text('output'), 'json', text('outputHelp'))}
        <NextField {...props} />
      </>
    )
  }
  if (state.Type === 'Succeed') return value('Output', text('output'), 'json', text('outputHelp'))
  if (state.Type === 'Fail') {
    return (
      <>
        {value('Error', text('error'), 'text')}
        {value('Cause', text('cause'), 'text')}
      </>
    )
  }
  return null
}
