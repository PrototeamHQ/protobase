import { Plus, Trash2 } from 'lucide-react'
import type { Catcher, MapState, TaskState } from '@protobase/workflows'
import { Button } from '../../../primitives/button'
import { errorAt } from './field-errors'
import type { NodeProblem } from './problems'
import { TargetField } from './target-field'
import { ValueField } from './value-field'
import { text } from './messages'

type Catching = TaskState | MapState

type CatchFieldsProps<S extends Catching> = { state: S; names: readonly string[]; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (state: S) => void }

/** The errors a field of names separated by commas lists. */
const errorNames = (typed: string) =>
  typed
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

const errorsText = (value: unknown) => (Array.isArray(value) ? value.join(', ') : '')

/** A Task's or Map's error paths: each the errors it catches, by name, and the state it goes on to then. */
export const CatchFields = <S extends Catching>({ state, names, problems, disabled, onChange }: CatchFieldsProps<S>) => {
  const catchers = state.Catch ?? []
  const set = (next: Catcher[]) => {
    const { Catch: _, ...rest } = state
    onChange((next.length > 0 ? { ...rest, Catch: next } : rest) as S)
  }
  const setCatcher = (index: number, catcher: Catcher) => set(catchers.map((held, at) => (at === index ? catcher : held)))
  return (
    <>
      {catchers.map((catcher, index) => (
        <fieldset key={index} className="flex flex-col gap-3 rounded-md border border-danger/40 p-3">
          <legend className="px-1 text-xs font-medium text-danger-text">{text('errorPathNumber', { number: index + 1 })}</legend>
          <ValueField
            label={text('errors')}
            kind="text"
            help={text('errorsHelp')}
            value={catcher.ErrorEquals ?? []}
            read={errorNames}
            write={errorsText}
            error={errorAt(problems, `Catch[${index}].ErrorEquals`)}
            disabled={disabled}
            onChange={(value) => setCatcher(index, { ...catcher, ErrorEquals: value as string[] })}
          />
          <TargetField label={text('thenGoesTo')} value={catcher.Next || undefined} names={names} none={text('chooseStep')} error={errorAt(problems, `Catch[${index}].Next`)} disabled={disabled} onChange={(name) => setCatcher(index, { ...catcher, Next: name ?? '' })} />
          {!disabled && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => set(catchers.filter((_, at) => at !== index))}>
              <Trash2 className="size-3.5" />
              {text('removeErrorPath')}
            </Button>
          )}
        </fieldset>
      ))}
      {!disabled && (
        <div>
          <Button size="sm" onClick={() => set([...catchers, { ErrorEquals: ['States.ALL'], Next: '' }])}>
            <Plus className="size-3.5" />
            {text('addErrorPath')}
          </Button>
        </div>
      )}
    </>
  )
}
