import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Related records as compact cards/A card leaving its section', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// The causes still holding an objective up: marking one clear takes it out of the section

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const causes = resource('objective_causes')
  .table('objective_causes')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    objective_id: f.relation('objectives').filterable(),
    title: f.text(),
    state: f.enum(['blocked', 'clear']).filterable(),
  })
  .primaryKey((r) => r.id)

const causesView = view<typeof causes>('objective_causes')
  .title((r) => r.title)
  .names({ singular: 'Cause', plural: 'Causes' })
  .fields((r) => ({ state: r.state.valueLabels({ blocked: 'Blocked', clear: 'Clear' }) }))
  .actions((a) => [a.update('clear', { label: 'Mark clear', set: { state: 'clear' } })])

const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.title)
  .names({ singular: 'Objective', plural: 'Objectives' })
  .layout((r) => [
    l.related('Holding it up', { resource: 'objective_causes', field: 'objective_id', presentation: 'compact', filter: 'state != "clear"', columns: ['state'], actions: ['clear'], sort: 'id' }),
    l.section('Objective', [r.title]),
  ])

const titles = ['Cards push the first action below the fold', 'Card colours cannot follow a status', 'Lists lose their place on the way back']

const Objective = ({ count }: { count: number }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [objectives.toModel(), causes.toModel()],
      views: [objectivesView.toModel(), causesView.toModel()],
      rows: {
        objectives: [{ id: 1, title: 'A fantastic default UX' }],
        objective_causes: titles.slice(0, count).map((title, index) => ({ id: index + 1, objective_id: 1, title, state: 'blocked' })),
      },
    }),
  )
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/objectives/1" />
    </div>
  )
}

// Marks the card titled `title` clear with the keyboard, and waits for it to leave
const clearByKeyboard = async (canvasElement: HTMLElement, title: string) => {
  const section = within((await within(canvasElement).findByRole('heading', { name: 'Holding it up' })).closest('section')!)
  const button = await section.findByRole('button', { name: `Mark clear: ${title}` })
  button.focus()
  await userEvent.keyboard('{Enter}')
  await waitFor(() => expect(section.queryByRole('link', { name: title })).toBeNull())
  await waitFor(() => expect(section.getByRole('status')).toHaveTextContent(`Done: Mark clear, ${title}. It has left this list.`))
  return section
}

/** Clearing the middle card moves focus to the next card's action, and says the card left. */
export const Middle: StoryObj = {
  name: 'The middle card leaving',
  tags: ['play', '!dev'],
  render: () => <Objective count={3} />,
  play: async ({ canvasElement }) => {
    const section = await clearByKeyboard(canvasElement, titles[1]!)
    await waitFor(() => expect(document.activeElement).toBe(section.getByRole('button', { name: `Mark clear: ${titles[2]}` })))
  },
}

/** Clearing the last card moves focus to the previous card's action. */
export const Last: StoryObj = {
  name: 'The last card leaving',
  tags: ['play', '!dev'],
  render: () => <Objective count={3} />,
  play: async ({ canvasElement }) => {
    const section = await clearByKeyboard(canvasElement, titles[2]!)
    await waitFor(() => expect(document.activeElement).toBe(section.getByRole('button', { name: `Mark clear: ${titles[1]}` })))
  },
}

/** Clearing the only card moves focus to the section's heading. */
export const Only: StoryObj = {
  name: 'The only card leaving',
  tags: ['play', '!dev'],
  render: () => <Objective count={1} />,
  play: async ({ canvasElement }) => {
    const section = await clearByKeyboard(canvasElement, titles[0]!)
    await waitFor(() => expect(document.activeElement).toBe(section.getByRole('heading', { name: 'Holding it up' })))
  },
}
