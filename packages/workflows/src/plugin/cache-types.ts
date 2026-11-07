/** How much of a step type's cache its workflow's author decides. */
export type CacheChoice =
  /** Nothing: the type decides alone, or caching makes no sense for it. */
  | 'hidden'
  /** An on and off switch, on unless the workflow turns it off when `default` is true. */
  | 'switch'
  /** The type decides, and the author may force it on. */
  | 'force'
  /** The type decides, and advises against forcing it on with its `disclaimer`. */
  | 'discouraged'

/** A duration such as `10 minutes`, or a number of seconds; at most 30 days. */
export type CacheTtl = string | number

/**
 * A step type's result cache. When it is on for a call, the engine looks up an earlier call of the type with the same
 * key, from any run or workflow, made as the same tenant and, where the type acts as someone, the same person or account.
 */
export type StepCache = {
  choice: CacheChoice
  /** What the editor shows before a workflow forces it on; `discouraged` needs one. */
  disclaimer?: string
  /** For `switch`: on unless the workflow turns it off. Default false. */
  default?: boolean
  /** `return` (default): a hit is the step's result, and `run` is not called. `offer`: `run` gets it as `earlier`. */
  use?: 'return' | 'offer'
  /** Whether this call may use the cache at all, from its input; false looks up and keeps nothing. Default true. */
  when?: (input: Record<string, unknown>) => boolean
  /** How long a result serves, or per input. */
  ttl: CacheTtl | ((input: Record<string, unknown>) => CacheTtl)
  /**
   * What the key covers: `reads` (default) the input values `run` read, `input` the whole input, or the JSON value a
   * function makes of the input; a function that throws or gives no JSON value leaves the call uncached.
   */
  key?: 'reads' | 'input' | ((input: Record<string, unknown>) => unknown)
  /** The services a cached call may act through as a person: `records` (as the saver) and `mailbox` (as the enabler). A call that uses another is not kept. */
  actsAs?: ('records' | 'mailbox')[]
}

/** What an `offer` step gets of the earlier call it may use: its result, when it was kept and until when, and the secrets that changed since. */
export type EarlierResult = { output: unknown; cached_at: string; expires_at: string; secrets_changed: string[] }
