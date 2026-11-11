import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/Read-only values and a title badge', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// An objective whose verdict and last sign of life the loop keeps: facts to read on its form, beside a stage to change

const objectives = resource('objectives')
  .table('objectives')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    stage: f.enum(['exploring', 'building', 'sustaining']),
    verdict: f.enum(['moving', 'slowing', 'stuck']).optional().readOnly(),
    headline: f.text().optional().readOnly(),
    last_sign_at: f.timestamp().optional().readOnly(),
    open_tasks: f.integer().optional().readOnly(),
  })
  .primaryKey((r) => r.id)

// A hex colour for stuck, so a check can read it back exactly; tones for the others
const stuck = '#b91c1c'

const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.title)
  .names({ singular: 'Objective', plural: 'Objectives' })
  .fields((r) => ({
    stage: r.stage.label('Stage').valueLabels({ exploring: 'Exploring', building: 'Building', sustaining: 'Sustaining' }).valueColors({ exploring: 'violet', building: 'amber', sustaining: 'green' }),
    verdict: r.verdict.label('Verdict').valueLabels({ moving: 'Moving', slowing: 'Slowing', stuck: 'Stuck' }).valueColors({ moving: 'green', slowing: 'amber', stuck }),
    headline: r.headline.label('Headline'),
    last_sign_at: r.last_sign_at.label('Last sign of life').format('relative'),
    open_tasks: r.open_tasks.label('Open tasks'),
  }))
  .titleBadge((r) => r.verdict)
  .layout((r) => [l.section('Verdict', [r.verdict, r.headline, r.last_sign_at, r.open_tasks]), l.section('Objective', [r.title, r.stage])])
  .actions((a) => [a.update('stall', { label: 'Mark stuck', set: { verdict: 'stuck' } })])

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

const rows = () => ({
  objectives: [{ id: 1, title: 'A fantastic default UX', stage: 'building', verdict: 'slowing', headline: 'Two causes hold it up', last_sign_at: hoursAgo(3), open_tasks: 4 }],
})

/** The rows the fake server holds, so a play can check what an action stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Objective = () => {
  const [api] = useState(() => {
    const created = fakeApi({ resources: [objectives.toModel()], views: [objectivesView.toModel(objectives.toModel())], rows: rows() })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/objectives/1" />
    </div>
  )
}

export const ReadValues: StoryObj = { name: 'An objective with its verdict', render: () => <Objective /> }

export const Phone: StoryObj = { ...ReadValues, name: 'An objective with its verdict, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * The form shows the verdict, headline, last sign of life and open tasks as values, not inputs: the verdict a badge in
 * its colour, the time relative, the text at full contrast. The title's badge is the verdict, and follows it.
 */
export const Checks: StoryObj = {
  ...ReadValues,
  name: 'An objective with its verdict (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole('heading', { level: 1, name: 'A fantastic default UX' })
    const header = within(heading.parentElement!)
    expect(header.getByText('Slowing')).toBeVisible()

    const section = (await canvas.findByRole('heading', { name: 'Verdict' })).closest('section')!
    expect(section.querySelectorAll('input, select, textarea')).toHaveLength(0)
    const verdict = within(section).getByText('Slowing')
    expect(verdict.className).toContain('bg-warning-soft')
    expect(within(section).getByText('3 hours ago').title).toMatch(/\d/)
    const headline = within(section).getByText('Two causes hold it up')
    // Full contrast: the colour of the page's text, not the muted one a disabled input has
    expect(getComputedStyle(headline).color).toBe(getComputedStyle(heading).color)
    // The stage stays a choice
    expect(within((await canvas.findByRole('heading', { name: 'Objective' })).closest('section')!).getByRole('combobox')).toBeVisible()

    await userEvent.click(await canvas.findByRole('button', { name: 'Mark stuck' }))
    await waitFor(() => expect(stored.objectives![0]!.verdict).toBe('stuck'))
    await waitFor(() => expect(getComputedStyle(header.getByText('Stuck')).backgroundColor).toBe('rgb(185, 28, 28)'))
    await waitFor(() => expect(getComputedStyle(within(section).getByText('Stuck')).backgroundColor).toBe('rgb(185, 28, 28)'))
  },
}
