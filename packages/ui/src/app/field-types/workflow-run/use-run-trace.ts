import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect } from 'react'
import { FocusRefreshContext } from '../../../data/focus-refresh'
import { liveRefresh } from '../../../data/live-refresh'
import { useRecord } from '../../../data/use-record'
import { definitionOf } from '../workflow/definition'
import type { TraceStep } from './run-trace'
import { followMs, useRunSteps } from './use-run-steps'

const goingOn = new Set(['queued', 'running', 'waiting'])

/**
 * While `following`, reads again every second all the page shows of runs, as a live update would: the run's status and
 * fields; its trace follows on its own.
 */
const useFollow = (following: boolean) => {
  const queryClient = useQueryClient()
  const focusRefresh = useContext(FocusRefreshContext)
  useEffect(() => {
    if (!following) return
    const refresh = liveRefresh(queryClient, () => focusRefresh?.paused() ?? false)
    const timer = setInterval(() => refresh.changed(['workflow_runs']), followMs)
    return () => {
      clearInterval(timer)
      refresh.stop()
    }
  }, [following, queryClient, focusRefresh])
}

/**
 * A run with what its trace draws: the run as stored, the definition of the version it runs, and the steps of its trace
 * in the order they ran, followed while the run goes on. Without a run nothing is read.
 */
export const useRunTrace = (runId: string | undefined) => {
  const run = useRecord('workflow_runs', runId ?? '', runId !== undefined)
  const record = run.data?.record
  const versioned = record?.workflow_id != null && record.version != null
  const version = useRecord('workflow_versions', [String(record?.workflow_id ?? ''), Number(record?.version ?? 0)], versioned)
  const going = goingOn.has(String(record?.status))
  const steps = useRunSteps(runId, going)
  useFollow(going)
  return {
    id: runId,
    run: record,
    stored: run.data,
    definition: version.data ? definitionOf(version.data.record.definition) : undefined,
    steps: (steps.data ?? []) satisfies TraceStep[],
    going,
    error: run.error ?? version.error ?? steps.error,
  }
}

export type RunTraceData = ReturnType<typeof useRunTrace>
