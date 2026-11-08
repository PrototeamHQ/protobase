import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { WorkflowTraceStep } from '@protobase/client'
import { useClient } from '../../../data/api-provider'
import { keys } from '../../../data/query-keys'
import type { StepRow } from './step-card'

/** How often the page reads a run that goes on again. */
export const followMs = 1000

/** A step of the trace as the run's page shows it, keyed by its scope and number, which name it within the run. */
export const stepRow = (step: WorkflowTraceStep): StepRow => ({
  ...step,
  id: `${step.scope}#${step.seq}`,
  resume_at: step.resumeAt ?? null,
  started_at: step.startedAt,
  finished_at: step.finishedAt,
  duration_ms: Date.parse(step.finishedAt) - Date.parse(step.startedAt),
})

/**
 * The steps of a run's trace in the order they ran, read again every second while `following`, and once more when it
 * stops, since the run is marked ended only once its whole trace is kept. Without a run nothing is read.
 */
export const useRunSteps = (runId: string | undefined, following: boolean) => {
  const client = useClient()
  const steps = useQuery({
    queryKey: keys.workflowRunTrace(runId ?? ''),
    queryFn: async () => (await client.workflowRunTrace(runId!)).steps.map(stepRow),
    enabled: runId !== undefined,
    refetchInterval: following ? followMs : false,
  })
  const was = useRef(following)
  const { refetch } = steps
  useEffect(() => {
    const stopped = was.current && !following
    was.current = following
    if (stopped && runId !== undefined) void refetch()
  }, [following, runId, refetch])
  return steps
}
