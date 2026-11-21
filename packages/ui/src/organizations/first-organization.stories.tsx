import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type CurrentOrganization, type OrganizationInvitation } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app/app'
import { fakeApi } from '../app/testing/fake-api'

const meta = { title: 'Organizations/First organization', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A chat: its notes come first in the sidebar, while the app starts people in the #general channel.
const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), title: f.text() }).primaryKey((r) => r.id)
const channels = resource('channels')
  .table('channels')
  .fields({ id: f.integer().readOnly().sortable(), name: f.text().filterable().sortable() })
  .primaryKey((r) => r.id)
const notesView = view<typeof notes>('notes').names({ singular: 'Note', plural: 'Notes' }).nav({ order: 1 })
const channelsView = (filter: string) => view<typeof channels>('channels').names({ singular: 'Channel', plural: 'Channels' }).title((r) => r.name).nav({ order: 2, start: { filter } })

const acme = { id: 'org-acme', name: 'Acme', slug: 'acme', logo: null }
const nowhere: CurrentOrganization = { organization: null, globalRoles: [] }
const inAcme: CurrentOrganization = { organization: acme, role: 'owner', appRoles: [], memberId: 'm-sam', globalRoles: [] }
const invitation: OrganizationInvitation = { id: 'i1', email: 'sam@example.com', role: 'member', appRoles: [], status: 'pending', expiresAt: '2026-12-01T09:00:00.000Z', organizationName: 'Acme' }

type Organizations = AuthSession['organizations']
type Args = { create: Organizations['create']; acceptMine: Organizations['acceptMine'] }

/** Sam, signed in to a chat that calls its organizations workspaces, working in `current`, with `invitations` waiting. */
const sessionFor = (current: CurrentOrganization, invitations: OrganizationInvitation[], args?: Args): AuthSession => {
  const base = createStaticSession('story-token', { id: 'story', email: 'sam@example.com', name: 'Sam Veldhuis', role: 'user' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), organizations: { create: 'everyone', roles: [], names: { singular: 'Workspace', plural: 'Workspaces' }, createDescription: 'Where your team talks, in channels.' } }),
    organizations: {
      ...base.organizations,
      current: async () => current,
      list: async () => (current.organization ? [current.organization] : []),
      myInvitations: async () => invitations,
      ...(args && { create: args.create, acceptMine: args.acceptMine }),
    },
  }
}

const Chat = ({ session, start, filter = 'name = "general"' }: { session: AuthSession; start: string; filter?: string }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [notes.toModel(), channels.toModel()],
      views: [notesView.toModel(), channelsView(filter).toModel()],
      rows: { notes: [{ id: 1, title: 'Welcome' }], channels: [{ id: 1, name: 'random' }, { id: 2, name: 'general' }] },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} />
    </div>
  )
}

// Never settle, so the story stays on the screen instead of opening the app again.
const pending = () => ({ create: fn(() => new Promise<never>(() => {})), acceptMine: fn(() => new Promise<never>(() => {})) })

const createPlay: StoryObj<Args>['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement)
  expect(await canvas.findByRole('heading', { name: 'Create your workspace' })).toBeVisible()
  expect(canvas.getByText('Where your team talks, in channels.')).toBeVisible()
  // The address the person came to had a list of the workspace; none of it shows, nor a slug to fill in
  expect(canvas.queryByRole('link', { name: 'Notes' })).toBeNull()
  expect(canvas.queryByLabelText(/slug/i)).toBeNull()
  expect(canvas.getByText('Signed in as sam@example.com')).toBeVisible()
  expect(canvas.getByRole('button', { name: 'Sign out' })).toBeVisible()
  const create = canvas.getByRole('button', { name: 'Create workspace' })
  expect(create).toBeEnabled()
  await userEvent.click(create)
  expect(await canvas.findByRole('alert')).toHaveTextContent('Give your workspace a name')
  expect(args.create).not.toHaveBeenCalled()
  await userEvent.type(canvas.getByLabelText('Workspace name'), '  Acme  ')
  expect(canvas.queryByRole('alert')).toBeNull()
  await userEvent.click(create)
  await userEvent.click(create)
  await waitFor(() => expect(args.create).toHaveBeenCalledTimes(1))
  expect(args.create).toHaveBeenCalledWith({ name: 'Acme' })
}

/** Someone in no workspace who opens one of its lists gets the one-step screen that names their first, on a laptop. */
export const CreateOnALaptop: StoryObj<Args> = {
  tags: ['play', 'laptop'],
  args: pending(),
  render: (args) => <Chat session={sessionFor(nowhere, [], args)} start="/notes" />,
  play: createPlay,
}

/** The same screen on a phone. */
export const CreateOnAPhone: StoryObj<Args> = {
  tags: ['play', 'touch'],
  args: pending(),
  render: (args) => <Chat session={sessionFor(nowhere, [], args)} start="/notes" />,
  play: createPlay,
}

const joinPlay: StoryObj<Args>['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement)
  expect(await canvas.findByRole('heading', { name: 'You are invited' })).toBeVisible()
  expect(canvas.queryByLabelText('Workspace name')).toBeNull()
  const instead = canvas.getByRole('link', { name: 'Create a new workspace instead' })
  expect(instead.getAttribute('href')).toBe('/-/first-organization/new')
  await userEvent.click(canvas.getByRole('button', { name: 'Join Acme' }))
  await waitFor(() => expect(args.acceptMine).toHaveBeenCalledWith('i1'))
  await userEvent.click(instead)
  expect(await canvas.findByLabelText('Workspace name')).toBeVisible()
  expect(canvas.getByRole('link', { name: 'Back to your invitations' }).getAttribute('href')).toBe('/-/first-organization')
}

/** An invitation comes first, joined in one press, with creating a workspace of one's own as the way aside, on a laptop. */
export const JoinOnALaptop: StoryObj<Args> = {
  tags: ['play', 'laptop'],
  args: pending(),
  render: (args) => <Chat session={sessionFor(nowhere, [invitation], args)} start="/" />,
  play: joinPlay,
}

/** The same invitation on a phone. */
export const JoinOnAPhone: StoryObj<Args> = {
  tags: ['play', 'touch'],
  args: pending(),
  render: (args) => <Chat session={sessionFor(nowhere, [invitation], args)} start="/" />,
  play: joinPlay,
}

/** The workspaces page opens outside any workspace too, in a shell without the workspace's resources. */
export const ShellOutsideAWorkspace: StoryObj = {
  tags: ['play'],
  render: () => <Chat session={sessionFor(nowhere, [])} start="/-/organizations" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Workspaces' })).toBeVisible()
    expect(canvas.queryByRole('link', { name: 'Notes' })).toBeNull()
    expect(canvas.queryByRole('link', { name: 'Channels' })).toBeNull()
  },
}

/** In a workspace, the root opens the record the app starts people in, #general, rather than the first sidebar entry. */
export const StartsInGeneral: StoryObj = {
  tags: ['play'],
  render: () => <Chat session={sessionFor(inAcme, [])} start="/" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'general' })).toBeVisible()
    expect(canvas.queryByText('Welcome')).toBeNull()
  },
}

/** When nothing matches the start record, the root opens the first sidebar entry, as without one. */
export const StartFallsBack: StoryObj = {
  tags: ['play'],
  render: () => <Chat session={sessionFor(inAcme, [])} start="/" filter='name = "lobby"' />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Welcome')).toBeVisible()
  },
}
