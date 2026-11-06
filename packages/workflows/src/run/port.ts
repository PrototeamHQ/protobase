import type { Definition } from '../definition/types'

/**
 * How a step ended: `succeeded`, `retrying` (it failed and a retrier tries it again), `caught` (it failed and a
 * catcher went on elsewhere) or `failed` (nothing caught it, so its scope failed).
 */
export type StepStatus = 'succeeded' | 'retrying' | 'caught' | 'failed'

/** What the runner reads of a saved step to know where its scope stands. */
export type SavedStep = {
  /** The scope the step ran in: `''` for the run itself, `Each.3[0]` for item 0 of the Map `Each` that was step 3. */
  scope: string
  /** The step's number within its scope, from 0: with the scope, the step's key, saved once. */
  seq: number
  state: string
  status: StepStatus
  attempt: number
  output?: unknown
  /** The variables the step assigned. */
  assigned?: Record<string, unknown>
  /** The state its scope goes on to; `null` when the scope ended or failed, or for a try that is retried. */
  next: string | null
  /** The next state may not run before this time: after a Wait, or a retry's delay. */
  resumeAt?: Date | null
  error?: string | null
  cause?: string | null
}

export type StepLog = { at: string; message: string }

/** All a step records: what the runner reads, and its type, input, logs and timing, with every secret redacted. */
export type StepRecord = SavedStep & { type: string; input?: unknown; logs: StepLog[]; startedAt: Date; finishedAt: Date }

/** What a step type's handler gets beside its arguments. */
export type TaskContext = {
  /** The run's id: files a step stores for the run are kept under it. */
  runId: string
  /** Aborted when the step's timeout passes, or when the worker stops. */
  signal: AbortSignal
  /** The same for every retry of one visit of this step in this run, so a receiver that dedupes by it sees a repeated try once; a later visit gets a new one. */
  idempotencyKey: string
  /** Adds a line to the step's logs, with the app's secrets blanked out; a step keeps `limits.logLines` lines. */
  log: (message: string) => void
  /**
   * The text with the app's secrets blanked out. The runner blanks them out of all a step records; a step that cuts a
   * text short, such as an answer's body in an error, blanks it first, so the cut leaves no part of a secret.
   */
  redact: (text: string) => string
  /** Blanks `value` out of all this step and the rest of its segment record, such as an access token it was given. */
  secret: (value: string) => void
}

/**
 * A step type, which a Task names as its `Resource`: it takes the Task's evaluated `Arguments` and returns its result.
 * It throws a `StepError` to fail with an error name of its own; any other error is `States.TaskFailed`.
 */
export type TaskHandler = (args: unknown, context: TaskContext) => Promise<unknown>

/** The interpreter's back end: the step types by the name a Task's `Resource` gives. */
export type TaskHandlers = Readonly<Record<string, TaskHandler>>

/** A run as the runner loads it: its pinned definition, its input and when it started. */
export type LoadedRun = { id: string; definition: Definition; input: unknown; status: RunStatus; startedAt: Date }

export type RunStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed'

/** What changes on a run as a segment ends. */
export type RunChange =
  | { status: 'running' }
  | { status: 'waiting'; resumeAt: Date }
  | { status: 'succeeded'; output: unknown }
  | { status: 'failed'; error: string; cause: string }

/**
 * Where runs and their steps are kept, in the database or transaction `Db` the caller gives: the first part of the
 * runner's port.
 */
export type RunStore<Db> = {
  load(db: Db, runId: string): Promise<LoadedRun | undefined>
  /** Every step the run saved, in each scope's order; the record's input and logs are not needed. */
  steps(db: Db, runId: string): Promise<SavedStep[]>
  /**
   * Saves steps in one guarded statement: false when any of their scopes and seqs is taken already, and those are left
   * as the other segment saved them.
   */
  save(db: Db, runId: string, steps: readonly StepRecord[]): Promise<boolean>
  /** Changes the run unless it has ended already. */
  update(db: Db, runId: string, change: RunChange): Promise<void>
}

/** The jobs queue: the second part of the port, which runs a segment of the run at `at`, or as soon as it can. */
export type SegmentQueue<Db> = { schedule(db: Db, runId: string, at?: Date): Promise<void> }
