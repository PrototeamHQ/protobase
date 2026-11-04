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
export type SucceedState = Common & { Type: 'Succeed' }
export type FailState = Omit<Common, 'Output' | 'Assign'> & { Type: 'Fail'; Error?: string; Cause?: string }
export type MapState = Common &
  Flow & { Type: 'Map'; Items: Template; ItemProcessor: Machine; MaxConcurrency?: number; Retry?: Retrier[]; Catch?: Catcher[] }
export type ParallelState = Common & Flow & { Type: 'Parallel'; Arguments?: Template; Branches: Machine[]; Retry?: Retrier[]; Catch?: Catcher[] }

export type State = PassState | TaskState | ChoiceState | WaitState | SucceedState | FailState | MapState | ParallelState

/** States and where they start: a whole definition, a Map's item processor or one of a Parallel's branches. */
export type Machine = { StartAt: string; States: Record<string, State>; Comment?: string }

/** A workflow definition: the States Language with JSONata expressions, in the named-reads profile. */
export type Definition = Machine & { QueryLanguage: 'JSONata'; Version?: string }
