import type { Meta, StoryObj } from '@storybook/react-vite'
import type { MailSenderCheck } from '@protobase/client'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MailSendersSection, type MailSendersSectionProps } from './mail-senders-section'

const meta = { title: 'Account/From addresses', decorators: [(Story) => <div className="max-w-3xl bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const senders: MailSendersSectionProps['senders'] = {
  address: 'ana@gmail.example',
  senders: [
    { id: 's1', address: 'billing@shop.example', name: 'Shop billing', signature: 'Warm regards,\nAna, Shop billing', isDefault: false, verified: false, shared: false },
    { id: 's2', address: 'ana@studio.example', isDefault: false, verified: false, shared: false },
  ],
}

const added = { id: 's3', address: 'sales@shop.example', name: 'Shop sales', signature: 'The Shop sales team', isDefault: false, verified: false, shared: false }

/** The mailbox's own address as the default, the entered ones with their name and their own signature or the generic one, adding one with a name as the default, and removing one after asking. */
export const FromAddresses: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: { senders, onAdd: fn(async () => added), onUpdate: fn(async () => undefined), onRemove: fn(async () => undefined), onCheck: fn(), onCheckResult: fn() },
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
  args: { senders: { ...senders, senders: [{ ...senders.senders[0]!, isDefault: true }] }, onAdd: fn(), onUpdate: fn(async () => undefined), onRemove: fn(), onCheck: fn(), onCheckResult: fn() },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Make default' }))
    expect(args.onUpdate).toHaveBeenCalledWith('s1', { isDefault: false })
  },
}

// A check's answer comes after its first wait of 3 seconds.
const answered = { timeout: 5000 }

// The first check finds the mailbox's own address, the second the address itself, as once it is set up.
const checkResult = fn(async (): Promise<MailSenderCheck> =>
  checkResult.mock.calls.length === 1 ? { status: 'mismatch', from: 'ana@gmail.example' } : { status: 'confirmed', from: 'sales@shop.example' },
)

/** Where the app can check: adding an address checks it at once, the mailbox sends from its own address instead, and once set up a second check confirms it. */
export const CheckedFromAddress: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: {
    senders: { ...senders, checks: true },
    onAdd: fn(async () => added),
    onUpdate: fn(async () => undefined),
    onRemove: fn(),
    onCheck: fn(async () => ({ status: 'waiting' as const, check: 'token-1' })),
    onCheckResult: checkResult,
  },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const page = within(document.body)
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Add a From address' }))
    await userEvent.type(page.getByLabelText('Address'), 'sales@shop.example')
    await userEvent.click(page.getByRole('button', { name: 'Add address' }))
    const dialog = within(await page.findByRole('dialog', { name: 'sales@shop.example' }))
    expect(dialog.getByText(/^Sending a test message from sales@shop\.example/)).toBeVisible()
    expect(args.onCheck).toHaveBeenCalledWith('s3')
    expect(await dialog.findByText(/^The test message arrived from ana@gmail\.example instead of sales@shop\.example/, {}, answered)).toBeVisible()
    expect(args.onCheckResult).toHaveBeenCalledWith('s3', 'token-1')

    // Only an address the check proved can be shared.
    expect(dialog.queryByRole('switch', { name: /other senders/ })).toBeNull()
    expect(dialog.getByText(/^To share this address with the app's other senders, check it first/)).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Check again' }))
    expect(await dialog.findByText('The test message arrived from sales@shop.example. Your mailbox can send from this address.', {}, answered)).toBeVisible()
    expect(dialog.getByRole('switch', { name: "Let the app's other senders send from this address through your mailbox" })).toBeVisible()
  },
}

const verified = { id: 's4', address: 'team@shop.example', isDefault: false, verified: true, shared: false }

/** A verified address can be shared with the app's other senders, and a shared one shows so in the list. */
export const SharedFromAddress: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: {
    senders: { ...senders, checks: true, senders: [verified, { ...verified, id: 's5', address: 'office@shop.example', shared: true }] },
    onAdd: fn(),
    onUpdate: fn(async () => undefined),
    onRemove: fn(),
    onCheck: fn(),
    onCheckResult: fn(),
  },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    expect(canvas.getByText('Shared')).toBeVisible()
    await userEvent.click(canvas.getAllByRole('button', { name: 'Edit' })[0]!)
    await userEvent.click(page.getByRole('switch', { name: "Let the app's other senders send from this address through your mailbox" }))
    await userEvent.click(page.getByRole('button', { name: 'Save' }))
    expect(args.onUpdate).toHaveBeenCalledWith('s4', { name: null, signature: null, isDefault: false, shared: true })
  },
}

/** Where the app cannot check, the dialog says so, and how to check by hand. */
export const UncheckedFromAddress: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: { senders, onAdd: fn(), onUpdate: fn(), onRemove: fn(), onCheck: fn(), onCheckResult: fn() },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const page = within(document.body)
    await userEvent.click(within(canvasElement).getAllByRole('button', { name: 'Edit' })[0]!)
    expect(page.getByText(/^This app cannot check From addresses for you\./)).toBeVisible()
    expect(page.queryByRole('button', { name: 'Check address' })).toBeNull()
    expect(args.onCheck).not.toHaveBeenCalled()
  },
}
