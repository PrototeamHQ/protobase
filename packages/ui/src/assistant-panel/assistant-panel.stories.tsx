import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { AssistantPanel } from './assistant-panel'

const meta = {
  title: 'Assistant/AssistantPanel',
  component: AssistantPanel,
  parameters: { layout: 'fullscreen' },
  args: { stage: 'checks-passed', buildMode: true },
  decorators: [
    (Story) => (
      <div className="flex h-[900px] justify-end bg-background">
        <Story />
      </div>
    ),
  ],
  render: (args) => {
    const [buildMode, setBuildMode] = useState(args.buildMode)
    return <AssistantPanel {...args} buildMode={buildMode} onBuildModeChange={setBuildMode} />
  },
} satisfies Meta<typeof AssistantPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Request: Story = { args: { stage: 'request' } }
export const Working: Story = { args: { stage: 'working' } }
export const ChecksFailed: Story = { args: { stage: 'checks-failed' } }
export const ChecksPassed: Story = { args: { stage: 'checks-passed' } }
export const Preview: Story = { args: { stage: 'preview' } }
export const Published: Story = { args: { stage: 'published' } }
export const BuildModeOff: Story = { args: { stage: 'request', buildMode: false } }
