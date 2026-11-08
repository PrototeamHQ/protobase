import type { WorkflowRunTrace, WorkflowTraceStep } from '@protobase/client'
import { createRunner, rerunCheckpoint, rerunFrom, rerunProblem, type Checkpoint, type Definition, type RunStore, type StepRecord, type TaskHandlers, type TraceSink } from '@protobase/workflows'

type Row = Record<string, unknown>

const ended = new Set(['succeeded', 'failed'])

/**
 * The workflow runner of `@protobase/workflows` over the fake API's rows, for stories: a run created through the fake
 * API is given its workflow's version and, for a re-run or a replay, the earlier run's input, and for a re-run the
 * earlier run's checkpoints, as the server's trigger and start hook do; then its segments run on timers, keeping
 * checkpoints and traces in memory and changing the run as the server does. `trace` reads a run's trace as the API
 * serves it. A saved workflow whose definition changed gets its next version.
 */
export const fakeWorkflowEngine = ({ tables, tasks, secrets }: { tables: () => Record<string, Row[]>; tasks: TaskHandlers; secrets?: Record<string, string> }) => {
  let runs = 0
  const checkpoints = new Map<string, Checkpoint[]>()
  const traces = new Map<string, WorkflowTraceStep[]>()
  const table = (name: string) => (tables()[name] ??= [])
  // A form writes a relation's key as text, so keys compare as text
  const same = (a: unknown, b: unknown) => String(a) === String(b)
  const runOf = (id: string) => table('workflow_runs').find((row) => same(row.id, id))!
  const definitionOf = (run: Row) => table('workflow_versions').find((row) => same(row.workflow_id, run.workflow_id) && row.version === run.version)!.definition as Definition
  const store: RunStore<null> = {
    load: async (_, id) => {
      const run = runOf(id)
      return { id, definition: definitionOf(run), input: run.input, status: run.status as 'queued', startedAt: new Date(String(run.created_at)), ...(run.replay === true && { replayOf: { id: String(run.rerun_of), definition: definitionOf(runOf(String(run.rerun_of))) } }) }
    },
    checkpoints: async (_, id) => structuredClone(checkpoints.get(id) ?? []),
    save: async (_, id, saved) => {
      const kept = checkpoints.get(id) ?? []
      if (saved.some((checkpoint) => kept.some((other) => other.scope === checkpoint.scope && other.seq > checkpoint.after))) return false
      checkpoints.set(id, [...kept.filter((other) => !saved.some((checkpoint) => checkpoint.scope === other.scope)), ...structuredClone(saved)])
      return true
    },
    update: async (_, id, change) => {
      const run = runOf(id)
      if (ended.has(String(run.status))) return
      if (change.status === 'succeeded') checkpoints.delete(id)
      const finished = ended.has(change.status) ? new Date() : undefined
      Object.assign(run, {
        status: change.status,
        resume_at: change.status === 'waiting' ? change.resumeAt.toISOString() : null,
        output: change.status === 'succeeded' ? change.output : null,
        error: change.status === 'failed' ? change.error : null,
        cause: change.status === 'failed' ? change.cause : null,
        finished_at: finished?.toISOString() ?? null,
        duration_ms: finished ? finished.getTime() - Date.parse(String(run.created_at)) : null,
      })
    },
  }
  // Each run's steps as JSON gives them, the way the API serves its trace.
  const trace: TraceSink = {
    write: async (id, steps, { mode, ended: end }) => {
      if (mode === 'none') return
      if (mode === 'failed' && end === 'succeeded') return void traces.delete(id)
      traces.set(id, [...(traces.get(id) ?? []), ...(JSON.parse(JSON.stringify(steps)) as WorkflowTraceStep[])])
    },
    read: async (id) => traces.get(id) as never,
  }
  const segment = (id: string) => void runner.segment(null, id, new AbortController().signal)
  const runner = createRunner({ store, queue: { schedule: async (_, id, at) => void setTimeout(() => segment(id), at ? Math.max(0, at.getTime() - Date.now()) : 50) }, tasks, trace, ...(secrets && { secrets }) })

  return {
    /** Before a run is created: its id, status, version and start, and a re-run's or a replay's input, as the table's trigger sets them. */
    beforeWrite: (resource: string, row: Row) => {
      if (resource !== 'workflow_runs' || row.status !== undefined) return
      const workflow = table('workflows').find((candidate) => same(candidate.id, row.workflow_id))!
      const earlier = row.rerun_of == null ? undefined : runOf(String(row.rerun_of))
      // A form writes a boolean as text.
      const replay = row.replay === true || row.replay === 'true'
      Object.assign(row, { id: `run-${++runs}`, status: 'queued', version: row.version ?? (earlier ? workflow.version : (workflow.enabled_version ?? workflow.version)), replay: replay || null, created_at: new Date().toISOString(), started_by: 'u-ada', ...(earlier && { input: earlier.input }) })
    },
    /** After a write: a changed workflow's next version, and a new run started, a re-run from the earlier run's checkpoints, or from a step of its trace. */
    afterWrite: (resource: string, row: Row) => {
      if (resource === 'workflows') {
        const versions = table('workflow_versions').filter((version) => same(version.workflow_id, row.id))
        const last = versions.at(-1)
        if (last && JSON.stringify(last.definition) === JSON.stringify(row.definition)) return
        row.version = versions.length + 1
        table('workflow_versions').push({ workflow_id: row.id, version: row.version, definition: structuredClone(row.definition), saved_by: 'u-ada', saved_at: new Date().toISOString() })
        return
      }
      if (resource !== 'workflow_runs') return
      const id = String(row.id)
      if (row.rerun_of != null && row.replay !== true) {
        const earlier = String(row.rerun_of)
        if (row.rerun_from == null) {
          const kept = checkpoints.get(earlier) ?? []
          const problem = rerunProblem(definitionOf(row).stateMachine, kept)
          if (problem) throw new Error(problem)
          checkpoints.set(id, kept.map((checkpoint) => rerunCheckpoint(structuredClone(checkpoint), new Date(String(row.created_at)))))
        } else {
          // As the server does: the steps before the state stay, folded into the checkpoint the re-run goes on from
          const steps = (traces.get(earlier) ?? []) as unknown as StepRecord[]
          const from = rerunFrom(definitionOf(row).stateMachine, definitionOf(runOf(earlier)).stateMachine, steps, String(row.rerun_from), new Date(String(row.created_at)))
          if ('problem' in from) throw new Error(from.problem)
          if (from.checkpoint) checkpoints.set(id, [from.checkpoint])
          traces.set(id, JSON.parse(JSON.stringify(from.kept)) as WorkflowTraceStep[])
        }
      }
      void runner.start(null, id)
    },
    /** A run's whole trace, which `fakeApi` serves after the steps the page has. */
    trace: async (id: string): Promise<Pick<WorkflowRunTrace, 'steps'>> => ({ steps: structuredClone(traces.get(id) ?? []) }),
  }
}
