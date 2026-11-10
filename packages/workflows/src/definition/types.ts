/** A value written in a definition: JSON, where a string `{% ... %}` is a JSONata expression evaluated when the state runs. */
export type Template = unknown

export type Retrier = {
  ErrorEquals: string[]
  IntervalSeconds?: number
  MaxAttempts?: number
  BackoffRate?: number
  MaxDelaySeconds?: number
}

export type Catcher = { ErrorEquals: string[]; Next: string; Output?: Template; Assign?: Record<string, Template> }

type Common = { Comment?: string; Output?: Template; Assign?: Record<string, Template>; QueryLanguage?: 'JSONata' }
type Flow = { Next?: string; End?: boolean }

export type PassState = Common & Flow & { Type: 'Pass' }
/**
 * `Cache` turns its step type's result cache on (`true`, forced when the type does not offer it) or off (`false`);
 * without it, the type decides.
 */
export type TaskState = Common & Flow & { Type: 'Task'; Resource: string; Arguments?: Template; TimeoutSeconds?: number; Cache?: boolean; Retry?: Retrier[]; Catch?: Catcher[] }
export type ChoiceRule = { Condition: string; Next: string; Comment?: string; Output?: Template; Assign?: Record<string, Template> }
export type ChoiceState = Common & { Type: 'Choice'; Choices: ChoiceRule[]; Default?: string }
export type WaitState = Common & Flow & { Type: 'Wait'; Seconds?: number | string; Timestamp?: string }
export type SucceedState = Omit<Common, 'Assign'> & { Type: 'Succeed' }
export type FailState = Omit<Common, 'Output' | 'Assign'> & { Type: 'Fail'; Error?: string; Cause?: string }
export type MapState = Common &
  Flow & { Type: 'Map'; Items: Template; ItemProcessor: Machine; MaxConcurrency?: number; Retry?: Retrier[]; Catch?: Catcher[] }

/**
 * A block's cache: how long a result serves (a duration such as `1 hour`, or seconds; at most 30 days), and an optional
 * key whose value, as JSON, replaces the default key: the values of its input its steps read.
 */
export type BlockCache = { Ttl: string | number; Key?: Template }
/**
 * Steps wrapped into one: its `Processor` runs as a run of its own on the evaluated `Arguments` as that run's input, once
 * while its key stays the same, its result cached for `Cache.Ttl`.
 */
export type BlockState = Common & Flow & { Type: 'Block'; Arguments?: Template; Processor: Machine; Cache: BlockCache; Retry?: Retrier[]; Catch?: Catcher[] }

export type State = PassState | TaskState | ChoiceState | WaitState | SucceedState | FailState | MapState | BlockState

/** States and where they start: a whole state machine, or a Map's item processor. */
export type Machine = { StartAt: string; States: Record<string, State>; Comment?: string }

/** The state machine of a workflow: the States Language with JSONata expressions, in the named-reads profile. */
export type StateMachine = Machine & { QueryLanguage: 'JSONata' }

/** What starts a workflow's runs: one key, `manual` or a trigger type `<plugin>:<key>`, holding its input. */
export type Trigger = { manual?: Record<string, unknown>; [type: `${string}:${string}`]: Record<string, unknown> }

/**
 * A workflow definition: its trigger, the state machine a run runs from `StartAt`, the connected account each
 * connection `<plugin>:<connection>` of its types signs in with, by the account's id, and which of its runs keep a
 * trace (`all`, `failed` or `none`), when it says, over the app's default.
 */
export type Definition = { trigger: Trigger; stateMachine: StateMachine; connections?: Record<string, string>; trace?: 'all' | 'failed' | 'none' }
