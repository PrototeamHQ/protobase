import type { Meta, StoryObj } from '@storybook/react-vite'
import type { MailSenderVerification } from '@protobase/client'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { MailSendersSection, type MailSendersSectionProps } from './mail-senders-section'

const meta = { title: 'Account/From addresses', decorators: [(Story) => <div className="max-w-3xl bg-surface p-6"><Story /></div>] } satisfies Meta
export default meta

const senders: MailSendersSectionProps['senders'] = {
  address: 'ana@gmail.example',
  senders: [
    { id: 's1', address: 'billing@shop.example', name: 'Shop billing', signature: 'Warm regards,\nAna, Shop billing', isDefault: false, state: 'verified', connection: 'c1' },
    { id: 's2', address: 'ana@studio.example', isDefault: false, state: 'unverified', connection: 'c1' },
  ],
  connections: [{ id: 'c1', provider: 'gmail', address: 'ana@gmail.example', canList: false, missingScopes: [] }],
}

const added = { id: 's3', address: 'sales@shop.example', name: 'Shop sales', signature: 'The Shop sales team', isDefault: false, state: 'unverified' as const, connection: 'c1' }

// What every story's section gets besides its addresses: a mailbox that lists nothing, named Gmail.
const mailbox = { onRefresh: fn(async () => []), onConnect: fn(), providerName: () => 'Gmail' }

/** The mailbox's own address as the default, the entered ones with their name and their own signature or the generic one, adding one with a name as the default, and removing one after asking. */
export const FromAddresses: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: { senders, onAdd: fn(async () => added), onUpdate: fn(async () => undefined), onRemove: fn(async () => undefined), onVerify: fn(), onVerifications: fn(), ...mailbox },
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
  args: { senders: { ...senders, senders: [{ ...senders.senders[0]!, isDefault: true }] }, onAdd: fn(), onUpdate: fn(async () => undefined), onRemove: fn(), onVerify: fn(), onVerifications: fn(), ...mailbox },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Make default' }))
    expect(args.onUpdate).toHaveBeenCalledWith('s1', { isDefault: false })
  },
}

// A verification's answer comes after its first wait of 3 seconds.
const answered = { timeout: 5000 }

const pending: MailSenderVerification = { verifier: 'test-mail', state: 'pending', expiresAt: '2026-08-02T00:00:00.000Z' }

// The first verification fails with the verifier's own words, the second proves the address, as once it is set up.
const verifications = fn(async (): Promise<MailSenderVerification[]> =>
  verifications.mock.calls.length === 1
    ? [{ verifier: 'test-mail', state: 'failed', errorCode: 'from_rewritten', error: 'The test message arrived from ana@gmail.example.' }]
    : [{ verifier: 'test-mail', state: 'verified', settledAt: '2026-08-01T00:01:00.000Z', validUntil: '2026-10-30T00:00:00.000Z' }],
)

/** Where the app has a verifier: adding an address verifies it at once, it fails with the verifier's words, and once set up a second verification proves it. */
export const VerifiedFromAddress: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: {
    senders: { ...senders, verifiers: true },
    onAdd: fn(async () => added),
    onUpdate: fn(async () => undefined),
    onRemove: fn(),
    onVerify: fn(async () => [pending]),
    onVerifications: verifications,
    ...mailbox,
  },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const page = within(document.body)
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Add a From address' }))
    await userEvent.type(page.getByLabelText('Address'), 'sales@shop.example')
    await userEvent.click(page.getByRole('button', { name: 'Add address' }))
    const dialog = within(await page.findByRole('dialog', { name: 'sales@shop.example' }))
    expect(dialog.getByText(/^Verifying sales@shop\.example/)).toBeVisible()
    expect(args.onVerify).toHaveBeenCalledWith('s3')
    expect(await dialog.findByText('sales@shop.example could not be verified.', {}, answered)).toBeVisible()
    expect(dialog.getByText('The test message arrived from ana@gmail.example.')).toBeVisible()
    expect(args.onVerifications).toHaveBeenCalledWith('s3')

    await userEvent.click(dialog.getByRole('button', { name: 'Verify again' }))
    expect(await dialog.findByText('sales@shop.example is verified: mail from it goes out from this address.', {}, answered)).toBeVisible()
  },
}

/** Where the app has no verifier, the dialog says so, and how to check by hand. */
export const UnverifiableFromAddress: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: { senders, onAdd: fn(), onUpdate: fn(), onRemove: fn(), onVerify: fn(), onVerifications: fn(), ...mailbox },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const page = within(document.body)
    await userEvent.click(within(canvasElement).getAllByRole('button', { name: 'Edit' })[0]!)
    expect(page.getByText(/^This app cannot verify From addresses for you\./)).toBeVisible()
    expect(page.queryByRole('button', { name: 'Verify address' })).toBeNull()
    expect(args.onVerify).not.toHaveBeenCalled()
  },
}

