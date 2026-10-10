import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bell } from 'lucide-react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SidePanel } from './side-panel'

const meta = {
  title: 'Components/SidePanel',
  component: SidePanel,
  parameters: { layout: 'fullscreen' },
  args: { title: 'Notifications', icon: <Bell className="size-4 text-primary" />, status: '3 new', onClose: fn(), children: <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[13px]">Content scrolls here.</div>, footer: <p className="text-xs text-muted-foreground">A footer stays at the bottom.</p> },
  decorators: [(Story) => <div className="flex h-[600px] justify-end bg-background"><Story /></div>],
} satisfies Meta<typeof SidePanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const panel = within(canvasElement).getByRole('complementary', { name: 'Notifications' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(args.onClose).toHaveBeenCalled()
  },
}

export const WithoutFooterOrClose: Story = { args: { footer: undefined, onClose: undefined, status: undefined } }
