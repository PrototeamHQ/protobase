import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { accountPage } from '@protobase/layout'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Shell/No resources', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const Empty = () => {
  const [client] = useState(() => fakeApi({ resources: [], rows: {}, account: accountPage.toModel() }).client)
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl="/admin/" basePath="/admin" />
    </div>
  )
}

/** An app with no resources and no pages, such as one that only signs people in, opens on the person's account page. */
export const OpensAccount: StoryObj = {
  tags: ['play'],
  render: () => <Empty />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Account', level: 1 })
    await canvas.findByRole('heading', { name: 'Profile', level: 2 })
    expect(within(canvas.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Account')).toBeInTheDocument()
    expect(canvas.queryByText('Choose a resource')).toBeNull()
  },
}
