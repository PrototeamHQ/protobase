import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from './app'
import { overview } from './pages/guide/sales-steps/step-4'
import { salesResources, salesRows, salesViews } from './pages/guide/sales-domain'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Shell/Phone scrolling', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

const shops = resource('shops')
  .table('shops')
  .fields({ id: f.integer().readOnly(), name: f.text(), latitude: f.decimal({ precision: 8, scale: 6 }), longitude: f.decimal({ precision: 9, scale: 6 }) })
  .primaryKey((r) => r.id)

const shopsView = view<typeof shops>('shops').list((r, d) => ({ columns: [r.name], displays: [d.map({ latitude: r.latitude, longitude: r.longitude }, { label: 'Map' })] }))

// A style of one background layer, so the map draws without the network.
const offlineStyle = URL.createObjectURL(new Blob([JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#e8efe4' } }] })], { type: 'application/json' }))

const Phone = ({ start }: { start: string }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [...salesResources, shops.toModel()],
      views: [...salesViews, shopsView.toModel()],
      pages: [overview.toModel()],
      rows: { ...salesRows, shops: [{ id: 1, name: 'Veldhuis Amsterdam', latitude: '52.370216', longitude: '4.885168' }] },
      maps: { style: offlineStyle },
      bottomBar: { label: 'Sales', items: [{ kind: 'page', page: 'overview', label: 'Overview' }, { kind: 'resource', resource: 'shops', label: 'Shops' }] },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} workspace="Veldhuis Supply" />
    </div>
  )
}

const phone360 = { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' }
// Tags are written on each story, since Storybook reads them from the source rather than a spread object
const onPhone = { parameters: { viewport: { options: { phone360 } } }, globals: { viewport: { value: 'phone360' } } }

// An element of the page that scrolls its own content, which would be a second scrollbar beside the document's.
const scrollBoxes = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll('*')].filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1 && !element.closest('[aria-label="Resources"]'))

/** A composed page taller than the phone scrolls the document, not a box of its own, and the bars stay at its edges. */
export const ComposedPageChecks: StoryObj = {
  ...onPhone,
  tags: ['play', 'phone', '!dev'],
  name: 'A composed page scrolls the document (checks)',
  render: () => <Phone start="/overview" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Sales overview' })
    const scroller = document.scrollingElement!
    await waitFor(() => expect(scroller.scrollHeight).toBeGreaterThan(window.innerHeight))
    expect(scrollBoxes(canvasElement)).toEqual([])
    scroller.scrollTop = scroller.scrollHeight
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0))
    const bar = canvas.getByRole('navigation', { name: 'Tabs' })
    expect(bar.getBoundingClientRect().bottom).toBe(window.innerHeight)
    expect(canvasElement.querySelector('header')!.getBoundingClientRect().top).toBe(0)
    scroller.scrollTop = 0
  },
}

/** The map fills the screen between the bars: nothing scrolls, and the bottom bar sits at the screen's foot. */
export const MapDisplayChecks: StoryObj = {
  ...onPhone,
  tags: ['play', 'phone', '!dev'],
  name: 'The map fills the screen (checks)',
  render: () => <Phone start="/shops?display=map" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Shops' })
    const bar = canvas.getByRole('navigation', { name: 'Tabs' })
    expect(document.scrollingElement!.scrollHeight).toBe(window.innerHeight)
    expect(scrollBoxes(canvasElement)).toEqual([])
    expect(bar.getBoundingClientRect().bottom).toBe(window.innerHeight)
  },
}
