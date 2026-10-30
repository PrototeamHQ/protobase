import type { Meta, StoryObj } from '@storybook/react-vite'
import { SampleActivityChart } from './activity-chart-fixtures'

const meta = {
  title: 'Components/ActivityChart',
  component: SampleActivityChart,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-[1100px]"><Story /></div>],
  args: { title: 'Orders created', noun: 'orders' },
} satisfies Meta<typeof SampleActivityChart>

export default meta
type Story = StoryObj<typeof meta>

export const Daily: Story = {}

export const Weekly: Story = { args: { defaultGranularity: 'week' } }
