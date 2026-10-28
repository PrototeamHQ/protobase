import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { component } from '@protobase/layout'
import type { ViewModel } from '@protobase/schema'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView } from '../../../../docs-examples/bike-shop/step-5'
import * as workshop from '../../../../docs-examples/reference/workshop'
import { App } from './app'
import { defineUi } from './pages/project-ui'
import { fakeApi } from './testing/fake-api'
import { RepairNotes } from './testing/repair-notes'

const meta = { title: 'Record page/Full-area record page', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const BrokenNotes = () => {
  throw new Error('The notes cannot draw')
}

const ui = defineUi({ components: { RepairNotes, BrokenNotes } })

const withNotes = workshop.repairsView.record({ component: component('RepairNotes') })

/** The shop at `start`, in the browser's own history when `browser`, so its Back button can be checked. */
const Shop = ({ start, repairsView = withNotes, browser = false }: { start: string; repairsView?: { toModel(): ViewModel }; browser?: boolean }) => {
  useState(() => browser && window.history.replaceState(null, '', start))
  const [api] = useState(() =>
    fakeApi({
      resources: [customers.toModel(), repairs.toModel()],
      views: [customersView.toModel(), repairsView.toModel()],
      rows: { customers: customerRows, repairs: repairRows },
      bottomBar: { label: 'Shop', items: [{ kind: 'resource', resource: 'repairs', label: 'Repairs' }] },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} {...(!browser && { initialUrl: start })} ui={ui} workspace="Pip's bike shop" />
    </div>
  )
}

const phone360 = { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' }

/** A repair's page as the app's own notes, filling the area beside the sidebar and under the top bar. */
export const RepairNotesPage: StoryObj = { name: "A repair's notes fill the page", render: () => <Shop start="/repairs/1" /> }

// The notes fill the area from the top bar to `bottom`, and from the top bar's left edge to the screen's right edge;
// the document does not scroll, while the notes do, with the note box in view; the standard page's parts are not there
const fillsTheArea = async (canvasElement: HTMLElement, bottom: () => number) => {
  const canvas = within(canvasElement)
  const notes = await canvas.findByRole('region', { name: 'Repair notes' })
  const header = canvasElement.querySelector('header')!.getBoundingClientRect()
  const area = notes.getBoundingClientRect()
  expect(area.top).toBeCloseTo(header.bottom, 0)
  expect(area.bottom).toBeCloseTo(bottom(), 0)
  expect(area.left).toBeCloseTo(header.left, 0)
  expect(area.right).toBeCloseTo(window.innerWidth, 0)
  expect(document.scrollingElement!.scrollHeight).toBe(window.innerHeight)
  const list = canvas.getByRole('list', { name: 'Notes' })
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
  list.scrollTop = list.scrollHeight
  await waitFor(() => expect(list.scrollTop).toBeGreaterThan(0))
  const box = canvas.getByRole('textbox', { name: 'New note' }).getBoundingClientRect()
  expect(box.bottom).toBeLessThanOrEqual(bottom() + 0.5)
  expect(box.top).toBeGreaterThanOrEqual(area.top)
  expect(canvas.queryByRole('heading', { name: 'R-301' })).toBeNull()
  expect(canvas.queryByRole('button', { name: 'Delete' })).toBeNull()
  expect(canvas.queryByRole('heading', { name: 'The bike' })).toBeNull()
}

export const FillsTheAreaChecks: StoryObj = {
  ...RepairNotesPage,
  name: "A repair's notes fill the page (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    await fillsTheArea(canvasElement, () => window.innerHeight)
    const canvas = within(canvasElement)
    expect(canvas.getByRole('navigation', { name: 'Resources' })).toBeVisible()
    // The breadcrumb and the tab still name the repair
    await waitFor(() => expect(within(canvas.getByRole('navigation', { name: 'Breadcrumb' })).getByText('R-301')).toBeVisible())
    await waitFor(() => expect(document.title).toContain('R-301'))
  },
}

export const OnAPhoneChecks: StoryObj = {
  ...RepairNotesPage,
  name: "A repair's notes fill the page on a phone (checks)",
  tags: ['play', 'phone', '!dev'],
  parameters: { viewport: { options: { phone360 } } },
  globals: { viewport: { value: 'phone360' } },
  play: async ({ canvasElement }) => {
    const bar = await within(canvasElement).findByRole('navigation', { name: 'Tabs' })
    await fillsTheArea(canvasElement, () => bar.getBoundingClientRect().top)
  },
}

export const StandardPageChecks: StoryObj = {
  render: () => <Shop start="/repairs/1" browser />,
  name: "The notes link to the repair's standard page (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const details = await canvas.findByRole('link', { name: 'Repair details' })
    expect(details).toHaveAttribute('href', '/repairs/1?standard=true')
    await userEvent.click(details)
    await canvas.findByRole('heading', { name: 'R-301' })
    expect(canvas.getByRole('heading', { name: 'The bike' })).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Delete' })).toBeVisible()
    expect(canvas.getByRole('heading', { name: 'Earlier repairs of this customer' })).toBeVisible()
    expect(canvas.queryByRole('region', { name: 'Repair notes' })).toBeNull()
    window.history.back()
    await canvas.findByRole('region', { name: 'Repair notes' })
    expect(window.location.search).toBe('')
  },
}

export const FallbackChecks: StoryObj = {
  name: 'A component that throws gives the standard page (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/repairs/1" repairsView={workshop.repairsView.record({ component: component('BrokenNotes') })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-301' })
    expect(canvas.getByRole('heading', { name: 'The bike' })).toBeVisible()
    // The standard page scrolls the document again
    await waitFor(() => expect(document.scrollingElement!.scrollHeight).toBeGreaterThan(window.innerHeight))
  },
}

export const UnregisteredChecks: StoryObj = {
  name: 'A component nobody registered gives the standard page (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/repairs/1" repairsView={workshop.repairsView.record({ component: component('Unregistered') })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-301' })
    expect(canvas.getByRole('heading', { name: 'The bike' })).toBeVisible()
  },
}

export const RefusedChecks: StoryObj = {
  name: 'A repair the user cannot read is refused, and the notes never draw (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/repairs/99" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('This record does not exist, or you cannot see it.')
    expect(canvas.queryByRole('region', { name: 'Repair notes' })).toBeNull()
  },
}
