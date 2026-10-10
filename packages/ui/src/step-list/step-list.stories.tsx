import type { Meta, StoryObj } from '@storybook/react-vite'
import { StepList } from './step-list'

const meta = {
  title: 'Components/StepList',
  component: StepList,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[320px]"><Story /></div>],
} satisfies Meta<typeof StepList>

export default meta
type Story = StoryObj<typeof meta>

export const EveryState: Story = {
  args: {
    steps: [
      { label: 'Read the invoices schema', state: 'done' },
      { label: 'Ran the checks', state: 'failed' },
      { label: 'Fixing the type error', state: 'running' },
      { label: 'Run the checks again', state: 'pending' },
    ],
  },
}
