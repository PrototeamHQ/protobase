import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import type { Definition } from '@protobase/workflows'
import { formatDateTime } from '../../../format/date'
import { Button } from '../../../primitives/button'
import { SearchPicker, type PickerGroup, type PickerItem } from '../../../search-picker'
import { splitPath, stateAt } from '../workflow/definition'
import { statePath } from '../workflow-run/run-trace'
import { useRunSteps } from '../workflow-run/use-run-steps'
import { earlierSteps, readOf, sampleValues, shapesItsOutput, variableFor, withRead } from './value-insert'
import { text } from './messages'

const inputRead = '$states.context.Execution.Input'

/** A field asking for a value: its label, what it holds, and how to give it the next. */
export type InsertTarget = { label: string; value: unknown; set: (next: unknown) => void }

export type InsertValueViewProps = {
  definition: Definition
  /** The step whose field it is. */
  path: string
  target: InsertTarget
  /** The run whose values are offered: the one shown, else the latest. */
  run: Record<string, unknown> | undefined
  /** A step gets a variable, by the field's change that follows, for a value that looks like `sample` in the run. */
  onAssign: (step: string, variable: string, sample: string) => void
  onBack: () => void
  onTestRun: () => void
}

// The sample a row shows, before what it says it adds
const sampleOf = (item: PickerItem) => (item.description ?? '').split(' · ')[0]!

/**
 * Inserting a value in a step's field, in place of its form in the same panel: the run's input and each earlier step's
 * output, read from a real run with sample values. A step's output is read through a variable, as every value of a
 * workflow is read by name, so choosing one gives the step that variable when it has none.
 */
export const InsertValueView = ({ definition, path, target, run, onAssign, onBack, onTestRun }: InsertValueViewProps) => {
  // The run's trace, which the graph read already
  const steps = useRunSteps(run === undefined ? undefined : String(run.id), false)
  const rows = useMemo(() => steps.data ?? [], [steps.data])
  const before = useMemo(() => earlierSteps(definition, path), [definition, path])
  const earlier = useMemo(() => before.filter((step) => !shapesItsOutput(definition, step)), [before, definition])
  const shaped = before.filter((step) => shapesItsOutput(definition, step))
  const output = (step: string) => rows.filter((row) => statePath(row.scope, row.state) === step).at(-1)?.output
  const groups = useMemo((): PickerGroup[] => {
    if (!run) return []
    const input: PickerGroup = { title: text('runInputGroup'), items: sampleValues(run.input ?? {}).map(({ path: at, sample }) => ({ id: `input:${at}`, title: at === '' ? text('wholeValue') : at, description: sample })) }
    const fromSteps = earlier.flatMap((step): PickerGroup[] => {
      const value = output(step)
      if (value === undefined || value === null) return []
      const name = splitPath(step).name
      return [{ title: name, items: sampleValues(value).map(({ path: at, sample }) => ({ id: `step:${step}\n${at}`, title: at === '' ? text('wholeValue') : at, description: variableFor(definition, step).added ? `${sample} · ${text('addsVariable', { step: name })}` : sample })) }]
    })
    return [input, ...fromSteps]
  }, [run, rows, earlier, definition])
  const pick = (id: string, sample: string) => {
    if (id.startsWith('input:')) {
      target.set(withRead(target.value, readOf(inputRead, id.slice('input:'.length))))
      onBack()
      return
    }
    const [step, at] = id.slice('step:'.length).split('\n') as [string, string]
    const { variable, added } = variableFor(definition, step)
    if (added) onAssign(step, variable, sample)
    target.set(withRead(target.value, readOf(`$${variable}`, at)))
    onBack()
  }
  const noOutput = earlier.filter((step) => stateAt(definition, step) && output(step) == null)
  return (
    <div className="flex flex-col gap-3">
      <Button size="sm" variant="ghost" className="self-start" onClick={onBack}>
        <ArrowLeft className="size-3.5" aria-hidden />
        {text('back')}
      </Button>
      <h3 className="font-semibold">{text('insertInto', { field: target.label })}</h3>
      {run ? (
        <>
          <p className="text-xs text-muted-foreground">{text('valuesFrom', { when: formatDateTime(Date.parse(String(run.created_at))) })}</p>
          <SearchPicker autoFocus groups={groups} onPick={(item) => pick(item.id, sampleOf(item))} />
          {noOutput.length > 0 && <p className="text-xs text-muted-foreground">{noOutput.map((step) => splitPath(step).name).join(', ')}: {text('noSample')}</p>}
          {shaped.length > 0 && <p className="text-xs text-muted-foreground">{shaped.map((step) => splitPath(step).name).join(', ')}: {text('outputShaped')}</p>}
        </>
      ) : (
        <div className="grid justify-items-start gap-2 text-body">
          <p className="text-muted-foreground">{text('noRunYet')}</p>
          <Button onClick={onTestRun}>{text('testRun')}</Button>
          <p className="text-xs text-muted-foreground">{text('typeByHand')}</p>
        </div>
      )}
    </div>
  )
}
