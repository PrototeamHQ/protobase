import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { accountTabs, Page, page, Settings, Tab, Tabs, withSettingsFields } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Composed pages/Settings', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'u-ana', email: 'ana@shop.example', name: 'Ana de Vries', role: 'sales' })

// Each person's notification choices, one record per person, kept by the account page's Notifications tab

const preferences = resource('preferences')
  .table('preferences')
  .fields({
    user_id: f.text(),
    digest: f.enum(['daily', 'weekly', 'never']).default('weekly'),
    mentions: f.boolean().default(true),
    signature: f.text().optional(),
  })
  .primaryKey((r) => r.user_id)
  .owner((r) => r.user_id)

const preferencesView = view<typeof preferences>('preferences').fields((r) => ({
  digest: r.digest.label('Email digest').help('A summary of what changed in your orders.').valueLabels({ daily: 'Every day', weekly: 'Every week', never: 'Never' }),
  mentions: r.mentions.label('Email me when someone mentions me'),
  signature: r.signature.label('Signature').help('Under the emails you send to customers.'),
}))

const account = page(
  'account',
  Page({
    title: 'Account',
    children: Tabs({
      children: [
        Tab({ name: 'notifications', label: 'Notifications', children: Settings({ resource: 'preferences', title: 'Notifications', description: 'What we email you about.' }) }),
        accountTabs.profile,
      ],
    }),
  }),
)

const Account = ({ saved }: { saved?: Record<string, unknown> }) => {
  const model = preferences.toModel()
  // Each write shows the stored rows again, for the checks to read
  const [, setWrites] = useState(0)
  const [api] = useState(() =>
    fakeApi({
      afterWrite: () => setWrites((count) => count + 1),
      resources: [model],
      views: [preferencesView.toModel()],
      account: withSettingsFields(account.toModel(), { preferences: model }),
      rows: { preferences: saved ? [saved] : [] },
    }),
  )
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/-/account" />
      <output data-testid="rows" hidden>
        {JSON.stringify(api.rows.preferences)}
      </output>
    </div>
  )
}

export const Defaults: StoryObj = { name: 'Settings before the first save', render: () => <Account /> }

export const Saved: StoryObj = { name: 'Settings someone saved', render: () => <Account saved={{ user_id: 'u-ana', digest: 'daily', mentions: false, signature: 'Ana, Shop' }} /> }

export const Phone: StoryObj = { ...Defaults, name: 'Settings, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * Before the first save the defaults show; the first change creates the record, a later one updates it, and typed
 * text waits for Save.
 */
export const Checks: StoryObj = {
  ...Defaults,
  name: 'Settings before the first save (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const digest = await canvas.findByRole('combobox', { name: 'Email digest' })
    expect(digest).toHaveValue('weekly')
    expect(canvas.getByRole('switch', { name: 'Email me when someone mentions me' })).toBeChecked()
    expect(canvas.queryByRole('button', { name: 'Save' })).toBeNull()

    await userEvent.selectOptions(digest, 'Every day')
    await waitFor(() => expect(JSON.parse(canvas.getByTestId('rows').textContent!)).toEqual([expect.objectContaining({ digest: 'daily', mentions: true })]))

    await userEvent.click(canvas.getByRole('switch', { name: 'Email me when someone mentions me' }))
    await waitFor(() => expect(JSON.parse(canvas.getByTestId('rows').textContent!)).toEqual([expect.objectContaining({ digest: 'daily', mentions: false })]))

    await userEvent.type(canvas.getByRole('textbox', { name: 'Signature' }), 'Ana')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(JSON.parse(canvas.getByTestId('rows').textContent!)).toEqual([expect.objectContaining({ signature: 'Ana' })]))
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Save' })).toBeNull())
  },
}

/** A saved record shows its values. */
export const SavedChecks: StoryObj = {
  ...Saved,
  name: 'Settings someone saved (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('combobox', { name: 'Email digest' })).toHaveValue('daily')
    expect(canvas.getByRole('switch', { name: 'Email me when someone mentions me' })).not.toBeChecked()
    expect(canvas.getByRole('textbox', { name: 'Signature' })).toHaveValue('Ana, Shop')
  },
}
