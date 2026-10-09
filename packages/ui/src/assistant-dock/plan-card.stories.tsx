import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { destructivePlan, plan } from './fixtures'
import { PlanCard } from './plan-card'

const meta = {
  title: 'Assistant/Dock/Plan card',
  component: PlanCard,
  parameters: { layout: 'centered' },
  args: { plan, balance: 12, onApprove: fn(), onRequestChanges: fn(), onCancel: fn(), onUpdatePlan: fn() },
  decorators: [(Story) => <div className="w-[348px]"><Story /></div>],
} satisfies Meta<typeof PlanCard>

export default meta
type Story = StoryObj<typeof meta>

export const Awaiting: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Approve · 3 credits' }))
    expect(args.onApprove).toHaveBeenCalledWith('t7')
    expect(canvas.queryByRole('button', { name: 'Update plan' })).toBeNull()
  },
}

/** Approve is disabled while the balance is below the quote, and says why. */
export const BelowQuote: Story = {
  tags: ['play'],
  args: { balance: 2 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const approve = canvas.getByRole('button', { name: 'Approve · 3 credits' })
    expect(approve).toBeDisabled()
    await userEvent.click(approve)
    expect(args.onApprove).not.toHaveBeenCalled()
    canvas.getByText('Needs 3 credits; the balance is 2 credits.')
  },
}

/** A push on GitHub moved the branch: Approve anyway, or a free Update plan. */
export const Outdated: Story = {
  tags: ['play'],
  args: { plan: { ...plan, outdated: true } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('status')
    await userEvent.click(canvas.getByRole('button', { name: 'Update plan' }))
    expect(args.onUpdatePlan).toHaveBeenCalledWith('t7')
    await userEvent.click(canvas.getByRole('button', { name: 'Approve anyway · 3 credits' }))
    expect(args.onApprove).toHaveBeenCalledWith('t7')
  },
}

export const Destructive: Story = { args: { plan: destructivePlan } }
export const HoldsUpTheQueue: Story = { args: { plan: { ...plan, waiting: 2 } } }
export const Revision: Story = { args: { plan: { ...plan, revision: 2, size: 'M', credits: 10 } } }
export const Approved: Story = { args: { plan: { ...plan, status: 'approved' } } }
export const Canceled: Story = { args: { plan: { ...plan, status: 'canceled' } } }
export const Superseded: Story = { args: { plan: { ...plan, status: 'superseded' } } }
export const Dropped: Story = { args: { plan: { ...plan, status: 'dropped' } } }
