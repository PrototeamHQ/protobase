import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/Compact cards without buttons', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A release and the notes it ships, read at a glance: no action or button beside them, and values that run long

const releases = resource('releases')
  .table('releases')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const notes = resource('release_notes')
  .table('release_notes')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    release_id: f.relation('releases').filterable(),
    title: f.text(),
    area: f.text().optional(),
    reporter: f.text().optional(),
    since: f.timestamp().sortable(),
  })
  .primaryKey((r) => r.id)

const notesView = view<typeof notes>('release_notes')
  .title((r) => r.title)
  .names({ singular: 'Note', plural: 'Notes' })
  .fields((r) => ({ since: r.since.format('relative') }))

const releasesView = view<typeof releases>('releases')
  .title((r) => r.title)
  .names({ singular: 'Release', plural: 'Releases' })
  .layout((r) => [
    l.related('Notes', { resource: 'release_notes', field: 'release_id', presentation: 'compact', time: 'since', columns: ['area', 'reporter'], sort: 'since' }),
    l.section('Release', [r.title]),
  ])

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

const rows = () => ({
  releases: [{ id: 1, title: 'Spring release' }],
  release_notes: [
    {
      id: 1,
      release_id: 1,
      title: 'Exports keep their order',
      area: 'Spreadsheet exports, scheduled reports and the archive download',
      reporter: 'The support desk on behalf of three customers in the north region',
      since: hoursAgo(30),
    },
    { id: 2, release_id: 1, title: 'Search finds archived records', area: 'Search', reporter: 'Design', since: hoursAgo(4) },
  ],
})

const Release = () => {
  const [api] = useState(() => fakeApi({ resources: [releases.toModel(), notes.toModel()], views: [releasesView.toModel(), notesView.toModel()], rows: rows() }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/releases/1" />
    </div>
  )
}

export const Compact: StoryObj = { name: 'Notes with long values', render: () => <Release /> }

export const Phone: StoryObj = { ...Compact, name: 'Notes with long values, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * Long values go on their own line below the title and time, wrapping or truncating within the card, so the title and
 * time keep their room; a card with short values reads the same.
 */
const play: StoryObj['play'] = async ({ canvasElement }) => {
  const section = within((await within(canvasElement).findByRole('heading', { name: 'Notes' })).closest('section')!)
  for (const name of ['Exports keep their order', 'Search finds archived records']) {
    const link = await section.findByRole('link', { name })
    const card = link.closest('li')!
    await waitFor(() => expect(card.querySelector('time')).not.toBeNull())
    const box = card.getBoundingClientRect()
    const time = card.querySelector('time')!
    const title = link.getBoundingClientRect()
    // The title's line takes the card's width, its time beside the title, both inside the card
    expect(link.parentElement!.getBoundingClientRect().width).toBeGreaterThan(box.width * 0.8)
    expect(Math.abs(time.getBoundingClientRect().top - title.top)).toBeLessThan(8)
    expect(time.getBoundingClientRect().left).toBeGreaterThan(title.right)
    expect(time.getBoundingClientRect().right).toBeLessThanOrEqual(box.right)
    // The values sit below it, within the card
    const values = card.querySelector<HTMLElement>(':scope > div:nth-of-type(2)')!.getBoundingClientRect()
    expect(values.top).toBeGreaterThanOrEqual(title.bottom)
    expect(values.right).toBeLessThanOrEqual(box.right)
  }
}

export const Checks: StoryObj = { ...Compact, name: 'Notes with long values (checks)', tags: ['play', '!dev'], play }

export const PhoneChecks: StoryObj = { ...Phone, name: 'Notes with long values, on a phone (checks)', tags: ['play', 'phone', '!dev'], play }
