import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect } from 'react'
import { FocusRefreshContext } from '../../../data/focus-refresh'
import { liveRefresh } from '../../../data/live-refresh'
import { useList } from '../../../data/use-list'
import { useRecord } from '../../../data/use-record'
import { definitionOf } from '../workflow/definition'
import type { TraceStep } from './run-trace'

/** The most steps the graph marks: a run's first 500, one page of the API. */
export const traceStepLimit = 500

/** How often the page reads a run that goes on again. */
export const followMs = 1000

const goingOn = new Set(['queued', 'running', 'waiting'])

/**
 * While `following`, reads again every second all the page shows of runs and steps, as a live update would: the run's
 * status and fields, its steps on the graph and in lists.
 */
const useFollow = (following: boolean) => {
  const queryClient = useQueryClient()
  const focusRefresh = useContext(FocusRefreshContext)
  useEffect(() => {
    if (!following) return
    const refresh = liveRefresh(queryClient, () => focusRefresh?.paused() ?? false)
    const timer = setInterval(() => refresh.changed(['workflow_runs', 'workflow_steps']), followMs)
    return () => {
      clearInterval(timer)
      refresh.stop()
    }
  }, [following, queryClient, focusRefresh])
}

/**
 * A run with what its trace draws: the run as stored, the definition of the version it runs, and its first steps in the
 * order they ran, followed while the run goes on. Without a run nothing is read.
 */
export const useRunTrace = (runId: string | undefined) => {
  const run = useRecord('workflow_runs', runId ?? '', runId !== undefined)
  const record = run.data?.record
  const versioned = record?.workflow_id != null && record.version != null
  const version = useRecord('workflow_versions', [String(record?.workflow_id ?? ''), Number(record?.version ?? 0)], versioned)
  const steps = useList('workflow_steps', { filter: `run_id = ${JSON.stringify(runId ?? '')}`, orderBy: 'id', pageSize: traceStepLimit, fields: ['id', 'scope', 'state', 'status', 'next'], enabled: runId !== undefined })
  const going = goingOn.has(String(record?.status))
  useFollow(going)
  return {
    id: runId,
    run: record,
    stored: run.data,
    definition: version.data ? definitionOf(version.data.record.definition) : undefined,
    steps: steps.items as TraceStep[],
    cut: Boolean(steps.hasNextPage),
    going,
    error: run.error ?? version.error ?? steps.error,
  }
}

export type RunTraceData = ReturnType<typeof useRunTrace>
