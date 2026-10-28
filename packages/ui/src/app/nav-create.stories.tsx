import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { NavModel } from '@protobase/schema'
import { navOpenStorageKey } from '../app-shell/nav-open-storage'
import { App } from './app'
import { fakeClient } from './testing/fake-client'

const meta = { title: 'Shell/Create link', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })
const allowed = { create: true, update: true, delete: true, conditional: [] }
const refused = { ...allowed, create: false }

const app = (permissions: typeof allowed, nav: NavModel, initialUrl = '/orders/o1') => () => (
  <div className="h-screen">
    <App client={fakeClient({ permissions, nav })} auth={session} initialUrl={initialUrl} />
  </div>
)

const sidebar = (canvasElement: HTMLElement) => within(canvasElement).findByRole('navigation', { name: 'Resources' })

/** `nav({ create: true })`: "New order" under the entry, a link to `/orders/new` that opens the create form. */
export const CreateLink: StoryObj = {
  tags: ['play'],
  render: app(allowed, { create: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'SO-1' })
    const link = await within(await sidebar(canvasElement)).findByRole('link', { name: 'New order' })
    expect(link).toHaveAttribute('href', '/orders/new')
    await userEvent.click(link)
    await canvas.findByRole('heading', { name: 'New order' })
  },
}

/** `create: { label }` names the link, here beside recent records, and stays in view with the records hidden. */
export const CreateLinkWithLabel: StoryObj = {
  tags: ['play'],
  beforeEach: () => localStorage.removeItem(navOpenStorageKey('orders')),
  render: app(allowed, { recent: { orderBy: 'id asc' }, create: { label: 'Start an order' } }),
  play: async ({ canvasElement }) => {
    const nav = within(await sidebar(canvasElement))
    expect(await nav.findByRole('link', { name: 'Start an order' })).toHaveAttribute('href', '/orders/new')
    await userEvent.click(nav.getByRole('button', { name: 'Recent orders' }))
    expect(nav.getByRole('link', { name: 'Start an order' })).toBeVisible()
  },
}

/** A user who may not create gets no link, though the view asks for one. */
export const CreateLinkRefused: StoryObj = {
  tags: ['play'],
  render: app(refused, { create: true }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('heading', { name: 'SO-1' })
    const nav = within(await sidebar(canvasElement))
    await nav.findByRole('link', { name: 'Orders' })
    expect(nav.queryByRole('link', { name: 'New order' })).toBeNull()
  },
}

/** The phone drawer shows the link too. */
export const CreateLinkInDrawer: StoryObj = {
  tags: ['play', 'phone'],
  parameters: { viewport: { options: { phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' } } } },
  globals: { viewport: { value: 'phone390' } },
  render: app(allowed, { create: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Open navigation' }))
    const drawer = within(await canvas.findByRole('dialog', { name: 'Navigation' }))
    expect(await drawer.findByRole('link', { name: 'New order' })).toHaveAttribute('href', '/orders/new')
  },
}
