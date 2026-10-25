import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { accountPage, accountTabs, Card, Page, page, Passkeys, Tab, Tabs, TwoFactor, type PageModel } from '@protobase/layout'
import { App } from '../app/app'
import { fakeApi } from '../app/testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Shell/Account page', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })

// An app's own account page: the standard profile, its security tab wrapped with a note and without connected
// accounts, and a tab of its own; the connected apps tab is left out.
const own = page(
  'account',
  Page({
    title: 'Account',
    children: Tabs({
      children: [
        accountTabs.profile,
        Tab({ name: 'security', label: 'Sign-in & security', children: [Card({ title: 'Company policy', children: 'Passkeys are required for staff.' }), Passkeys({}), TwoFactor({})] }),
        Tab({ name: 'privacy', label: 'Privacy', children: Card({ title: 'Analytics', children: 'We count visits without cookies.' }) }),
      ],
    }),
  }),
)

const Account = ({ url = '/-/account', account }: { url?: string; account: PageModel }) => {
  const [api] = useState(() => fakeApi({ resources: [], rows: {}, account }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={url} />
    </div>
  )
}

/** The standard account page, in an app without OAuth providers or MCP: no connected apps tab. */
export const Standard: StoryObj = { name: 'The standard account page', render: () => <Account account={accountPage.toModel()} /> }

export const Phone: StoryObj = { ...Standard, name: 'The standard account page, on a phone', globals: { viewport: { value: 'mobile360' } } }

export const Security: StoryObj = { name: 'Sign-in & security', render: () => <Account url="/-/account/security" account={accountPage.toModel()} /> }

export const Own: StoryObj = { name: "The app's own account page", render: () => <Account url="/-/account/security" account={own.toModel()} /> }

/** Each tab is at its own address below `/-/account`, named in the browser tab's title; a tab with nothing to show is left out. */
export const Checks: StoryObj = {
  ...Standard,
  name: 'The standard account page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = within(await canvas.findByRole('navigation', { name: 'Tabs' }))
    expect(nav.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Profile', '/-/account'],
      ['Sign-in & security', '/-/account/security'],
      ['Devices', '/-/account/devices'],
    ])
    expect(await canvas.findByText('ana@shop.example')).toBeVisible()
    await waitFor(() => expect(document.title).toBe('Profile · Account · Protobase'))

    await userEvent.click(nav.getByRole('link', { name: 'Sign-in & security' }))
    expect(await canvas.findByRole('region', { name: 'Passkeys' })).toBeVisible()
    expect(canvas.queryByRole('region', { name: 'Profile' })).toBeNull()
    await waitFor(() => expect(document.title).toBe('Sign-in & security · Account · Protobase'))
  },
}

/** The app's own page replaces the standard one, at the same address. */
export const OwnChecks: StoryObj = {
  ...Own,
  name: "The app's own account page (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = within(await canvas.findByRole('navigation', { name: 'Tabs' }))
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['Profile', 'Sign-in & security', 'Privacy'])
    expect(await canvas.findByRole('heading', { name: 'Company policy' })).toBeVisible()
    expect(await canvas.findByRole('region', { name: 'Passkeys' })).toBeVisible()
  },
}
