/** The fixed limits of workflows, checked when a definition is saved or while it runs. */
export const limits = {
  /** The longest a Task may run before it fails with `States.Timeout`; the default is a minute. */
  taskTimeoutSeconds: 300,
  defaultTaskTimeoutSeconds: 60,
  /** The longest wait one Wait state may give in seconds: 366 days. */
  waitSeconds: 366 * 24 * 3600,
  /** Retries of one retrier, and the longest wait between two. */
  retryAttempts: 20,
  retryDelaySeconds: 24 * 3600,
  /** Items a Map runs at once; 0 or none means this limit. */
  mapConcurrency: 20,
  parallelBranches: 20,
  /** Items one Map takes. */
  mapItems: 10_000,
  /** Steps one run may take, every attempt and every Map item's steps counted. */
  runSteps: 50_000,
  /** The size of each value a step saves (its input, output and variables), as JSON. */
  valueBytes: 1024 * 1024,
  /** How long one expression may evaluate, and how deep it may nest. */
  expressionMs: 1000,
  expressionDepth: 300,
  /** How long one segment runs steps before it hands the rest of the run to the next segment. */
  segmentMs: 60_000,
} as const
