import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../primitives/button'
import { Toast, ToastProvider, useToast } from './index'

const meta = { title: 'Toasts/Toast', component: Toast, tags: ['autodocs'] } satisfies Meta<typeof Toast>
export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = { args: { state: 'loading', title: 'Saving invoice INV-2026-04218...' } }
export const Success: Story = { args: { state: 'success', title: 'Invoice saved', description: 'All changes are stored.' } }
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
