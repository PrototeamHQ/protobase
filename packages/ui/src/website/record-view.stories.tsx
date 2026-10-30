import type { Meta, StoryObj } from '@storybook/react-vite'
import { createStaticSession } from '@protobase/client'
import { App } from '../app/app'
import { fakeInvoiceClient } from '../app/testing/fake-invoice-client'
import { Screen } from './screen'

const meta = { title: 'Website/RecordView', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })

/** A record page with its lines, edited in place by the record lines editor. */
export const RecordView: StoryObj = {
  render: () => (
    <Screen>
      <App client={fakeInvoiceClient().client} auth={session} initialUrl="/invoices/i1" />
    </Screen>
  ),
}
