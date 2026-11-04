/** The fixed limits of workflows, checked when a definition is saved or while it runs; each fails closed. */
export const limits = {
  /** A definition's size as JSON, and the length of one expression's source. */
  definitionBytes: 256 * 1024,
  expressionLength: 4096,
  /** States in one definition, the ones inside Maps counted. */
  states: 100,
  /** The longest a Task may run before it fails with `States.Timeout`, and its default. */
  taskTimeoutSeconds: 300,
  defaultTaskTimeoutSeconds: 300,
  /** The longest wait one Wait state may give in seconds: 366 days. */
  waitSeconds: 366 * 24 * 3600,
  /** Retries of one retrier after the first try, and the longest wait between two. */
  retryAttempts: 19,
  retryDelaySeconds: 24 * 3600,
  /** Items a Map runs at once; 0 or none means this limit. */
  mapConcurrency: 20,
  /** Items one Map takes. */
  mapItems: 10_000,
  /** Steps one run may take, every attempt and every Map item's steps counted. */
  runSteps: 50_000,
  /** The size of each value a step saves (its input, output and variables), as JSON. */
  valueBytes: 1024 * 1024,
  /** Log lines one step keeps, and the length of each. */
  logLines: 100,
  logLineLength: 1000,
  /** How long one expression may evaluate, and how deep it may nest. */
  expressionMs: 1000,
  expressionDepth: 300,
  /** How long one segment runs steps before it hands the rest of the run to the next segment. */
  segmentMs: 60_000,
  /** A run's input: its size as JSON and how deeply its arrays and objects nest. */
  inputBytes: 1024 * 1024,
  inputDepth: 64,
} as const
