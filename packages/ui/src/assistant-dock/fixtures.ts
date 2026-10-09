import type { DockItem, JobResult, Plan, QueryResult } from './model'

/** Story data: one discount change to an invoice app, in each state the dock shows. */
export const request = 'Add a discount to invoices and show it in the list'

export const plan: Plan = {
  taskId: 't7',
  revision: 1,
  summary: 'Add a discount to invoices and show it in the invoice list.',
  steps: [
    { title: 'Migration: invoices.discount numeric(5,2) not null default 0', files: ['db/migrations/006_discount.sql'] },
    { title: 'discount field in config/invoices/data.ts', files: ['config/invoices/data.ts'] },
    { title: 'Discount column in the invoice list', files: ['config/invoices/ui.ts'] },
  ],
  migrations: [{ description: 'Add column invoices.discount', destructive: false }],
  risks: ['The totals view must include the discount'],
  size: 'S',
  credits: 3,
  outdated: false,
  waiting: 0,
  status: 'awaiting',
}

export const destructivePlan: Plan = {
  ...plan,
  taskId: 't8',
  summary: 'Drop the unused fax column from customers.',
  steps: [{ title: 'Migration: drop customers.fax' }, { title: 'Remove fax from config/customers' }],
  migrations: [{ description: 'Drop column customers.fax and its data', destructive: true }],
  risks: [],
}

export const live: JobResult = {
  taskId: 't7',
  outcome: 'live',
  summary: 'Invoices have a discount, shown in the list and on the record.',
  commit: { sha: '3f9c2a1d8e7b6a5c4d3e2f1a0b9c8d7e6f5a4b3c', url: 'https://github.com/example/invoices/commit/3f9c2a1' },
  dbChanges: ['006_discount.sql'],
  credits: 3,
}

export const failedAfterMigration: JobResult = {
  taskId: 't7',
  outcome: 'failed',
  summary: 'The typecheck kept failing after two fix rounds.',
  dbChanges: ['006_discount.sql'],
  credits: 0,
}

export const pushRefused: JobResult = {
  ...failedAfterMigration,
  summary: 'Someone pushed to GitHub during the change, and merging it conflicted.',
  commit: { sha: '8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b' },
  keptOnBranch: 'protobase/task-7',
}

export const capped: JobResult = { taskId: 't7', outcome: 'capped', summary: 'The change ran out of steps before the checks passed.', dbChanges: [], credits: 0 }

export const query: QueryResult = {
  sql: 'select number, customer, total, paid_at from sales.invoices order by total desc limit 4',
  columns: ['number', 'customer', 'total', 'paid_at'],
  rows: [
    ['INV-0042', 'Acme BV', '1250.00', '2026-09-30'],
    ['INV-0039', 'Brightside', '980.50', null],
    ['INV-0037', 'Acme BV', '640.00', '2026-09-12'],
    ['INV-0031', 'Northwind', '410.25', null],
  ],
  truncated: false,
}

export const conversation: DockItem[] = [
  { kind: 'user', id: 'm1', text: 'Which invoices are still unpaid?' },
  { kind: 'query', id: 'q1', query },
  { kind: 'assistant', id: 'm2', text: 'Two of the four largest invoices are unpaid: INV-0039 from Brightside and INV-0031 from Northwind.' },
  { kind: 'user', id: 'm3', text: request },
  { kind: 'plan', id: 'p1', plan: { ...plan, waiting: 1 } },
  { kind: 'user', id: 'm4', text: 'Also email a reminder for unpaid invoices every Monday' },
  { kind: 'queue', id: 'w1', taskId: 't9', request: 'Email a reminder for unpaid invoices every Monday', ahead: 1, waitingOnPlan: true },
]
