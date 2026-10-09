import type { Meta, StoryObj } from '@storybook/react-vite'
import { ActivityChart } from './activity-chart'

const meta = {
  title: 'Components/ActivityChart',
  component: ActivityChart,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-[1100px]"><Story /></div>],
} satisfies Meta<typeof ActivityChart>

export default meta
type Story = StoryObj<typeof meta>

export const Daily: Story = {}

export const Weekly: Story = { args: { defaultGranularity: 'week' } }
