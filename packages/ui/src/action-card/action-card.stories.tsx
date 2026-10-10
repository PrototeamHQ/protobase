import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { StepList } from '../step-list'
import { ActionCard } from './action-card'
import { FieldList } from './field-list'

const meta = {
  title: 'Components/ActionCard',
  component: ActionCard,
  parameters: { layout: 'centered' },
  args: { title: 'Rename the status "won"', onAction: fn() },
  decorators: [(Story) => <div className="w-[348px]"><Story /></div>],
} satisfies Meta<typeof ActionCard>

export default meta
type Story = StoryObj<typeof meta>

/** Two buttons; the danger one asks first. */
export const WithActions: Story = {
  tags: ['play'],
  args: {
    tone: 'info',
    badge: 'Draft',
    note: 'Nothing changes until you confirm.',
    actions: [
      { id: 'apply', label: 'Apply', style: 'primary' },
      { id: 'discard', label: 'Discard', style: 'danger', confirm: 'The draft is deleted.' },
    ],
    children: <FieldList fields={[{ label: 'From', value: 'won' }, { label: 'To', value: 'closed' }]} />,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    expect(args.onAction).toHaveBeenCalledWith('apply')
    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }))
    expect(args.onAction).not.toHaveBeenCalledWith('discard')
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Discard?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
    expect(args.onAction).toHaveBeenCalledWith('discard')
  },
}

/** A disabled button says why under the buttons. */
export const DisabledWithHint: Story = {
  tags: ['play'],
  args: { actions: [{ id: 'apply', label: 'Apply', style: 'primary', disabled: true, hint: 'Only an admin can apply this.' }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled()
    canvas.getByText('Only an admin can apply this.')
  },
}

export const Progress: Story = {
  args: {
    title: 'Importing customers',
    children: <StepList steps={[{ label: 'Read the file', state: 'done' }, { label: 'Checking 1,204 rows', state: 'running' }, { label: 'Write the records', state: 'pending' }]} />,
  },
}

export const Tones: Story = {
  render: (args) => (
    <div className="space-y-3">
      {(['neutral', 'info', 'success', 'warning', 'danger'] as const).map((tone) => <ActionCard key={tone} {...args} tone={tone} title={`A ${tone} card`} badge={tone} note="A note under the content." />)}
    </div>
  ),
}