/** A verified address is shared with the app's other senders from its dialog; an unverified one says to prove it first. */
export const SharedFromAddress: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: { senders, onAdd: fn(), onUpdate: fn(async () => undefined), onRemove: fn(), onShare: fn(async () => undefined), onVerify: fn(), onVerifications: fn(), ...mailbox },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Edit' })[1]!)
    expect(page.getByRole('switch', { name: "Share with the app's other senders" })).toBeDisabled()
    expect(page.getByText(/^Only a verified address can be shared\./)).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(canvas.getAllByRole('button', { name: 'Edit' })[0]!)
    await userEvent.click(page.getByRole('switch', { name: "Share with the app's other senders" }))
    await userEvent.click(page.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(args.onShare).toHaveBeenCalledWith('s1', true))
  },
}

/** A shared address says so in the list. */
export const SharedBadge: StoryObj<MailSendersSectionProps> = {
  args: { senders: { ...senders, senders: [{ ...senders.senders[0]!, sharedAt: '2026-08-01T00:00:00.000Z' }] }, onAdd: fn(), onUpdate: fn(), onRemove: fn(), onShare: fn(), onVerify: fn(), onVerifications: fn(), ...mailbox },
  render: (args) => <MailSendersSection {...args} />,
}

const listingMailbox = { ...senders.connections![0]!, canList: true }

/** A mailbox that lists its send-as addresses: opening the section checks them with Gmail, and each shows what Gmail says of it. */
export const ListedStates: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: {
    senders: {
      ...senders,
      connections: [listingMailbox],
      senders: [
        { id: 's1', address: 'billing@shop.example', name: 'Shop billing', isDefault: false, state: 'verified', connection: 'c1' },
        { id: 's2', address: 'sales@shop.example', isDefault: false, state: 'pending', connection: 'c1' },
        { id: 's3', address: 'bilign@shop.example', isDefault: false, state: 'failed', connection: 'c1' },
        { id: 's4', address: 'old@shop.example', isDefault: false, state: 'detached' },
      ],
    },
    onAdd: fn(),
    onUpdate: fn(),
    onRemove: fn(),
    onVerify: fn(),
    onVerifications: fn(),
    ...mailbox,
    onRefresh: fn(async () => [{ connection: 'c1', provider: 'gmail', status: 'listed' as const }]),
  },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // The section checks with Gmail once it has drawn.
    await waitFor(() => expect(args.onRefresh).toHaveBeenCalledTimes(1))
    for (const label of ['Verified', 'Awaiting confirmation', "Can't send", 'No mailbox']) expect(canvas.getByText(label)).toBeVisible()
    expect(canvas.getByText(/^Gmail does not list this address, so it would send from ana@gmail\.example instead/)).toBeVisible()
    expect(canvas.getByText(/^This address is on no mailbox you have connected/)).toBeVisible()
    expect(await canvas.findByText('Checked with Gmail just now.')).toBeVisible()
    await userEvent.click(await canvas.findByRole('button', { name: 'Check with Gmail' }))
    await waitFor(() => expect(args.onRefresh).toHaveBeenCalledTimes(2))
  },
}

/** A Gmail linked without the scope that reads its send-as addresses: the section offers to connect it again, and checks nothing. */
export const ListingNotPermitted: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: {
    senders: { ...senders, connections: [{ ...listingMailbox, missingScopes: ['https://www.googleapis.com/auth/gmail.settings.basic'] }] },
    onAdd: fn(),
    onUpdate: fn(),
    onRemove: fn(),
    onVerify: fn(),
    onVerifications: fn(),
    ...mailbox,
  },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('heading', { name: 'Check your addresses with Gmail' })).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'Check with Gmail' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Allow address checks' }))
    expect(args.onConnect).toHaveBeenCalledWith('gmail')
    expect(args.onRefresh).not.toHaveBeenCalled()
  },
}

/** A refresh that finds the link no longer works: the section says so and offers to connect again. */
export const ListingExpired: StoryObj<MailSendersSectionProps> = {
  tags: ['play'],
  args: {
    senders: { ...senders, connections: [listingMailbox] },
    onAdd: fn(),
    onUpdate: fn(),
    onRemove: fn(),
    onVerify: fn(),
    onVerifications: fn(),
    ...mailbox,
    onRefresh: fn(async () => [{ connection: 'c1', provider: 'gmail', status: 'error' as const, code: 'link_expired' as const }]),
  },
  render: (args) => <MailSendersSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Connect Gmail again' })).toBeVisible()
    expect(canvas.getByText(/^Gmail no longer accepts this app's link/)).toBeVisible()
  },
}
