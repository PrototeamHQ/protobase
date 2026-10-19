import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Button } from '../primitives/button'
import { Toast, ToastProvider, useToast } from './index'

const meta = { title: 'Toasts/Toast', component: Toast, tags: ['autodocs'] } satisfies Meta<typeof Toast>
export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = { args: { state: 'loading', title: 'Saving invoice INV-2026-04218...' } }
export const Success: Story = { args: { state: 'success', title: 'Invoice saved', description: 'All changes are stored.' } }
const textTop = (element: Element) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  return range.getBoundingClientRect().top
}

/** An action that goes somewhere is a link, its label on the title's line; a plain left click goes through `onNavigate`. */
export const WithLink: Story = {
  tags: ['play'],
  args: { state: 'success', title: 'Search saved', action: { label: 'Open saved searches', href: '/saved-searches', onNavigate: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', { name: 'Open saved searches' })
    expect(link).toHaveAttribute('href', '/saved-searches')
    expect(textTop(link)).toBe(textTop(canvas.getByText('Search saved')))
    await userEvent.click(link)
    expect(args.action && 'href' in args.action && args.action.onNavigate).toHaveBeenCalledWith('/saved-searches')
  },
}

/** An action that does something in place, such as undoing a delete, stays a button. */
export const WithButton: Story = {
  tags: ['play'],
  args: { state: 'success', title: 'Invoice deleted', action: { label: 'Undo', onClick: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(textTop(canvas.getByRole('button', { name: 'Undo' }))).toBe(textTop(canvas.getByText('Invoice deleted')))
  },
}
export const Warning: Story = { args: { state: 'warning', title: 'Moved to place 4', description: 'Write the tests comes after Design the schema, which it depends on.' } }
export const Failed: Story = { args: { state: 'error', title: 'Could not save invoice', description: 'Quantity must be at least 1 on line 2.' } }

const Demo = () => {
  const toast = useToast()
  const save = () => {
    const id = toast.show({ state: 'loading', title: 'Saving invoice...' })
    setTimeout(() => toast.update(id, { state: 'success', title: 'Invoice saved' }), 1200)
  }
  const fail = () => {
    const id = toast.show({ state: 'loading', title: 'Saving invoice...' })
    setTimeout(() => toast.update(id, { state: 'error', title: 'Could not save invoice', description: 'The connection was lost.' }), 1200)
  }
  return (
    <div className="flex gap-2">
      <Button variant="primary" onClick={save}>Save (success)</Button>
      <Button onClick={fail}>Save (error)</Button>
    </div>
  )
}

export const Interactive: Story = {
  args: { state: 'loading', title: '' },
  render: () => (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  ),
}
