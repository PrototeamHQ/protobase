/** Where runs' traces are served under the API's system path (`/api`). */
export const workflowRunsPath = (systemPath: string) => `${systemPath}/workflows/runs`

/** The name of the run's id in a trace path. */
export const workflowRunParam = 'run'

/** The route of a run's trace under {@link workflowRunsPath}, as the server serves it. */
export const workflowRunTraceRoute = `/:${workflowRunParam}/trace` as const

/** The path of a run's trace, as the run's page reads it. */
export const workflowRunTracePath = (systemPath: string, runId: string) => `${workflowRunsPath(systemPath)}/${encodeURIComponent(runId)}/trace`

/** One step of a run's trace, as the runner wrote it, with every secret blanked out. */
export type WorkflowTraceStep = {
  scope: string
  seq: number
  state: string
  type: string
  status: 'succeeded' | 'retrying' | 'caught' | 'failed'
  attempt: number
  input?: unknown
  output?: unknown
  assigned?: Record<string, unknown>
  next: string | null
  resumeAt?: string | null
  error?: string | null
  cause?: string | null
  logs: { at: string; message: string }[]
  startedAt: string
  finishedAt: string
  recorded: boolean
}

/** A run's trace: its steps in the order they ran, none when the run keeps no trace. */
export type WorkflowRunTrace = { steps: WorkflowTraceStep[] }
