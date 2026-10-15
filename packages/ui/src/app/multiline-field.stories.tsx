import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Multiline fields', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const homes = resource('homes')
  .table('homes')
  .fields({ id: f.integer().readOnly().filterable().sortable(), address: f.text(), description: f.text().optional() })
  .primaryKey((r) => r.id)

const homesView = view<typeof homes>('homes')
  .title((r) => r.address)
  .names({ singular: 'Home', plural: 'Homes' })
  .fields((r) => ({ description: r.description.multiline() }))
  .list((r, d) => ({ columns: [r.address, r.description], displays: [d.cards({ title: r.address, subtitle: r.description })] }))
  .layout((r) => [l.section('Home', [r.address, r.description])])

const description = 'A bright family home by the park.\nThree bedrooms upstairs.\nA garden facing south.'

const rows = { homes: [{ id: 1, address: 'Parkweg 12', description }] }

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Homes = ({ path, canUpdate = true }: { path: string; canUpdate?: boolean }) => {
  const [api] = useState(() => {
    const permissions: Record<string, ResourcePermissions> = { homes: { read: true, create: true, update: canUpdate, delete: false, conditional: [] } }
    const created = fakeApi({ resources: [homes.toModel()], views: [homesView.toModel()], rows: structuredClone(rows), permissions })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

const textarea = async (canvasElement: HTMLElement) => {
  await waitFor(() => expect(canvasElement.querySelector('textarea')).toBeTruthy())
  return canvasElement.querySelector('textarea')!
}

// The box shows all of its text: it never scrolls inside.
const showsAll = (box: HTMLTextAreaElement) => expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight)

export const EditADescription: StoryObj = {
  tags: ['play'],
  render: () => <Homes path="/homes/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await textarea(canvasElement)
    expect(box.value).toBe(description)
    showsAll(box)
    const before = box.offsetHeight
    await userEvent.type(box, '{enter}A shed.{enter}A garage.{enter}Solar panels.')
    // The box grows with its text, so the page scrolls instead
    await waitFor(() => expect(box.offsetHeight).toBeGreaterThan(before))
    showsAll(box)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored.homes![0]!.description).toBe(`${description}\nA shed.\nA garage.\nSolar panels.`))
  },
}

export const NewWithADescription: StoryObj = {
  tags: ['play'],
  render: () => <Homes path="/homes/new" />,
  play: async ({ canvasElement }) => {
    const box = await textarea(canvasElement)
    expect(box.rows).toBe(3)
    // A plain text field stays a single line
    expect(canvasElement.querySelectorAll('input').length).toBeGreaterThan(0)
    await userEvent.type(box, 'First line{enter}Second line')
    expect(box.value).toBe('First line\nSecond line')
    showsAll(box)
  },
}

export const ReadOnlyKeepsLineBreaks: StoryObj = {
  tags: ['play'],
  render: () => <Homes path="/homes/1" canUpdate={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shown = await canvas.findByText((_, element) => element?.tagName === 'DIV' && element.textContent === description)
    expect(getComputedStyle(shown).whiteSpace).toBe('pre-line')
    expect(canvasElement.querySelector('textarea')).toBeNull()
  },
}

export const CardsKeepLineBreaks: StoryObj = {
  tags: ['play'],
  render: () => <Homes path="/homes?display=cards" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const subtitle = await canvas.findByText((_, element) => element?.tagName === 'SPAN' && element.textContent === description)
    expect(getComputedStyle(subtitle).whiteSpace).toBe('pre-line')
    // The card is a real link to the record
    expect(subtitle.closest('a')?.getAttribute('href')).toBe('/homes/1')
  },
}
