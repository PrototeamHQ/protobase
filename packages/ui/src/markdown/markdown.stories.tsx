import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Markdown } from './markdown'

const meta = {
  title: 'Components/Markdown',
  component: Markdown,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[360px] text-sm"><Story /></div>],
} satisfies Meta<typeof Markdown>

export default meta
type Story = StoryObj<typeof meta>

const source = [
  '## Plan',
  '',
  'Ship the **export**, see [the docs](https://docs.protobase.net).',
  '',
  '- [x] Reuse the renderer',
  '- Write the `story`',
  '',
  'Raw <img src=x onerror="window.__pwned = true"> stays text.',
].join('\n')

export const Rendered: Story = {
  tags: ['play'],
  args: { source, className: 'text-muted-foreground' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Plan' })).toBeVisible()
    expect(canvas.getByText('export').tagName).toBe('STRONG')
    expect(canvas.getByRole('link', { name: 'the docs' })).toHaveAttribute('target', '_blank')
    expect(canvas.getByText(/Raw <img src=x onerror="window.__pwned = true"> stays text\./)).toBeVisible()
    expect(canvasElement.querySelector('img')).toBeNull()
    expect(canvasElement.querySelector('.text-muted-foreground')).toBe(canvas.getByRole('heading', { name: 'Plan' }).parentElement)
  },
}

export const InLink: Story = { args: { source: 'See **the plan** at [the docs](https://docs.protobase.net)', inLink: true } }
