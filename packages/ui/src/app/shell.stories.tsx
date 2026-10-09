import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { navOpenStorageKey } from '../app-shell/nav-open-storage'
import { AssistantDock } from '../assistant-dock'
import { Button } from '../primitives/button'
import { App } from './app'
import { fakeClient } from './testing/fake-client'

const meta = { title: 'Shell', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })
const allowed = { create: true, update: true, delete: true, conditional: [] }

/** `nav.recent` and `userMenu` from `/meta`, rendered by the real app: records with status dots, then the user menu. */
export const RecentAndUserMenu: StoryObj = {
  tags: ['play'],
  beforeEach: () => localStorage.removeItem(navOpenStorageKey('orders')),
  render: () => (
    <div className="h-screen">
      <App
        client={fakeClient({
          permissions: allowed,
          nav: { recent: { status: 'status', tones: { draft: 'neutral', shipped: 'success' }, pulse: ['draft'] } },
          userMenu: { items: [{ kind: 'link', label: 'Support', href: 'mailto:help@example.test', icon: 'life-buoy' }] },
        })}
        auth={session}
        initialUrl="/orders"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = await canvas.findByRole('list', { name: 'Recent orders' })
    await within(list).findByRole('link', { name: 'SO-1, Draft' })
    expect(within(list).getAllByRole('link').map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual(['SO-1, Draft', 'SO-2, Shipped', 'SO-3, Shipped', 'View all'])
    expect(within(list).getByRole('link', { name: 'SO-1, Draft' }).querySelector('[data-tone="neutral"][data-pulse]')).not.toBeNull()
    expect(within(list).getByRole('link', { name: 'SO-2, Shipped' }).querySelector('[data-tone="success"]')).not.toBeNull()

    await userEvent.click(within(list).getByRole('link', { name: 'SO-2, Shipped' }))
    await canvas.findByRole('heading', { name: 'SO-2' })
    expect(within(list).getByRole('link', { name: 'SO-2, Shipped' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(within(list).getByRole('link', { name: 'View all' }))
    await canvas.findByRole('button', { name: /New order/ })

    await userEvent.click(canvas.getByRole('button', { name: 'Profile menu' }))
    const menu = await canvas.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Support', 'Sign out'])
  },
}

/** The project's `shell` slots from `protobase.ui.tsx`: a top-bar action, and the assistant dock as the right panel. */
export const ProjectShellSlots: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App
        client={fakeClient({ permissions: allowed })}
        auth={session}
        initialUrl="/orders"
        ui={{ shell: { actions: () => <Button size="sm">Assistant</Button>, rightPanel: () => <AssistantDock items={[]} balance={12} /> } }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('button', { name: 'Assistant' })
    const dock = canvas.getByRole('complementary', { name: 'Assistant' })
    within(dock).getByText('12 credits')
    expect(within(dock).getByRole('textbox', { name: 'Message' })).toBeEnabled()
  },
}
