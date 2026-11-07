import { createRunner, rerunSteps, type Definition, type RunStore, type SavedStep, type TaskHandlers } from '@protobase/workflows'

type Row = Record<string, unknown>

const ended = new Set(['succeeded', 'failed'])

/**
 * The workflow runner of `@protobase/workflows` over the fake API's rows, for stories: a run created through the fake
 * API is given its workflow's version and, for a re-run, the earlier run's input and the steps a re-run keeps (for a
 * replay, that run's version and input), as the
 * server's trigger and start hook do; then its segments run on timers, saving steps and changing the run as the server
 * does. A saved workflow whose definition changed gets its next version.
 */
export const fakeWorkflowEngine = ({ tables, tasks, secrets }: { tables: () => Record<string, Row[]>; tasks: TaskHandlers; secrets?: Record<string, string> }) => {
  let runs = 0
  let steps = 1000
  const table = (name: string) => (tables()[name] ??= [])
  // A form writes a relation's key as text, so keys compare as text
  const same = (a: unknown, b: unknown) => String(a) === String(b)
  const runOf = (id: string) => table('workflow_runs').find((row) => same(row.id, id))!
  const definitionOf = (run: Row) => table('workflow_versions').find((row) => same(row.workflow_id, run.workflow_id) && row.version === run.version)!.definition as Definition
  const savedOf = (row: Row): SavedStep & { id: unknown } => ({
    id: row.id,
    scope: String(row.scope),
    seq: Number(row.seq),
    state: String(row.state),
    status: row.status as SavedStep['status'],
    attempt: Number(row.attempt),
    output: row.output,
    assigned: row.assigned as Record<string, unknown> | undefined,
    next: (row.next as string | null) ?? null,
    resumeAt: row.resume_at ? new Date(String(row.resume_at)) : null,
  })
  const store: RunStore<null> = {
    load: async (_, id) => {
      const run = runOf(id)
      return { id, definition: definitionOf(run), input: run.input, status: run.status as 'queued', startedAt: new Date(String(run.created_at)), ...(run.replay === true && { replayOf: String(run.rerun_of) }) }
    },
    steps: async (_, id) => table('workflow_steps').filter((row) => row.run_id === id).map(savedOf),
    save: async (_, id, records) => {
      const taken = (scope: string, seq: number) => table('workflow_steps').some((row) => row.run_id === id && row.scope === scope && row.seq === seq)
      if (records.some((step) => taken(step.scope, step.seq))) return false
      for (const step of records) {
        const { startedAt, finishedAt, resumeAt, ...rest } = step
        table('workflow_steps').push({ ...rest, id: ++steps, run_id: id, resume_at: resumeAt?.toISOString() ?? null, started_at: startedAt.toISOString(), finished_at: finishedAt.toISOString(), duration_ms: finishedAt.getTime() - startedAt.getTime() })
      }
      return true
    },
    update: async (_, id, change) => {
      const run = runOf(id)
      if (ended.has(String(run.status))) return
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
  const segment = (id: string) => void runner.segment(null, id, new AbortController().signal)
  const runner = createRunner({ store, queue: { schedule: async (_, id, at) => void setTimeout(() => segment(id), at ? Math.max(0, at.getTime() - Date.now()) : 50) }, tasks, ...(secrets && { secrets }) })

  return {
    /** Before a run is created: its id, status, version and start, and a re-run's or a replay's input, as the table's trigger sets them. */
    beforeWrite: (resource: string, row: Row) => {
      if (resource !== 'workflow_runs' || row.status !== undefined) return
      const workflow = table('workflows').find((candidate) => same(candidate.id, row.workflow_id))!
      const earlier = row.rerun_of == null ? undefined : runOf(String(row.rerun_of))
      // A form writes a boolean as text.
      const replay = row.replay === true || row.replay === 'true'
      Object.assign(row, { id: `run-${++runs}`, status: 'queued', version: replay ? earlier!.version : workflow.version, replay: replay || null, created_at: new Date().toISOString(), started_by: 'u-ada', ...(earlier && { input: earlier.input }) })
    },
    /** After a write: a changed workflow's next version, and a new run started, a re-run after the steps it keeps. */
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
        const earlier = table('workflow_steps').filter((step) => same(step.run_id, row.rerun_of))
        const kept = rerunSteps(definitionOf(row).stateMachine, earlier.map(savedOf))
        if ('problem' in kept) throw new Error(kept.problem)
        const ids = new Set(kept.steps.map((step) => step.id))
        table('workflow_steps').push(...earlier.filter((step) => ids.has(step.id)).map((step) => ({ ...structuredClone(step), id: ++steps, run_id: id, etag: undefined })))
      }
      void runner.start(null, id)
    },
  }
}
