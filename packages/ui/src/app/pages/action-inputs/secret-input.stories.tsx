import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { ViewModel } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'
import { salesResources, salesRows, salesViews } from '../guide/sales-domain'
import { defineUi, type ActionContext } from '../project-ui'

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

const views: ViewModel[] = salesViews.map((view) =>
  view.resource === 'orders'
    ? { ...view, actions: [...view.actions, { name: 'connectCarrier', label: 'Connect carrier', icon: 'key', bulk: false, inputs: [{ name: 'api_key', kind: 'secret', label: 'API key', required: true, help: 'From the carrier’s settings page.' }] }] }
    : view,
)

const viewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
} as const

// The handler keeps the value it got only to compare it; the page shows whether it matched, never the value.
const SecretApp = () => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views, rows: salesRows }))
  const [matched, setMatched] = useState<boolean>()
  const [ui] = useState(() => defineUi({ actions: { connectCarrier: ({ values }: ActionContext) => setMatched(values?.api_key === 'sk-story-1234') } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/orders/1" workspace="Veldhuis Supply" ui={ui} />
      {matched !== undefined && <output aria-label="Handler got the key" className="sr-only">{String(matched)}</output>}
    </div>
  )
}

const meta = { title: 'Record page/Secret input', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const open: StoryObj['play'] = async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Connect carrier' }))
}

export const Phone: StoryObj = { render: () => <SecretApp />, globals: { viewport: { value: 'phone390' } }, play: open }

export const Desktop: StoryObj = { render: () => <SecretApp />, globals: { viewport: { value: 'desktop1280' } }, play: open }

export const Checks: StoryObj = {
  render: () => <SecretApp />,
  name: 'Secret input (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Connect carrier' }))
    const dialog = within(await within(document.body).findByRole('dialog', { name: 'Connect carrier' }))
    const field = dialog.getByRole('textbox')
    expect(field).toHaveAttribute('autocomplete', 'off')
    await userEvent.type(field, 'sk-story-1234')
    // The value is drawn as discs, never as text on the page
    expect(document.body.textContent).not.toContain('sk-story-1234')
    await userEvent.click(dialog.getByRole('button', { name: 'Connect carrier' }))
    await waitFor(() => expect(within(document.body).queryByRole('dialog', { name: 'Connect carrier' })).toBeNull())
    expect((await canvas.findByLabelText('Handler got the key')).textContent).toBe('true')
  },
}
