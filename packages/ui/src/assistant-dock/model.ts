import type { Step } from '../assistant-panel/content'

export type PlanSize = 'S' | 'M' | 'L'

/** A plan as the planner returned it and central priced it. */
export type Plan = {
  taskId: string
  /** 1 for the first plan; "Ask for changes" and "Update plan" make the next one. */
  revision: number
  summary: string
  steps: Array<{ title: string; files?: string[] }>
  migrations: Array<{ description: string; destructive: boolean }>
  risks: string[]
  size: PlanSize
  /** The quote: what Approve holds. */
  credits: number
  /** The branch moved on GitHub since the plan was made. */
  outdated: boolean
  /** Tasks behind this one in the app's queue, waiting until it is answered. */
  waiting: number
  /** `dropped`: the platform dropped it and refunded the deposit (repository replaced, app archived). */
  status: 'awaiting' | 'approved' | 'canceled' | 'superseded' | 'dropped'
}

export type JobResult = {
  taskId: string
  outcome: 'live' | 'failed' | 'capped'
  summary: string
  commit?: { sha: string; url?: string }
  /** The migrations the job applied; they stay live when it fails. */
  dbChanges: string[]
  /** A finished change GitHub refused, kept on `protobase/task-<n>`. */
  keptOnBranch?: string
  /** What was charged: the quote when live, 0 otherwise. */
  credits: number
}

export type QueryResult = { sql: string; columns: string[]; rows: unknown[][]; truncated: boolean }

export type DockItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'queue'; id: string; taskId: string; request: string; ahead: number; waitingOnPlan: boolean }
  | { kind: 'progress'; id: string; taskId: string; phase: 'planning' | 'running'; steps: Step[] }
  | { kind: 'plan'; id: string; plan: Plan }
  | { kind: 'result'; id: string; result: JobResult }
  | { kind: 'query'; id: string; query: QueryResult }

export const formatCredits = (credits: number) => `${credits} ${credits === 1 ? 'credit' : 'credits'}`

/** Approve is offered only on a plan awaiting an answer, and only when the balance covers the quote. */
export const approval = (plan: Plan, balance: number) => {
  if (plan.status !== 'awaiting') return { enabled: false }
  if (balance < plan.credits) return { enabled: false, reason: `Needs ${formatCredits(plan.credits)}; the balance is ${formatCredits(balance)}.` }
  return { enabled: true }
}

export const approveLabel = (plan: Plan) => `${plan.outdated ? 'Approve anyway' : 'Approve'} · ${formatCredits(plan.credits)}`

export const queueText = (ahead: number, waitingOnPlan: boolean) => {
  if (waitingOnPlan) return 'Waiting for the plan above to be approved or canceled.'
  if (ahead === 0) return 'Next in line.'
  return `Waiting, ${ahead} ${ahead === 1 ? 'task' : 'tasks'} ahead.`
}

export const waitingText = (waiting: number) => (waiting === 0 ? undefined : `${waiting} ${waiting === 1 ? 'task waits' : 'tasks wait'} on this plan.`)

/** A query cell as text: `null` stays visible, objects and arrays as JSON. */
export const formatCell = (value: unknown) => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
