import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { useState } from 'react'
import { Button } from '../../../primitives/button'
import { splitPath, stateAt, triggerId } from '../workflow/definition'
import { stateLabel, triggerLabel } from '../workflow/labels'
import { JsonBlock } from '../json/json-block'
import { Part, StepCard } from './step-card'
import { text } from './messages'
import { useRunSteps } from './use-run-steps'

/** How many of a state's steps show at first, and with each Show more. */
export const stepPageSize = 20

type Run = Record<string, unknown> & { id: string; created_at: string }

const Heading = ({ kind, name }: { kind: string; name: string }) => (
  <div>
    <div className="text-xs text-muted-foreground">{kind}</div>
    <h4 className="truncate font-semibold text-foreground">{name}</h4>
  </div>
)

// The steps a state took in the run, every try and item, in the order they ran: the trace the graph read, so no
// second read
const StateSteps = ({ run, name }: { run: Run; name: string }) => {
  const trace = useRunSteps(run.id, false)
  const [shown, setShown] = useState(stepPageSize)
  if (trace.isPending) return null
  const steps = (trace.data ?? []).filter((step) => step.state === name)
  if (steps.length === 0) return <p className="text-body text-muted-foreground">{text('notRun')}</p>
  return (
    <div className="grid gap-3">
      {steps.slice(0, shown).map((step) => (
        <StepCard key={String(step.id)} step={step} />
      ))}
      {steps.length > shown && (
        <Button size="sm" className="justify-self-start" onClick={() => setShown(shown + stepPageSize)}>
          {text('showMore')}
        </Button>
      )}
    </div>
  )
}

/**
 * What the chosen node did in the run, in the side panel: the trigger's input, or each step of the state with its input,
 * output, logs, timing, try and error.
 */
export const StepPanel = ({ definition, run, selected, types }: { definition: Definition; run: Run; selected: string; types?: WorkflowTypeList }) => {
  const state = selected === triggerId ? undefined : stateAt(definition, selected)
  return (
    <section aria-label={text('chosenStep')} className="grid gap-3 rounded-lg border bg-surface p-4">
      {state ? (
        <>
          <Heading kind={stateLabel(state, types)} name={splitPath(selected).name} />
          <StateSteps run={run} name={splitPath(selected).name} />
        </>
      ) : (
        <>
          <Heading kind={text('trigger')} name={triggerLabel(definition.trigger, types)} />
          <Part title={text('runInput')}>
            <JsonBlock value={run.input ?? null} />
          </Part>
        </>
      )}
    </section>
  )
}
