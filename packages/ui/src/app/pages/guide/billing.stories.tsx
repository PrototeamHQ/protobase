import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { PageDefinition } from '@protobase/layout'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'
import { defineUi, type ActionContext } from '../project-ui'
import { useLayoutRecord } from '../record-scope'
import { billingAfterWrite, billingResources, billingRows, billingViews } from './billing-domain'
import { billing as step1 } from './billing-steps/step-1'
import { billing as step2 } from './billing-steps/step-2'
import { billing as step3 } from './billing-steps/step-3'
import { billing as step4 } from './billing-steps/step-4'

// The "A billing page" guide on docs.protobase.net embeds these, one per step.

const meta = { title: 'Guides/Billing page', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'ada@northwind.example', name: 'Ada Northwind', role: 'admin' })

/** The custom component behind `<SeatHistory>`: React code in the app, with the record around it. */
const SeatHistory = ({ months }: { months: number }) => {
  const scope = useLayoutRecord()
  const used = Number(scope?.record.seatsUsed ?? 0)
  const history = Array.from({ length: months }, (_, index) => Math.max(1, used - (months - 1 - index)))
  return (
    <figure aria-label="Seat history">
      <div className="flex h-12 items-end gap-1">
        {history.map((seats, index) => (
          <div key={index} className="flex-1 rounded-t-sm bg-primary/60" style={{ height: `${(seats / used) * 100}%` }} title={`${seats} seats`} />
        ))}
      </div>
      <figcaption className="mt-1 text-xs text-muted-foreground">Seats in use, last {months} months</figcaption>
    </figure>
  )
}

/** The handler behind the `download` action, which has no built-in behaviour. */
const download = ({ record }: ActionContext) => {
  document.title = `Downloading ${String(record?.number)}`
}

const ui = defineUi({ components: { SeatHistory }, actions: { download } })

const GuideApp = ({ step, withUi = true }: { step: PageDefinition; withUi?: boolean }) => {
  const [api] = useState(() => fakeApi({ resources: billingResources, views: billingViews, pages: [step.toModel()], rows: billingRows, afterWrite: billingAfterWrite }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/billing" workspace="Northwind Labs" ui={withUi ? ui : undefined} />
    </div>
  )
}

const region = async (canvas: ReturnType<typeof within>, name: string) => within(await canvas.findByRole('region', { name }))

export const Step1: StoryObj = {
  name: '1. Your plan',
  render: () => <GuideApp step={step1} />,
}

export const Step1Checks: StoryObj = {
  ...Step1,
  name: '1. Your plan (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const plan = await region(canvas, 'Your plan')
    expect(await plan.findByText('Team')).toBeVisible()
    expect(await plan.findByText('€72.00')).toBeVisible()
    expect(await plan.findByRole('progressbar', { name: 'Seats' })).toHaveAttribute('aria-valuemax', '10')
    expect(plan.getByText('9 / 10')).toBeVisible()
    expect(plan.getByRole('button', { name: 'Upgrade' })).toBeEnabled()
    await userEvent.click(plan.getByRole('button', { name: 'Cancel plan' }))
    const confirm = await canvas.findByRole('dialog', { name: 'Cancel plan?' })
    expect(within(confirm).getByText('Your plan stays active until the end of the period.')).toBeVisible()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel plan' }))
    expect(await plan.findByText('You have no active plan.')).toBeVisible()
  }}

export const Step2: StoryObj = {
  name: '2. Who we bill',
  render: () => <GuideApp step={step2} />,
}

export const Step2Checks: StoryObj = {
  ...Step2,
  name: '2. Who we bill (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const details = await region(canvas, 'Billing details')
    expect(await details.findByText('Northwind Labs B.V.')).toBeVisible()
    expect(details.getByText('VAT number')).toBeVisible()
    await userEvent.click(details.getByRole('button', { name: 'Edit' }))
    const form = within(await canvas.findByRole('dialog', { name: 'Edit billing details' }))
    const [company] = form.getAllByRole('textbox')
    await userEvent.clear(company!)
    await userEvent.type(company!, 'Northwind Group B.V.')
    await userEvent.click(form.getByRole('button', { name: 'Save' }))
    expect(await details.findByText('Northwind Group B.V.')).toBeVisible()
  }}

export const Step3: StoryObj = {
  name: '3. How they pay',
  render: () => <GuideApp step={step3} />,
}

export const Step3Checks: StoryObj = {
  ...Step3,
  name: '3. How they pay (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cards = await region(canvas, 'Payment methods')
    const items = () => cards.getAllByRole('listitem')
    await waitFor(() => expect(items()).toHaveLength(2))
    expect(within(items()[0]!).getByText('Default card')).toBeVisible()
    await userEvent.click(within(items()[1]!).getByRole('button', { name: 'Make default' }))
    await waitFor(() => expect(within(items()[0]!).getByText('Mastercard')).toBeVisible())
    expect(within(items()[0]!).getByText('Default card')).toBeVisible()
    await userEvent.click(within(items()[1]!).getByRole('button', { name: 'Remove' }))
    await userEvent.click(within(await canvas.findByRole('dialog', { name: 'Remove?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(items()).toHaveLength(1))
    await userEvent.click(cards.getByRole('button', { name: 'Add card' }))
    const form = within(await canvas.findByRole('dialog', { name: 'Add card' }))
    const [brand, last4, expires] = form.getAllByRole('textbox')
    await userEvent.type(brand!, 'Amex')
    await userEvent.type(last4!, '0005')
    await userEvent.type(expires!, '01/30')
    await userEvent.click(form.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(items()).toHaveLength(2))
    expect(within(items()[1]!).getByText('Amex')).toBeVisible()
  }}

export const Step4: StoryObj = {
  name: '4. What they paid',
  render: () => <GuideApp step={step4} />,
}

export const Step4Checks: StoryObj = {
  ...Step4,
  name: '4. What they paid (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('figure', { name: 'Seat history' })).toBeVisible()
    const invoices = await region(canvas, 'Invoices')
    await waitFor(() => expect(invoices.getAllByRole('row')).toHaveLength(6))
    await userEvent.click(invoices.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(invoices.getAllByRole('row')).toHaveLength(4))
    const latest = await region(canvas, 'Latest invoice')
    expect(await latest.findByText('INV-2026-010')).toBeVisible()
    await userEvent.click(latest.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(document.title).toBe('Downloading INV-2026-010'))
    expect(canvas.getByRole('link', { name: 'billing@example.com' })).toHaveAttribute('href', 'mailto:billing@example.com')
  }}

export const MissingComponent: StoryObj = {
  name: 'A custom component the app did not register',
  tags: ['play'],
  render: () => <GuideApp step={step4} withUi={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('No component is registered as SeatHistory. Add it to the components in protobase.ui.tsx.')).toBeVisible()
    const latest = await region(canvas, 'Latest invoice')
    expect(await latest.findByRole('button', { name: 'Download PDF' })).toBeDisabled()
  },
}
