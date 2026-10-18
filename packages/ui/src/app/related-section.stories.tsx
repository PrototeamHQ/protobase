import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { objectiveResources, objectiveRows, objectiveViews } from './testing/objectives-domain'

const meta = { title: 'Record page/Related records cut off', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const Objective = ({ path }: { path: string }) => {
  const [api] = useState(() => fakeApi({ resources: objectiveResources, views: objectiveViews, rows: objectiveRows }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

// The Tasks section, once its rows are in
const tasksSection = async (canvasElement: HTMLElement) => {
  const heading = await within(canvasElement).findByRole('heading', { name: 'Tasks' }, { timeout: 5000 })
  const region = heading.closest('section')!
  await within(region).findAllByRole('row')
  return region
}

/** An objective with four tasks lists its first three, and says it shows only the first three of four beside View all. */
export const CutOff: StoryObj = {
  tags: ['play'],
  render: () => <Objective path="/objectives/1" />,
  play: async ({ canvasElement }) => {
    const region = await tasksSection(canvasElement)
    await waitFor(() => expect(within(region).getAllByRole('row').slice(1)).toHaveLength(3))
    expect(within(region).getByText('The first 3 of 4.')).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /View all/ })).toBeInTheDocument()
  },
}

/** An objective with two tasks lists them both, with no note, still beside View all. */
export const AllShown: StoryObj = {
  tags: ['play'],
  render: () => <Objective path="/objectives/3" />,
  play: async ({ canvasElement }) => {
    const region = await tasksSection(canvasElement)
    await waitFor(() => expect(within(region).getAllByRole('row').slice(1)).toHaveLength(2))
    expect(within(region).queryByText(/The first/)).toBeNull()
    expect(within(region).getByRole('link', { name: /View all/ })).toBeInTheDocument()
  },
}
