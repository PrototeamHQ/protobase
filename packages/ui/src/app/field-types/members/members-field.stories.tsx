import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const meta = { title: 'Plugins/Field types/Members', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const channels = resource('channels')
  .table('channels')
  .fields({ id: f.integer().filterable().sortable(), name: f.text().filterable(), member_ids: f.json().optional() })
  .primaryKey((r) => r.id)

const channelsView = view<typeof channels>('channels')
  .names({ singular: 'Channel', plural: 'Channels' })
  .title((r) => r.name)
  .fields((r) => ({ member_ids: r.member_ids.label('Members').widget('members') }))
  .list((r) => ({ columns: [r.name, r.member_ids] }))

const acme = { id: 'org-acme', name: 'Acme', slug: 'acme', logo: null }
const people = [
  { id: 'u-bo', name: 'Bo Jansen' },
  { id: 'u-sanne', name: 'Sanne de Vries' },
  { id: 'u-jan', name: 'Jan Smit' },
]

/** Sanne, signed in to Acme in an app with organizations, or in one without them. */
const sessionOf = (organizations: boolean): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-sanne', email: 'sanne@acme.example', name: 'Sanne de Vries', role: 'user' })
  if (!organizations) return base
  return {
    ...base,
    status: async () => ({ ...(await base.status()), organizations: { create: 'everyone', roles: [] } }),
    organizations: {
      ...base.organizations,
      list: async () => [acme],
      current: async () => ({ organization: acme, role: 'member', appRoles: [], memberId: 'm-sanne', globalRoles: [] }),
      people: async () => people,
    },
  }
}

// `u-gone` left Acme, so the general channel names someone unknown.
const rows = { channels: [{ id: 1, name: 'general', member_ids: ['u-bo', 'u-gone'] }] }

// The channel the last create or save wrote, for the checks to read what was stored.
let written: Record<string, unknown> | undefined

const Workspace = ({ start, organizations = true }: { start: string; organizations?: boolean }) => {
  const [api] = useState(() => {
    written = undefined
    return fakeApi({ resources: [channels.toModel()], views: [channelsView.toModel()], rows, afterWrite: (_, row) => void (written = { ...row }) })
  })
  const [session] = useState(() => sessionOf(organizations))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} workspace="Acme" />
    </div>
  )
}

export const OnTheCreateForm: StoryObj = { name: 'On the create form', render: () => <Workspace start="/channels/new" /> }

export const InTheList: StoryObj = { name: 'In the list', render: () => <Workspace start="/channels" /> }

export const WithoutOrganizations: StoryObj = { name: 'Without organizations', render: () => <Workspace start="/channels/1" organizations={false} /> }

const members = (canvasElement: HTMLElement) => within(canvasElement).findByRole('combobox', { name: 'Members' })

/** The create form picks two members by name and saves their user ids; the record shows them, and Edit takes one off. */
export const PicksMembersChecks: StoryObj = {
  ...OnTheCreateForm,
  name: 'Picks members (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Name' }), 'design')
    const box = await members(canvasElement)
    await expect(box).toHaveAttribute('placeholder', 'Search members')
    await userEvent.click(box)
    await userEvent.type(box, 'jan')
    // Typing narrows the members by name: Bo Jansen and Jan Smit hold "jan"
    await waitFor(() => expect(canvas.getAllByRole('option').map((option) => option.textContent)).toEqual(['Bo Jansen', 'Jan Smit']))
    await userEvent.click(canvas.getByRole('option', { name: 'Jan Smit' }))
    await userEvent.type(box, 'sanne{Enter}')
    await expect(canvas.getByRole('button', { name: 'Remove Jan Smit' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Remove Sanne de Vries' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Create channel' }))
    // It stores their user ids, in the order chosen, and the record page shows them by name
    await canvas.findByRole('heading', { name: 'design' })
    expect(written?.member_ids).toEqual(['u-jan', 'u-sanne'])
    await waitFor(() => expect(canvas.getAllByText('Jan Smit')[0]).toBeVisible())
    expect(canvas.getAllByText('Sanne de Vries').length).toBeGreaterThan(0)
  },
}

/** Edit takes a member off and saves the shorter list; an id no longer a member shows as unknown. */
export const TakesOneOffChecks: StoryObj = {
  name: 'Takes one off (checks)',
  tags: ['play', '!dev'],
  render: () => <Workspace start="/channels/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'general' })
    const unknown = await canvas.findByRole('button', { name: 'Remove Unknown member' })
    await expect(canvas.getByRole('button', { name: 'Remove Bo Jansen' })).toBeVisible()
    await userEvent.click(unknown)
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Remove Unknown member' })).toBeNull())
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(written?.member_ids).toEqual(['u-bo']))
    await expect(canvas.getByRole('button', { name: 'Remove Bo Jansen' })).toBeVisible()
  },
}

/** A list's table shows the members by avatar and name, one no longer a member as unknown. */
export const InTheListChecks: StoryObj = {
  ...InTheList,
  name: 'In the list (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Bo Jansen')).toBeVisible()
    expect(canvas.getByText('Unknown member')).toBeVisible()
    expect(canvas.getByText('BJ')).toBeVisible()
  },
}

/** Without organizations the field says plainly that it needs them. */
export const WithoutOrganizationsChecks: StoryObj = {
  ...WithoutOrganizations,
  name: 'Without organizations (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect((await canvas.findAllByText('Choosing members needs organizations: turn them on in the auth config.'))[0]).toBeVisible()
  },
}
