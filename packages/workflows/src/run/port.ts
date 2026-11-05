import type { Definition } from '../definition/types'

/**
 * How a step ended: `succeeded`, `retrying` (it failed and a retrier tries it again), `caught` (it failed and a
 * catcher went on elsewhere) or `failed` (nothing caught it, so its scope failed).
 */
export type StepStatus = 'succeeded' | 'retrying' | 'caught' | 'failed'

export type StepLog = { at: string; message: string }

/**
 * One step as a run's trace keeps it: its scope (`''` for the run itself, `Each.3[0]` for item 0 of the Map `Each` that
 * was step 3), its number within the scope, its state, type, try, status, input, output, assigned variables, the state it
 * goes on to, logs and timing, with every secret redacted. `recorded` when the step made a checkpoint of its own.
 */
export type StepRecord = {
  scope: string
  seq: number
  state: string
  type: string
  status: StepStatus
  attempt: number
  input?: unknown
  output?: unknown
  assigned?: Record<string, unknown>
  /** The state its scope goes on to; `null` when the scope ended or failed, or for a try that is retried. */
  next: string | null
  /** The next state may not run before this time: after a Wait, or a retry's delay. */
  resumeAt?: Date | null
  error?: string | null
  cause?: string | null
  logs: StepLog[]
  startedAt: Date
  finishedAt: Date
  recorded: boolean
}

/**
 * Where one scope stands, as a checkpoint saves it: all a later segment needs to take the scope up without running its
 * earlier steps again. It names the step that made it, and holds the state the scope goes on to with that state's input
 * (or the scope's output once it ended), its variables, the try and earlier errors of a state being retried, and the
 * clock its next steps read as `$now`.
 */
export type Checkpoint = {
  scope: string
  /** The number of the step that made it, within its scope: with the scope, its key. */
  seq: number
  /** The step that made it: its state, type and status. */
  state: string
  type: string
  status: StepStatus
  /** When that step ended: for a Task, when its result was fetched. */
  fetchedAt: Date
  /** The state the scope goes on to, which may be the same one retried; `null` once the scope ended or failed. */
  next: string | null
  /** The next state's input, or the scope's output once it ended. */
  value?: unknown
  variables: Record<string, unknown>
  /** The try of the next state, from 1, and the errors of its earlier tries. */
  attempt: number
  failures: string[]
  /** The next state may not run before this time. */
  resumeAt?: Date | null
  /** What `$now` gives the scope's next steps: the time of its last recorded step, its last wait's end, or the run's start. */
  clock: Date
  error?: string | null
  cause?: string | null
  /** The `seq` of the scope's checkpoint the segment took it up from, -1 for none: a save is refused when a newer one is there. */
  after: number
}

/** What a step type's handler gets beside its arguments. */
export type TaskContext = {
  /** The run's id: files a step stores for the run are kept under it. */
  runId: string
  /** Aborted when the step's timeout passes, or when the worker stops. */
  signal: AbortSignal
  /** The same for every try of this step in this run: a receiver that dedupes by it sees a repeated try once. */
  idempotencyKey: string
  /** Adds a line to the step's logs, with the app's secrets blanked out; a step keeps `limits.logLines` lines. */
  log: (message: string) => void
  /**
   * The text with the app's secrets blanked out. The runner blanks them out of all a step records; a step that cuts a
   * text short, such as an answer's body in an error, blanks it first, so the cut leaves no part of a secret.
   */
  redact: (text: string) => string
}

/**
 * A step type, which a Task names as its `Resource`: it takes the Task's evaluated `Arguments` and returns its result.
 * It throws a `StepError` to fail with an error name of its own; any other error is `States.TaskFailed`.
 *
 * A call changes the world, such as a mail sent or a record written, unless `reads` says it only reads with these
 * arguments: a call that changes the world is recorded, so it never happens twice in a run, and a read is done again
 * after a crash before the next checkpoint. `doNotRepeat` records a read too, for one whose result expires or works
 * once, such as a signed URL; a Task's own `DoNotRepeat` overrides it.
 */
export type TaskHandler = ((args: unknown, context: TaskContext) => Promise<unknown>) & { reads?: (args: unknown) => boolean; doNotRepeat?: boolean }

/** The interpreter's back end: the step types by the name a Task's `Resource` gives. */
export type TaskHandlers = Readonly<Record<string, TaskHandler>>

/** A run as the runner loads it: its pinned definition, its input, when it started, and its own trace setting, if any. */
export type LoadedRun = { id: string; definition: Definition; input: unknown; status: RunStatus; startedAt: Date; trace?: TraceMode | null }

export type RunStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed'

/** What changes on a run as a segment ends. */
export type RunChange =
  | { status: 'running' }
  | { status: 'waiting'; resumeAt: Date }
  | { status: 'succeeded'; output: unknown }
  | { status: 'failed'; error: string; cause: string }

/**
 * Where runs and their checkpoints are kept, in the database or transaction `Db` the caller gives: the first part of the
 * runner's port.
 */
export type RunStore<Db> = {
  load(db: Db, runId: string): Promise<LoadedRun | undefined>
  /** The latest checkpoint of each scope of the run. */
  checkpoints(db: Db, runId: string): Promise<Checkpoint[]>
  /**
   * Saves checkpoints in one guarded statement, each replacing its scope's earlier ones: false when any scope has one
   * newer than the one it follows (`after`), and those are left as the other segment saved them.
   */
  save(db: Db, runId: string, checkpoints: readonly Checkpoint[]): Promise<boolean>
  /** Changes the run unless it has ended already; a run that ends drops its checkpoints. */
  update(db: Db, runId: string, change: RunChange): Promise<void>
}

/** The jobs queue: the second part of the port, which runs a segment of the run at `at`, or as soon as it can. */
export type SegmentQueue<Db> = { schedule(db: Db, runId: string, at?: Date): Promise<void> }

/** Which runs keep a trace: every run, only those that fail, or none. */
export type TraceMode = NonNullable<Definition['trace']>

/**
 * Where runs' traces go, outside the database: each segment hands over the steps it ran, with every input and output,
 * once its checkpoints are saved, and returns at once, so writing them never holds up the run. `ended` on the segment
 * that ended the run; with `failed`, a run that succeeded keeps no trace.
 */
export type TraceSink = { write(runId: string, steps: readonly StepRecord[], segment: { mode: TraceMode; ended?: 'succeeded' | 'failed' }): void }
