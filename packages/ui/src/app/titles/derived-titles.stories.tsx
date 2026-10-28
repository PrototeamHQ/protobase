import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type OrganizationPerson } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { defineUi } from '../pages/project-ui'
import { fakeApi } from '../testing/fake-api'
import type { TitleRule } from './title-rule'

const meta = { title: 'Shell/Derived titles', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// Direct messages hold their members and no name, so each member sees one named after the others.
const directMessages = resource('direct_messages')
  .table('direct_messages')
  .fields({ id: f.text().readOnly().filterable().sortable(), member_ids: f.json() })
  .primaryKey((r) => r.id)

const directMessagesView = view<typeof directMessages>('direct_messages')
  .names({ singular: 'Direct message', plural: 'Direct messages' })
  .titleFrom('memberNames', (r) => [r.member_ids])
  .nav({ recent: { orderBy: 'id asc' } })

const people: OrganizationPerson[] = [
  { id: 'u-maya', name: 'Maya Jansen' },
  { id: 'u-sam', name: 'Sam Okafor' },
]

const memberNames: TitleRule = (record, reader) => {
  const others = (record.member_ids as string[]).filter((id) => id !== reader.user?.id).map((id) => reader.member(id)?.name)
  return others.every(Boolean) ? others.join(', ') : undefined
}

const ui = defineUi({ titles: { memberNames } })

const acme = { id: 'org-acme', name: 'Acme', slug: 'acme' }

// A member of Acme, whose people come once `names` settles.
const sessionOf = (id: string, name: string, names: Promise<void>): AuthSession => {
  const base = createStaticSession('story-token', { id, email: `${id}@acme.example`, name, role: 'user' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), organizations: { create: 'everyone', roles: [] } }),
    organizations: {
      ...base.organizations,
      current: async () => ({ organization: acme, role: 'member', appRoles: [], memberId: `m-${id}`, globalRoles: [] }),
      list: async () => [acme],
      people: () => names.then(() => people),
    },
  }
}

const Chat = ({ id, name, held }: { id: string; name: string; held?: boolean }) => {
  const [gate] = useState(() => {
    let release = () => {}
    const names = held ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
    return { names, release }
  })
  const [client] = useState(
    () => fakeApi({ resources: [directMessages.toModel()], views: [directMessagesView.toModel(directMessages.toModel())], rows: { direct_messages: [{ id: 'dm-1', member_ids: ['u-maya', 'u-sam'] }] } }).client,
  )
  return (
    <div className="h-screen">
      {held && (
        <button type="button" className="fixed right-4 bottom-4 z-50 rounded border bg-background px-3 py-1.5 text-sm" onClick={gate.release}>
          Load names
        </button>
      )}
      <App client={client} auth={sessionOf(id, name, gate.names)} ui={ui} initialUrl="/direct_messages/dm-1" />
    </div>
  )
}

const expectTitled = async (canvasElement: HTMLElement, title: string) => {
  const canvas = within(canvasElement)
  const recent = await canvas.findByRole('list', { name: 'Recent direct messages' })
  expect(await within(recent).findByRole('link', { name: title })).toHaveAttribute('href', '/direct_messages/dm-1')
  const trail = within(await canvas.findByRole('navigation', { name: 'Breadcrumb' }))
  expect(await trail.findByRole('link', { name: title })).toHaveAttribute('aria-current', 'page')
  expect(await canvas.findByRole('heading', { name: title })).toBeVisible()
  await waitFor(() => expect(document.title).toContain(title))
}

/** Maya reads the conversation she has with Sam: it is named after him, in the sidebar, breadcrumb, heading and tab. */
export const MayaSeesSam: StoryObj = {
  tags: ['play'],
  render: () => <Chat id="u-maya" name="Maya Jansen" />,
  play: async ({ canvasElement }) => expectTitled(canvasElement, 'Sam Okafor'),
}

/** Sam reads the same record, named after Maya. */
export const SamSeesMaya: StoryObj = {
  tags: ['play'],
  render: () => <Chat id="u-sam" name="Sam Okafor" />,
  play: async ({ canvasElement }) => expectTitled(canvasElement, 'Maya Jansen'),
}

/** Until the members' names load, the record is titled by its key; then by the other member's name. */
export const KeyWhileNamesLoad: StoryObj = {
  tags: ['play'],
  render: () => <Chat id="u-maya" name="Maya Jansen" held />,
  play: async ({ canvasElement }) => {
    await expectTitled(canvasElement, 'dm-1')
    within(canvasElement).getByRole('button', { name: 'Load names' }).click()
    await expectTitled(canvasElement, 'Sam Okafor')
  },
}
