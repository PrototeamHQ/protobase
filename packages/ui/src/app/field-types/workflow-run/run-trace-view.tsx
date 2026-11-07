import { useMemo, useState } from 'react'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { WorkflowCanvas } from '../workflow/workflow-canvas'
import { useWorkflowTypes } from '../workflow/use-workflow-types'
import { nodeTraces } from './run-trace'
import { StepPanel } from './step-panel'
import { traceStepLimit, useRunTrace } from './use-run-trace'
import { text } from './messages'

const noProblems = new Map()

/**
 * A run's trace: its workflow's graph as the run's version has it, each state marked with how it did, followed live
 * while the run goes on, and the chosen state's steps under it. It opens on the state that failed, the innermost one
 * when a Map's item failed.
 */
export const RunTrace = ({ runId }: { runId: string }) => {
  const trace = useRunTrace(runId)
  // Only names the nodes by their types' labels: until it is read, or if it cannot be, they show their types' ids.
  const types = useWorkflowTypes().data
  const { definition, steps, going } = trace
  const traces = useMemo(() => definition && nodeTraces(steps, { inProgress: going, startAt: definition.stateMachine.StartAt }), [definition, steps, going])
  // undefined until a node is chosen or the choice is cleared, which is null
  const [chosen, setChosen] = useState<string | null>()
  if (trace.error) return <ErrorBanner error={trace.error} title={text('loadFailed')} />
  if (!trace.run || !definition || !traces) return <Skeleton className="h-[28rem] w-full max-sm:h-[22rem]" />
  const failed = [...traces].filter(([, mark]) => mark.status === 'failed').map(([path]) => path).sort((a, b) => b.split('/').length - a.split('/').length)[0]
  const selected = chosen === undefined ? failed : (chosen ?? undefined)
  const run = { ...trace.run, id: runId, created_at: String(trace.run.created_at) }
  return (
    <div className="flex flex-col gap-3">
      {trace.cut && <p className="text-xs text-muted-foreground">{text('cut', { count: traceStepLimit })}</p>}
      <div className="h-[28rem] overflow-hidden rounded-lg border max-sm:h-[22rem]">
        <WorkflowCanvas definition={definition} problems={noProblems} selected={selected} onSelect={(id) => setChosen(id ?? null)} traces={traces} {...(types && { types })} />
      </div>
      {selected !== undefined && <StepPanel definition={definition} run={run} selected={selected} {...(types && { types })} />}
    </div>
  )
}
