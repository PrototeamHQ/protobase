import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from '../app/app'
import { fakeClient } from '../app/testing/fake-client'
import { fakeRings, type FakeRings } from '../app/testing/fake-rings'

const meta = { title: 'Components/Call/Ring', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'bob', email: 'bob@example.test', name: 'Bob Stone', role: 'user' })
const allowed = { create: true, update: true, delete: true, conditional: [] }
const ring = { call: '4b1f0000-0000-4000-8000-000000000001', resource: 'orders', key: 'o1', started_by: 'ann', title: 'Ann Lee is calling', body: 'SO-1', remaining_ms: 30_000 }

const inApp = (rings: FakeRings) => () => (
  <div className="h-[100dvh]">
    <App client={fakeClient({ permissions: allowed, rings })} auth={session} initialUrl="/orders" />
  </div>
)

const ringing = async () => {
  const page = within(document.body)
  const alert = await page.findByRole('alert')
  expect(alert).toHaveTextContent('Ann Lee is calling')
  expect(alert).toHaveTextContent('SO-1')
  // Accept is a link to the record's page that joins its call there.
  expect(within(alert).getByRole('link', { name: 'Accept' })).toHaveAttribute('href', '/orders/o1?call=join')
  return alert
}

const declining = fakeRings([ring])

/** A call rings on whatever page is open, with Decline and Accept; Decline stops it, here and on every other page. */
export const Decline: StoryObj = {
  tags: ['play'],
  render: inApp(declining),
  play: async () => {
    const alert = await ringing()
    await userEvent.click(within(alert).getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(within(document.body).queryByRole('alert')).toBeNull())
    expect(declining.declined).toEqual([ring.call])
  },
}

const answered = fakeRings([ring])

/** An answer on another device stops the ring here too, as the page's live stream says. */
export const AnsweredElsewhere: StoryObj = {
  tags: ['play'],
  render: inApp(answered),
  play: async () => {
    await ringing()
    answered.elsewhere()
    await waitFor(() => expect(within(document.body).queryByRole('alert')).toBeNull())
  },
}
