import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useRef } from 'react'
import { FocusRefreshContext } from '../../../data/focus-refresh'
import { liveRefresh } from '../../../data/live-refresh'
import type { Definition } from '@protobase/workflows'
import { useRecord } from '../../../data/use-record'
import { definitionOf, pathOfName, stateAt } from '../workflow/definition'
import type { TraceStep } from './run-trace'
import { followMs, useRunSteps } from './use-run-steps'

const goingOn = new Set(['queued', 'running', 'waiting'])

/**
 * While `following`, reads again every second all the page shows of runs, as a live update would: the run's status and
 * fields; its trace follows on its own.
 */
const useFollow = (following: boolean) => {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!following) return
    // No form edits a run, so a draft of its workflow on the same page holds nothing back
    const refresh = liveRefresh(queryClient, () => false)
    const timer = setInterval(() => refresh.changed(['workflow_runs']), followMs)
    return () => {
      clearInterval(timer)
      refresh.stop()
    }
  }, [following, queryClient])
}

/**
 * Once a run followed here ends, reads its workflow again, whose status the run changed, as a live update would: the
 * workflow's page and the sidebar's list of workflows follow without a reload.
 */
const useEndRefresh = (going: boolean) => {
  const queryClient = useQueryClient()
  const focusRefresh = useContext(FocusRefreshContext)
  const was = useRef(going)
  useEffect(() => {
    const ended = was.current && !going
    was.current = going
    if (ended) liveRefresh(queryClient, () => focusRefresh?.paused() ?? false).changed(['workflows'])
  }, [going, queryClient, focusRefresh])
}

// Where a run's steps are on its version's graph: a block's run's inside its Block, from that Block's first state.
const placeOf = (definition: Definition | undefined, block: unknown) => {
  if (!definition) return
  const within = typeof block === 'string' ? pathOfName(definition.stateMachine, block) : undefined
  const state = within && stateAt(definition, within.join('/'))
  if (within && state?.Type === 'Block') return { within, startAt: state.Processor.StartAt }
  return { within: [], startAt: definition.stateMachine.StartAt }
}

/**
 * A run with what its trace draws: the run as stored, the definition of the version it runs, where its steps are on that
 * graph, and the steps of its trace in the order they ran, followed while the run goes on. Without a run nothing is read.
 */
export const useRunTrace = (runId: string | undefined) => {
  const run = useRecord('workflow_runs', runId ?? '', runId !== undefined)
  const record = run.data?.record
  const versioned = record?.workflow_id != null && record.version != null
  const version = useRecord('workflow_versions', [String(record?.workflow_id ?? ''), Number(record?.version ?? 0)], versioned)
  const going = goingOn.has(String(record?.status))
  const definition = version.data ? definitionOf(version.data.record.definition) : undefined
  const steps = useRunSteps(runId, going)
  useFollow(going)
  useEndRefresh(going)
  return {
    id: runId,
    run: record,
    stored: run.data,
    definition,
    place: placeOf(definition, record?.block_state),
    steps: (steps.data ?? []) satisfies TraceStep[],
    going,
    error: run.error ?? version.error ?? steps.error,
  }
}

export type RunTraceData = ReturnType<typeof useRunTrace>
