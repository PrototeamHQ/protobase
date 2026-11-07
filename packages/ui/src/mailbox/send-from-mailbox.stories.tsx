import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, AuthError, createStaticSession, type AuthSession } from '@protobase/client'
import type { ActionModel, ViewModel } from '@protobase/schema'
import { App } from '../app/app'
import { fakeApi } from '../app/testing/fake-api'
import { salesResources, salesRows, salesViews } from '../app/pages/guide/sales-domain'
import { defineUi } from '../app/pages/project-ui'

const gmail = { id: 'gmail', name: 'Gmail', provider: 'google', scopes: ['https://www.googleapis.com/auth/gmail.send'], params: { access_type: 'offline', prompt: 'consent' } }

// As the server's personal mail answers a send it could not make, a 409 problem with its code and provider.
const mailboxFailure = (slug: string, extras: Record<string, string>) => new ApiError({ type: `urn:protobase:problem:${slug}`, title: 'Conflict', status: 409, ...extras })
const notLinked = mailboxFailure('personal-mail-not-linked', { code: 'not_linked', detail: 'Link a mailbox to send mail from it' })
const expired = mailboxFailure('personal-mail-link-expired', { code: 'link_expired', provider: 'gmail', detail: 'The link to your mailbox has expired: link it again to send mail from it' })
const refused = new ApiError({ type: 'urn:protobase:problem:send-failed', title: 'Cannot send', status: 502, detail: 'The mailbox did not take the message' })

// Refuses to start, so the story stays on the page instead of leaving for Google; it records where the link comes back to.
const linkPersonalMail = fn(async () => {
  throw new AuthError('Google is not set up.', 400, 'PROVIDER_NOT_FOUND')
})

/** Signed in on an app that sends from people's own Gmail: `mail` the mailboxes linked with leave to send, `providers` the sign-ins linked. */
const mailboxSession = (mail: string[], providers: string[]): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'admin' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), socialProviders: ['google'], personalMail: [gmail] }),
    account: { ...base.account, linkedPersonalMail: async () => mail, linkedProviders: async () => providers, linkPersonalMail },
  }
}

// Send asks for a note and sends from the person's mailbox; Resend sends again without asking, as Retry send does.
const send: ActionModel = { name: 'send', label: 'Send', icon: 'send', bulk: false, mailbox: true, inputs: [{ name: 'note', kind: 'text', label: 'Note', required: false }] }
const resend: ActionModel = { name: 'resend', label: 'Resend', bulk: false, confirm: 'Send it again?', inputs: [{ name: 'note', kind: 'text', label: 'Note', required: false }] }
const views: ViewModel[] = salesViews.map((view) => (view.resource === 'orders' ? { ...view, actions: [...view.actions, send, resend] } : view))

const MailboxApp = ({ mail = [], providers = [], failure }: { mail?: string[]; providers?: string[]; failure?: unknown }) => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views, rows: salesRows }))
  const [session] = useState(() => mailboxSession(mail, providers))
  const [ui] = useState(() =>
    defineUi({
      actions: {
        send: () => undefined,
        resend: () => {
          if (failure) throw failure
        },
      },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/orders/1" workspace="Veldhuis Supply" ui={ui} />
    </div>
  )
}

const meta = { title: 'Record page/Send from a mailbox', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const openDialog = async (canvasElement: HTMLElement, name: string) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name }))
  return within(await within(document.body).findByRole('dialog', { name }))
}

/** No mailbox linked: Send offers to connect Gmail instead of sending, and the sign-in comes back to this page, the record. */
export const NoMailbox: StoryObj = {
  tags: ['play'],
  render: () => <MailboxApp />,
  play: async ({ canvasElement }) => {
    linkPersonalMail.mockClear()
    const dialog = await openDialog(canvasElement, 'Send')
    expect(await dialog.findByRole('region', { name: 'Connect a mailbox to send' })).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: 'Connect Gmail' }))
    expect(linkPersonalMail).toHaveBeenCalledWith(expect.objectContaining({ id: 'gmail' }), window.location.href)
    expect(await dialog.findByText('Google is not set up.')).toBeVisible()
  },
}

/** Signed in with Google, which did not allow sending mail: that sign-in is named as no mailbox. */
export const GoogleSignInOnly: StoryObj = {
  tags: ['play'],
  render: () => <MailboxApp providers={['google']} />,
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement, 'Send')
    expect(await dialog.findByText('You sign in with Google, but that sign-in does not allow sending mail: connect Gmail to send from it.')).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Send' })).toBeDisabled()
  },
}

/** Gmail linked: Send asks nothing more and sends. */
export const MailboxLinked: StoryObj = {
  tags: ['play'],
  render: () => <MailboxApp mail={['gmail']} providers={['google']} />,
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement, 'Send')
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Send' })).toBeEnabled())
    expect(dialog.queryByRole('region', { name: 'Connect a mailbox to send' })).toBeNull()
  },
}

/** A send refused for want of a mailbox offers to connect one in place of the bare failure. */
export const FailedNotLinked: StoryObj = {
  tags: ['play'],
  render: () => <MailboxApp failure={notLinked} />,
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement, 'Resend')
    await userEvent.click(dialog.getByRole('button', { name: 'Resend' }))
    expect(await dialog.findByRole('button', { name: 'Connect Gmail' })).toBeVisible()
    expect(dialog.queryByText('Link a mailbox to send mail from it')).toBeNull()
  },
}

/** A send refused as the link expired offers to connect the mailbox again. */
export const FailedLinkExpired: StoryObj = {
  tags: ['play'],
  render: () => <MailboxApp mail={['gmail']} failure={expired} />,
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement, 'Resend')
    await userEvent.click(dialog.getByRole('button', { name: 'Resend' }))
    expect(await dialog.findByRole('region', { name: 'Connect your mailbox again' })).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Connect Gmail again' })).toBeEnabled()
  },
}

/** A failure that is not about the mailbox shows as it is, with no offer to connect. */
export const FailedOtherwise: StoryObj = {
  tags: ['play'],
  render: () => <MailboxApp mail={['gmail']} failure={refused} />,
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement, 'Resend')
    await userEvent.click(dialog.getByRole('button', { name: 'Resend' }))
    expect(await dialog.findByText('The mailbox did not take the message')).toBeVisible()
    expect(dialog.queryByRole('button', { name: /Connect Gmail/ })).toBeNull()
  },
}
