import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { capped, failedAfterMigration, live, pushRefused, query } from './fixtures'
import { ProgressCard } from './progress-card'
import { QueryCard } from './query-card'
import { QueueCard } from './queue-card'
import { ResultCard } from './result-card'

const meta = {
  title: 'Assistant/Dock/Cards',
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[348px]"><Story /></div>],
} satisfies Meta

export default meta
type Story = StoryObj

const cancel = fn()

export const QueueWaitingOnPlan: Story = {
  tags: ['play'],
  render: () => <QueueCard taskId="t9" request="Email a reminder for unpaid invoices every Monday" ahead={1} waitingOnPlan onCancel={cancel} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByText('Waiting for the plan above to be approved or canceled.')
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    expect(cancel).toHaveBeenCalledWith('t9')
  },
}
export const QueueAhead: Story = { render: () => <QueueCard taskId="t9" request="Email a reminder for unpaid invoices every Monday" ahead={2} waitingOnPlan={false} /> }

export const Planning: Story = { render: () => <ProgressCard phase="planning" steps={[{ label: 'Reading the invoices schema', state: 'running' }]} /> }
export const Running: Story = {
  render: () => (
    <ProgressCard
      phase="running"
      steps={[
        { label: 'Added a discount column (migration)', state: 'done' },
        { label: 'Ran typecheck', state: 'failed' },
        { label: 'Fixing the type error', state: 'running' },
      ]}
    />
  ),
}

export const Live: Story = {
  tags: ['play'],
  render: () => <ResultCard result={live} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('heading', { name: 'Live now' })
    expect(canvas.getByRole('link', { name: '3f9c2a1' })).toHaveAttribute('href', live.commit?.url)
  },
}
export const LiveUnlinked: Story = { render: () => <ResultCard result={{ ...live, commit: { sha: live.commit!.sha } }} /> }
export const Failed: Story = { render: () => <ResultCard result={failedAfterMigration} /> }
export const PushRefused: Story = { render: () => <ResultCard result={pushRefused} /> }
export const Capped: Story = { render: () => <ResultCard result={capped} /> }

export const Query: Story = {
  tags: ['play'],
  render: () => <QueryCard query={query} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['number', 'customer', 'total', 'paid_at'])
    expect(canvas.getAllByRole('row')).toHaveLength(5)
    expect(canvas.getAllByText('null')).toHaveLength(2)
  },
}
export const QueryTruncated: Story = { render: () => <QueryCard query={{ ...query, truncated: true }} /> }
export const QueryNoRows: Story = { render: () => <QueryCard query={{ ...query, rows: [] }} /> }
