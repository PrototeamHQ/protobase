import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import type { RecordMode } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { homeResources, homeRows, homeViews } from './testing/homes-domain'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/Key facts', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'ada', email: 'ada@homes.example', name: 'Ada', role: 'admin' })

const allowed: Record<string, ResourcePermissions> = {
  homes: { read: true, create: true, update: true, delete: false, conditional: [] },
  home_photos: { read: true, create: false, update: false, delete: false, conditional: [] },
}

const Home = ({ path = '/homes/1', mode = 'read' }: { path?: string; mode?: RecordMode }) => {
  const [client] = useState(() => fakeApi({ resources: homeResources, views: homeViews(mode, { facts: true }), rows: homeRows(), permissions: allowed }).client)
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={path} />
    </div>
  )
}

const facts = async (canvasElement: HTMLElement) => (await within(canvasElement).findByRole('heading', { name: 'Home' })).closest('section')!.querySelector('dl')!

// Each fact's label, as screen readers and the tooltip give it, and its value
const read = (list: HTMLElement) => [...list.querySelectorAll(':scope > div')].map((fact) => [fact.querySelector('dt')!.textContent, fact.querySelector('dd')!.textContent])

export const KeyFacts: StoryObj = { name: 'Key facts', render: () => <Home /> }

export const KeyFactsChecks: StoryObj = {
  ...KeyFacts,
  name: 'Key facts (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const list = await facts(canvasElement)
    const shown = read(list)
    expect(shown.map(([label]) => label)).toEqual(['Address', 'Asking price', 'Bedrooms', 'Energy label', 'Garden'])
    expect(shown[1]![1]).toMatch(/€\s?650,000/)
    expect(shown[2]![1]).toBe('3')
    // Side by side on one row
    const items = [...list.querySelectorAll<HTMLElement>(':scope > div')]
    expect(new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size).toBe(1)
    // A field with an icon shows it in place of its label, which screen readers and the tooltip still get
    const price = items[1]!
    expect(price.querySelector('dt svg')).not.toBeNull()
    expect(getComputedStyle(price.querySelector('dt span')!).position).toBe('absolute')
    expect(price.title).toBe('Asking price')
    // One without shows its label as a caption
    const garden = items[4]!
    expect(garden.querySelector('dt svg')).toBeNull()
    expect(within(garden).getByText('Garden')).toBeVisible()
  },
}

export const EmptyFacts: StoryObj = {
  name: 'Empty key facts are left out (checks)',
  tags: ['play', '!dev'],
  render: () => <Home path="/homes/2" />,
  play: async ({ canvasElement }) => {
    const list = await facts(canvasElement)
    // No price, bedrooms or energy label: those facts are left out, never shown as a dash; false is a value
    expect(read(list)).toEqual([
      ['Address', 'Oudegracht 7'],
      ['Garden', 'No'],
    ])
    expect(within(list).queryByText('—')).toBeNull()
  },
}

export const FactsForm: StoryObj = {
  name: 'The form edits key facts as any section (checks)',
  tags: ['play', '!dev'],
  render: () => <Home mode="edit" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const home = (await canvas.findByRole('heading', { name: 'Home' })).closest('section')!
    // Inputs under their labels, not a row of facts
    expect(await within(home).findByDisplayValue('Keizersgracht 120')).toBeVisible()
    expect(within(home).getByDisplayValue('3')).toBeVisible()
    expect(within(home).getByText("Without the buyer's costs.")).toBeVisible()
  },
}

export const MobileKeyFacts: StoryObj = {
  name: 'Key facts on a mobile screen',
  globals: { viewport: { value: 'mobile360' } },
  render: () => <Home />,
}

export const MobileKeyFactsChecks: StoryObj = {
  ...MobileKeyFacts,
  name: 'Key facts on a mobile screen (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const list = await facts(canvasElement)
    const items = [...list.querySelectorAll<HTMLElement>(':scope > div')]
    expect(items).toHaveLength(5)
    // Two to a row, within the screen
    const lefts = new Set(items.map((item) => Math.round(item.getBoundingClientRect().left)))
    expect(lefts.size).toBe(2)
    expect(Math.round(items[0]!.getBoundingClientRect().top)).toBe(Math.round(items[1]!.getBoundingClientRect().top))
    expect(items[2]!.getBoundingClientRect().top).toBeGreaterThan(items[0]!.getBoundingClientRect().top)
    expect(list.scrollWidth).toBe(list.clientWidth)
    for (const item of items) expect(item.getBoundingClientRect().right).toBeLessThanOrEqual(list.getBoundingClientRect().right)
  },
}
