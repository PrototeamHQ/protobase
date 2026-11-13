import type { Definition } from '../definition/types'
import type { CacheIdentity, TaskCache } from './cache/cache-port'

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
  /** A Block's step: the block's run that gave its result, the one that made the cached entry on a hit. */
  run?: string
  /** A Block's step whose result was an earlier one the cache kept, so its steps did not run. */
  reused?: true
  /** A Block's step that joined a run of the block another visit had started with the same key, instead of starting one. */
  joined?: true
}

/** What a replay takes of a step of the run it replays, as that run's trace keeps it. */
export type ReplayedStep = Pick<StepRecord, 'scope' | 'seq' | 'state' | 'status' | 'attempt' | 'output' | 'error' | 'cause'>

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
  /** The state the scope goes on to, which may be the same one retried; `null` once the scope ended. */
  next: string | null
  /** The next state's input, or the scope's output once it ended. */
  value?: unknown
  variables: Record<string, unknown>
  /** The try of the next state, from 1, and the errors of its earlier tries. */
  attempt: number
  failures: string[]
  /** The visits of each state the scope began so far, which a replay matches its steps by. */
  visits: Record<string, number>
  /** The next state may not run before this time. */
  resumeAt?: Date | null
  /** What `$now` gives the scope's next steps: the time of its last recorded step, its last wait's end, or the run's start. */
  clock: Date
  /** The `seq` of the scope's checkpoint the segment took it up from, -1 for none: a save is refused when a newer one is there. */
  after: number
}

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
  /** The step cache, when the app keeps one; a step type that caches nothing never touches it. */
  cache?: TaskCache
}

/**
 * A step type, which a Task names as its `Resource`: it takes the Task's evaluated `Arguments` and returns its result.
 * It throws a `StepError` to fail with an error name of its own; any other error is `States.TaskFailed`.
 *
 * A call changes the world, such as a mail sent or a record written, unless `writes` says it does not with these
 * arguments: a call that changes the world is recorded, so it never happens twice in a run, and a read is done again
 * after a crash before the next checkpoint.
 */
export type TaskHandler = ((args: unknown, context: TaskContext) => Promise<unknown>) & {
  /** Whether a call with these arguments changes the outside world, never throwing; a replay calls none that does. Absent or anything but `false`: it does. */
  writes?: (args: unknown) => boolean
  /** For a type that signs in through a connection: whether the run may still use its account, as a call would find. */
  connected?: (context: TaskContext) => Promise<boolean>
}

/** The interpreter's back end: the step types by the name a Task's `Resource` gives. */
export type TaskHandlers = Readonly<Record<string, TaskHandler>>

/** A run as the runner loads it: its pinned definition, its input, when it started, and its own trace setting, if any. */
export type LoadedRun = {
  id: string
  definition: Definition
  input: unknown
  status: RunStatus
  startedAt: Date
  trace?: TraceMode | null
  /**
   * The run this one replays, with the definition it ran: its steps that write are not called but give what that
   * run's steps gave, as its trace keeps them; null when that run is gone, so they give nothing. Absent: no replay.
   */
  replayOf?: { id: string; definition: Definition } | null
  /** A block's run: the run that started it, which it wakes as it ends; null for a replay or re-run of one. */
  blockOf?: string | null
  /** A block's run, or a replay or re-run of one: the Block whose processor it runs, of `definition`. */
  blockState?: string | null
}

export type RunStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed'

/** What changes on a run as a segment ends. */
export type RunChange =
  | { status: 'running' }
  | { status: 'waiting'; resumeAt: Date }
  /** `blanked`: the output held a secret, which it keeps blanked out. */
  | { status: 'succeeded'; output: unknown; blanked: boolean }
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
   * Saves checkpoints all or none, each replacing its scope's earlier ones: false when any scope has one newer than
   * the one it follows (`after`), and then none is saved.
   */
  save(db: Db, runId: string, checkpoints: readonly Checkpoint[]): Promise<boolean>
  /** Changes the run unless it has ended already; a run that ends drops its checkpoints. */
  update(db: Db, runId: string, change: RunChange): Promise<void>
}

/**
 * The jobs queue: the second part of the port, which runs a segment of the run at `at`, or as soon as it can; `wake`
 * runs one as soon as it can even when one waits for a later time.
 */
export type SegmentQueue<Db> = { schedule(db: Db, runId: string, at?: Date): Promise<void>; wake(db: Db, runId: string): Promise<void> }

/** A block's run as a run that started or joined it sees it; `joined` when another run started it. */
export type BlockRun = { id: string; status: RunStatus; output?: unknown; error?: string | null; cause?: string | null; finishedAt?: Date | null; blanked?: boolean | null; joined?: boolean }

/** What a block's run that may be shared is shared by: its cache key, and the identity its entry is kept under. */
export type BlockShare = { key: string; identity: CacheIdentity }

/**
 * Where blocks' runs are kept: each is a run of its own, started by a run (`parent`) on one try of one of its Blocks
 * (`visit`), whose tenant, workflow, version and trace setting it takes from that run.
 */
export type BlockRunStore<Db> = {
  /** The run this visit started, else the one it joined. */
  find(db: Db, parent: string, visit: string): Promise<BlockRun | undefined>
  /**
   * Starts it and queues its first segment, or the one of this visit started already; undefined when `state` is no Block
   * of the run's version. With `share`, a run of the same key and identity under way is joined instead of started: it
   * wakes this run too as it ends. With `joinOnly` too, it only joins: undefined when no such run is under way.
   */
  start(db: Db, run: { parent: string; visit: string; state: string; input: unknown; share?: BlockShare; joinOnly?: true }): Promise<BlockRun | undefined>
  /** The runs that joined `run`, to wake as it ends. */
  waiters(db: Db, run: string): Promise<string[]>
  /** The block runs `parent` started. */
  count(db: Db, parent: string): Promise<number>
}

/** Which runs keep a trace: every run, only those that fail, or none. */
export type TraceMode = NonNullable<Definition['trace']>

/**
 * Where runs' traces go, outside the database: each segment hands over the steps it ran, with every input and output,
 * before each checkpoint after them is saved and once it stops. `write` resolves once they are kept, and on the segment that ended the run (`ended`)
 * once the whole trace is, so the runner queues the next segment or ends the run only then and no part comes after the
 * trace is joined; it never rejects, since a trace that cannot be written does not stop the run. With `failed`, a run
 * that succeeded keeps no trace. `read` gives an ended run's steps, as a replay of it takes them: undefined when it kept
 * no trace.
 */
export type TraceSink = {
  write(runId: string, steps: readonly StepRecord[], segment: { mode: TraceMode; ended?: 'succeeded' | 'failed' }): Promise<void>
  read(runId: string): Promise<readonly StepRecord[] | undefined>
}
