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
export type TaskState = Common & Flow & { Type: 'Task'; Resource: string; Arguments?: Template; TimeoutSeconds?: number; Retry?: Retrier[]; Catch?: Catcher[] }
export type ChoiceRule = { Condition: string; Next: string; Comment?: string; Output?: Template; Assign?: Record<string, Template> }
export type ChoiceState = Common & { Type: 'Choice'; Choices: ChoiceRule[]; Default?: string }
export type WaitState = Common & Flow & { Type: 'Wait'; Seconds?: number | string; Timestamp?: string }
export type SucceedState = Omit<Common, 'Assign'> & { Type: 'Succeed' }
export type FailState = Omit<Common, 'Output' | 'Assign'> & { Type: 'Fail'; Error?: string; Cause?: string }
export type MapState = Common &
  Flow & { Type: 'Map'; Items: Template; ItemProcessor: Machine; MaxConcurrency?: number; Retry?: Retrier[]; Catch?: Catcher[] }

export type State = PassState | TaskState | ChoiceState | WaitState | SucceedState | FailState | MapState

/** States and where they start: a whole state machine, or a Map's item processor. */
export type Machine = { StartAt: string; States: Record<string, State>; Comment?: string }

/** The state machine of a workflow: the States Language with JSONata expressions, in the named-reads profile. */
export type StateMachine = Machine & { QueryLanguage: 'JSONata' }

/** What starts a workflow's runs: exactly one of these keys. */
export type Trigger =
  | { webhook: Record<string, never> }
  | { schedule: { cron: string; timezone?: string } }
  | { mail: { mailbox: string } }
  | { record: { events: string[] } }
  | { manual: Record<string, never> }

/** A workflow definition: its trigger, and the state machine a run runs from `StartAt`. */
export type Definition = { trigger: Trigger; stateMachine: StateMachine }
