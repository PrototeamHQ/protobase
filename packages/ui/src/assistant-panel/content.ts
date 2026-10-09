export const request = 'Add a discount to invoices and show it in the list'

export const migrationSql = `+ALTER TABLE sales.invoices
+  ADD COLUMN discount numeric(5,2) NOT NULL DEFAULT 0;`

export const dataDiff = ` export const invoice = resource('invoice')
   .table('sales.invoices')
   .fields({
     number: f.text().readOnly(),
+    discount: f.decimal({ precision: 5, scale: 2 }).default('0'),
     total: f.decimal({ precision: 10, scale: 2 }),
   })`

export const uiDiff = ` export default view<typeof invoice>('invoice')
   .list((r) => ({
-    columns: [r.number, r.customer, r.total],
+    columns: [r.number, r.customer, r.discount, r.total],
   }))`

export const changedFiles = [
  { path: 'migrations/0042_invoice_discount.sql', diff: migrationSql, start: 1 },
  { path: 'data.ts', diff: dataDiff, start: 14 },
  { path: 'ui.ts', diff: uiDiff, start: 8 },
]

export type StepState = 'done' | 'running' | 'failed'
export type Step = { label: string; state: StepState }
export type CheckState = 'passed' | 'failed' | 'running'
export type Check = { label: string; detail: string; state: CheckState; retry?: boolean }

export const stagesWithChange = ['checks-failed', 'checks-passed', 'preview', 'published'] as const

export const stepsFor = (stage: string): Step[] => {
  if (stage === 'request') return [{ label: 'Reading the invoices schema', state: 'running' }]
  const base: Step[] = [
    { label: 'Read the invoices schema', state: 'done' },
    { label: 'Added a discount column (migration)', state: 'done' },
  ]
  if (stage === 'working') return [...base, { label: 'Adding discount to the invoice list and record view', state: 'running' }]
  const edited: Step = { label: 'Added discount to the invoice list and record view', state: 'done' }
  if (stage === 'checks-failed') return [...base, edited, { label: 'Ran typecheck', state: 'failed' }, { label: 'Fixing the type error', state: 'running' }]
  return [...base, edited, { label: 'Ran typecheck', state: 'done' }]
}

export const checksFor = (stage: string): Check[] => {
  if (stage === 'checks-failed')
    return [
      { label: 'Typecheck', detail: "ui.ts:12 Property 'discout' does not exist", state: 'failed' },
      { label: 'Typecheck, retry', detail: 'Fixing automatically', state: 'running', retry: true },
    ]
  return [
    { label: 'Typecheck', detail: "ui.ts:12 Property 'discout' does not exist", state: 'failed' },
    { label: 'Typecheck, retry', detail: 'Fixed, no errors', state: 'passed', retry: true },
    { label: 'Tests', detail: '48 passed', state: 'passed' },
    { label: 'Load guard', detail: 'No table scans', state: 'passed' },
  ]
}
