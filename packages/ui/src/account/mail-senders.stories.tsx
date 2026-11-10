import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MailSendersSection, type MailSendersSectionProps } from './mail-senders-section'

const meta = { title: 'Account/From addresses', decorators: [(Story) => <div className="max-w-3xl bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const senders: MailSendersSectionProps['senders'] = {
  address: 'ana@gmail.example',
  senders: [
    { id: 's1', address: 'billing@shop.example', name: 'Shop billing', signature: 'Warm regards,\nAna, Shop billing', isDefault: false },
    { id: 's2', address: 'ana@studio.example', isDefault: false },
  ],
}

const added = { id: 's3', address: 'sales@shop.example', name: 'Shop sales', signature: 'The Shop sales team', isDefault: false }

/** The mailbox's own address as the default, the entered ones with their name and their own signature or the generic one, adding one with a name as the default, and removing one after asking. */
export const FromAddresses: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: { senders, onAdd: fn(async () => added), onUpdate: fn(async () => undefined), onRemove: fn(async () => undefined) },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    expect(canvas.getByText("Your mailbox's own address")).toBeVisible()
    expect(canvas.getByText('Default')).toBeVisible()
    expect(canvas.getByText('Own signature')).toBeVisible()
    expect(canvas.getByText('Generic signature')).toBeVisible()
    expect(canvas.getByText('Shop billing')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Add a From address' }))
    await userEvent.type(page.getByLabelText('Address'), 'sales@shop.example')
    await userEvent.type(page.getByLabelText('Name'), 'Shop sales ')
    await userEvent.click(page.getByRole('switch', { name: 'Send from this address unless another is chosen' }))
    await userEvent.type(page.getByLabelText('Signature'), 'The Shop sales team')
    await userEvent.click(page.getByRole('button', { name: 'Add address' }))
    expect(args.onAdd).toHaveBeenCalledWith({ address: 'sales@shop.example', name: 'Shop sales', signature: 'The Shop sales team' })
    expect(args.onUpdate).toHaveBeenCalledWith('s3', { isDefault: true })

    // Emptying the name or the signature drops it: the bare address, the generic signature.
    await userEvent.click(canvas.getAllByRole('button', { name: 'Edit' })[0]!)
    expect(page.getByLabelText('Name')).toHaveValue('Shop billing')
    await userEvent.clear(page.getByLabelText('Name'))
    await userEvent.clear(page.getByLabelText('Signature'))
    await userEvent.click(page.getByRole('button', { name: 'Save' }))
    expect(args.onUpdate).toHaveBeenCalledWith('s1', { name: null, signature: null, isDefault: false })

    await userEvent.click(canvas.getAllByRole('button', { name: 'Remove' })[1]!)
    await userEvent.click(within(page.getByRole('dialog', { name: 'Remove ana@studio.example?' })).getByRole('button', { name: 'Remove' }))
    expect(args.onRemove).toHaveBeenCalledWith('s2')
  },
}

/** An entered address as the default: the mailbox's own address offers to be the default again. */
export const EnteredDefault: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: { senders: { ...senders, senders: [{ ...senders.senders[0]!, isDefault: true }] }, onAdd: fn(), onUpdate: fn(async () => undefined), onRemove: fn() },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Make default' }))
    expect(args.onUpdate).toHaveBeenCalledWith('s1', { isDefault: false })
  },
}
