import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/Related records as compact cards', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// An objective and the causes holding it up: each needs a glance at how long it has held and who has it, and an act

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), statement: f.text() })
  .primaryKey((r) => r.id)

const causes = resource('objective_causes')
  .table('objective_causes')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    objective_id: f.relation('objectives').filterable(),
    title: f.text(),
    state: f.enum(['blocked', 'at_risk', 'clear']).filterable(),
    owner: f.text().optional(),
    tasks: f.integer().optional(),
    since: f.timestamp().sortable(),
  })
  .primaryKey((r) => r.id)

// A hex colour for blocked, so a check can read it back exactly; tones for the others
const blocked = '#b91c1c'

const causesView = view<typeof causes>('objective_causes')
  .title((r) => r.title)
  .names({ singular: 'Cause', plural: 'Causes' })
  .fields((r) => ({
    state: r.state.valueLabels({ blocked: 'Blocked', at_risk: 'At risk', clear: 'Clear' }).valueColors({ blocked, at_risk: 'amber', clear: 'green' }),
    since: r.since.format('relative'),
  }))
  .list((r) => ({ columns: [r.title, r.state, r.owner, r.since] }))
  .actions((a) => [a.update('clear', { label: 'Mark clear', set: { state: 'clear' } })])

const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.title)
  .names({ singular: 'Objective', plural: 'Objectives' })
  .layout((r) => [
    l.related('Holding it up', { resource: 'objective_causes', field: 'objective_id', presentation: 'compact', time: 'since', tone: 'state', columns: ['owner', 'tasks'], actions: ['clear'], sort: 'since' }),
    l.section('Objective', [r.title, r.statement]),
  ])

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

const rows = () => ({
  objectives: [{ id: 1, title: 'A fantastic default UX', statement: 'Protobase comes with a fantastic default UX.' }],
  objective_causes: [
    { id: 1, objective_id: 1, title: 'Related cards push the first action below the fold', state: 'blocked', owner: 'Design', tasks: 3, since: hoursAgo(50) },
    { id: 2, objective_id: 1, title: 'Card colours cannot follow a status', state: 'at_risk', owner: 'Framework', tasks: 1, since: hoursAgo(20) },
    { id: 3, objective_id: 1, title: 'Lists lose their place on the way back', state: 'at_risk', owner: null, tasks: null, since: hoursAgo(3) },
  ],
})

/** The rows the fake server holds, so a play can check what an action stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Objective = () => {
  const [api] = useState(() => {
    const created = fakeApi({ resources: [objectives.toModel(), causes.toModel()], views: [objectivesView.toModel(), causesView.toModel()], rows: rows() })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/objectives/1" />
    </div>
  )
}

export const Compact: StoryObj = { name: 'Causes holding an objective up', render: () => <Objective /> }

export const Phone: StoryObj = { ...Compact, name: 'Causes holding an objective up, on a phone', globals: { viewport: { value: 'mobile360' } } }

const edgeOf = (card: HTMLElement) => card.querySelector<HTMLElement>('[data-tone-edge]')!
const edgeColor = (card: HTMLElement) => getComputedStyle(edgeOf(card)).backgroundColor

/**
 * Each card puts its title and time on one line and its values inline without labels, its state first, with its action
 * beside them; all three and the first action fit in a 1280x720 window. Its edge takes its state's colour, and follows
 * the state an action sets.
 */
export const Checks: StoryObj = {
  ...Compact,
  name: 'Causes holding an objective up (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const section = within((await canvas.findByRole('heading', { name: 'Holding it up' })).closest('section')!)
    const link = await section.findByRole('link', { name: 'Related cards push the first action below the fold' })
    expect(link.getAttribute('href')).toBe('/objective_causes/1')
    const first = link.closest('li')!
    const card = within(first)

    const time = await card.findByText(/ago/)
    expect(Math.abs(time.getBoundingClientRect().top - link.getBoundingClientRect().top)).toBeLessThan(8)
    expect(card.getByText('Design')).toBeVisible()
    expect(card.queryByText('Owner')).toBeNull()
    expect(card.queryByText('Since')).toBeNull()
    // The state in words too, so its colour is never all that says it
    expect(card.getByText('Blocked')).toBeVisible()

    const third = (await section.findByRole('link', { name: 'Lists lose their place on the way back' })).closest('li')!
    const action = card.getByRole('button', { name: 'Mark clear: Related cards push the first action below the fold' })
    // Each card's action names its record after its label, so a screen reader tells them apart
    for (const title of ['Card colours cannot follow a status', 'Lists lose their place on the way back']) {
      expect(within((await section.findByRole('link', { name: title })).closest('li')!).getByRole('button', { name: `Mark clear: ${title}` })).toBeVisible()
    }
    expect(third.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
    expect(action.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)

    expect(edgeColor(first)).toBe('rgb(185, 28, 28)')
    const amber = edgeColor(third)
    expect(amber).not.toBe(edgeColor(first))
    await userEvent.click(action)
    await waitFor(() => expect(stored.objective_causes!.find((row) => row.id === 1)?.state).toBe('clear'))
    await waitFor(() => expect(edgeOf(first)).toHaveClass('bg-success'))
    expect(card.getByText('Clear')).toBeVisible()
    expect(edgeColor(first)).not.toBe(amber)
  },
}
