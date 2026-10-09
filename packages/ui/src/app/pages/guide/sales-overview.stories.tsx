import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { PageDefinition } from '@protobase/layout'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'
import { salesResources, salesRows, salesViews } from './sales-domain'
import { overview as step1 } from './sales-steps/step-1'
import { overview as step2 } from './sales-steps/step-2'
import { overview as step3 } from './sales-steps/step-3'
import { overview as step4 } from './sales-steps/step-4'

// The "Your first composed page" guide on docs.protobase.net embeds these, one per step.

const meta = { title: 'Guides/Sales overview', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

const GuideApp = ({ step }: { step: PageDefinition }) => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views: salesViews, pages: [step.toModel()], rows: salesRows }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/overview" workspace="Veldhuis Supply" />
    </div>
  )
}

const statValue = async (canvas: ReturnType<typeof within>, label: string) => {
  const card = (await canvas.findByText(label)).closest('section')!
  return within(card as HTMLElement)
}

export const Step1: StoryObj = {
  name: '1. Four numbers',
  render: () => <GuideApp step={step1} />,
}

export const Step1Checks: StoryObj = {
  ...Step1,
  name: '1. Four numbers (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Sales overview' })
    expect(await (await statValue(canvas, 'Draft orders')).findByRole('link', { name: '2' })).toHaveAttribute('href', `/orders?filter=${encodeURIComponent("status = 'draft'")}`)
    expect(await (await statValue(canvas, 'Delivered, not paid')).findByRole('link', { name: '2' })).toBeVisible()
    expect(await (await statValue(canvas, 'Overdue invoices')).findByRole('link', { name: '3' })).toBeVisible()
    expect(await (await statValue(canvas, 'Open leads')).findByRole('link', { name: '3' })).toBeVisible()
  }}

export const Step2: StoryObj = {
  name: '2. The lists behind the numbers',
  render: () => <GuideApp step={step2} />,
}

export const Step2Checks: StoryObj = {
  ...Step2,
  name: '2. The lists behind the numbers (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const overdue = within(await canvas.findByRole('region', { name: 'Overdue invoices' }))
    expect(await overdue.findByRole('link', { name: 'INV-1101' })).toHaveAttribute('href', '/invoices/1')
    expect(await overdue.findByText('Hollis & Rowe')).toBeVisible()
    expect(overdue.queryByText('INV-1103')).toBeNull()
    await userEvent.click(overdue.getByRole('button', { name: 'Next page' }))
    expect(await overdue.findByRole('link', { name: 'INV-1103' })).toBeVisible()
    expect(overdue.getByText('Page 2')).toBeVisible()
    const latest = within(await canvas.findByRole('region', { name: 'Latest orders' }))
    expect(await latest.findAllByRole('row')).toHaveLength(6)
  }}

export const Step3: StoryObj = {
  name: '3. One order to chase',
  render: () => <GuideApp step={step3} />,
}

export const Step3Checks: StoryObj = {
  ...Step3,
  name: '3. One order to chase (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = within(await canvas.findByRole('region', { name: 'Biggest unpaid delivery' }))
    expect(await card.findByText('SO-2045')).toBeVisible()
    expect(await card.findByText('Leeds')).toBeVisible()
    expect(await card.findByText(/The customer has gone quiet/)).toBeVisible()
    await userEvent.click(card.getByRole('button', { name: 'Mark as paid' }))
    const confirm = await canvas.findByRole('dialog', { name: 'Mark as paid?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Mark as paid' }))
    expect(await card.findByText('SO-2046')).toBeVisible()
    expect(await card.findByText('Utrecht')).toBeVisible()
    await waitFor(() => expect(card.queryByText(/The customer has gone quiet/)).toBeNull())
    expect(await (await statValue(canvas, 'Delivered, not paid')).findByRole('link', { name: '1' })).toBeVisible()
  }}

export const Step4: StoryObj = {
  name: '4. Leads, and a way to add them',
  render: () => <GuideApp step={step4} />,
}

export const Step4Checks: StoryObj = {
  ...Step4,
  name: '4. Leads, and a way to add them (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const leads = within(await canvas.findByRole('region', { name: 'New leads' }))
    await waitFor(() => expect(leads.getAllByRole('listitem')).toHaveLength(3))
    await userEvent.click(leads.getByRole('button', { name: 'Add lead' }))
    const form = within(await canvas.findByRole('dialog', { name: 'Add lead' }))
    const [name, city, email] = form.getAllByRole('textbox')
    await userEvent.type(name!, 'Tulip Labs')
    await userEvent.type(city!, 'Delft')
    await userEvent.type(email!, 'hello@tulip.example')
    await userEvent.click(form.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(leads.getAllByRole('listitem')).toHaveLength(4))
    expect(leads.getByText('Tulip Labs')).toBeVisible()
    expect(await (await statValue(canvas, 'Open leads')).findByRole('link', { name: '4' })).toBeVisible()
    const first = within(leads.getAllByRole('listitem')[0]!)
    await userEvent.click(first.getByRole('button', { name: 'Edit' }))
    const edit = within(await canvas.findByRole('dialog', { name: 'Edit' }))
    await userEvent.selectOptions(edit.getByRole('combobox'), 'active')
    await userEvent.click(edit.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(leads.getAllByRole('listitem')).toHaveLength(3))
  }}
