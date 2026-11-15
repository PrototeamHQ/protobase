import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Card, Field, Page, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { defineUi } from '@protobase/ui'
import { App } from '@protobase/ui/unstable/app/app'
import { fakeApi } from '@protobase/ui/unstable/app/testing/fake-api'
import graphPlugin from './index'
import { Graph } from './layout'
import { linkRows, serviceRows } from './testing/sample-graph'

const viewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
} as const

const meta = { title: 'Plugins/Graph', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// Ten services in three areas, coloured by their health, and the links between them; a service chosen shows its details

const services = resource('services')
  .table('services')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), area: f.enum(['edge', 'core', 'data']), health: f.enum(['up', 'degraded', 'down']) })
  .primaryKey((r) => r.id)
const links = resource('links')
  .table('links')
  .fields({ id: f.integer().readOnly().filterable().sortable(), from_id: f.relation('services'), to_id: f.relation('services') })
  .primaryKey((r) => r.id)

const views = [
  view<typeof services>('services')
    .title((r) => r.name)
    .fields((r) => ({
      area: r.area.label('Area').valueLabels({ edge: 'Edge', core: 'Core', data: 'Data' }),
      health: r.health.label('Health').valueLabels({ up: 'Up', degraded: 'Degraded', down: 'Down' }).valueColors({ up: 'green', degraded: 'amber', down: 'red' }),
    })),
  view<typeof links>('links'),
]

const map = page(
  'map',
  Page({
    title: 'Services',
    width: 'full',
    children: Card({
      title: 'Service map',
      children: Graph({ nodes: 'services', edges: 'links', label: 'name', group: 'area', status: 'health', source: 'from_id', target: 'to_id', select: 'service', children: [Field({ source: 'name' }), Field({ source: 'health' })] }),
    }),
  }),
)

// The app attaches the plugin as an app's protobase.ui.tsx does
const Services = ({ path }: { path: string }) => {
  const [client] = useState(() => fakeApi({ resources: [services.toModel(), links.toModel()], views: views.map((entry) => entry.toModel()), pages: [map.toModel()], rows: { services: serviceRows, links: linkRows } }).client)
  const ui = defineUi({ extends: [graphPlugin] })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl={path} ui={ui} />
    </div>
  )
}

export const Desktop: StoryObj = { name: 'Ten services in three areas', globals: { viewport: { value: 'desktop1280' } }, render: () => <Services path="/map" /> }

export const Phone: StoryObj = { ...Desktop, name: 'Ten services in three areas, on a phone', globals: { viewport: { value: 'phone390' } } }

export const Chosen: StoryObj = { ...Desktop, name: 'A chosen service beside the map', render: () => <Services path="/map?service=5" /> }

export const ChosenPhone: StoryObj = { ...Chosen, name: 'A chosen service under the map, on a phone', globals: { viewport: { value: 'phone390' } } }

// Each node is a link that chooses its service, the link to a service that is not among them is left out, and the
// page never scrolls sideways
const play: StoryObj['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const nodes = await canvas.findAllByRole('link', { name: /^(Gateway|Sign-in|Web app|Orders|Billing|Search|Mailer|Database|Queue|Files)$/ })
  expect(nodes).toHaveLength(10)
  expect(await canvas.findByText('Core')).toBeVisible()
  expect(canvasElement.querySelectorAll('.react-flow__edge')).toHaveLength(11)
  const billing = nodes.find((node) => node.textContent === 'Billing')!
  expect(billing).toHaveAttribute('href', '/map?service=5')

  // Nothing is chosen yet, so the children draw nothing
  expect(canvas.queryByText('Health')).toBeNull()
  await userEvent.click(billing)
  await waitFor(() => expect(canvas.getByText('Health')).toBeVisible())
  await waitFor(() => expect(canvas.getAllByRole('link', { name: 'Billing' }).find((node) => node.getAttribute('aria-current') === 'true')).toBeDefined())
  await waitFor(() => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth))
}

export const DesktopChecks: StoryObj = { ...Desktop, name: 'Ten services in three areas (checks)', tags: ['play', '!dev'], play }

export const PhoneChecks: StoryObj = { ...Phone, name: 'Ten services in three areas, on a phone (checks)', tags: ['play', '!dev', 'phone'], play }
