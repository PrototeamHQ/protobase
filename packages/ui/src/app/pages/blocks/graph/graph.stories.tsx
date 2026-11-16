import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Card, Field, Graph, Page, page, Text, type GraphProps } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../../app'
import { fakeApi } from '../../../testing/fake-api'

const viewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
} as const

const meta = { title: 'Composed pages/Graph', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// Ten services in three areas, coloured by their health, and the links between them, each with its protocol and state;
// a service chosen shows its details

const services = resource('services')
  .table('services')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), owner: f.text(), area: f.enum(['edge', 'core', 'data']), health: f.enum(['up', 'degraded', 'down']), map_x: f.integer().optional(), map_y: f.integer().optional() })
  .primaryKey((r) => r.id)
const links = resource('links')
  .table('links')
  .fields({ id: f.integer().readOnly().filterable().sortable(), from_id: f.relation('services'), to_id: f.relation('services'), protocol: f.text().optional(), state: f.enum(['idle', 'busy', 'broken']), optional: f.boolean() })
  .primaryKey((r) => r.id)

const views = [
  view<typeof services>('services')
    .title((r) => r.name)
    .fields((r) => ({
      area: r.area.label('Area').valueLabels({ edge: 'Edge', core: 'Core', data: 'Data' }),
      health: r.health.label('Health').valueLabels({ up: 'Up', degraded: 'Degraded', down: 'Down' }).valueColors({ up: 'green', degraded: 'amber', down: 'red' }),
    })),
  view<typeof links>('links').fields((r) => ({ state: r.state.label('State').valueColors({ idle: 'neutral', busy: 'blue', broken: 'red' }) })),
]

const owners = ['Platform', 'Identity', 'Web', 'Commerce', 'Finance', 'Search', 'Messaging', 'Data', 'Data', 'Storage']
const serviceRows = [
  { id: 1, name: 'Gateway', area: 'edge', health: 'up', map_x: 280, map_y: 0 },
  { id: 2, name: 'Sign-in', area: 'edge', health: 'up', map_x: 40, map_y: 0 },
  { id: 3, name: 'Web app', area: 'edge', health: 'degraded', map_x: 520, map_y: 0 },
  { id: 4, name: 'Orders', area: 'core', health: 'up', map_x: 160, map_y: 200 },
  { id: 5, name: 'Billing', area: 'core', health: 'down', map_x: 400, map_y: 200 },
  { id: 6, name: 'Search', area: 'core', health: 'up' },
  { id: 7, name: 'Mailer', area: 'core', health: 'degraded' },
  { id: 8, name: 'Database', area: 'data', health: 'up' },
  { id: 9, name: 'Queue', area: 'data', health: 'up' },
  { id: 10, name: 'Files', area: 'data', health: 'up' },
].map((row, index) => ({ map_x: null, map_y: null, ...row, owner: owners[index] }))

const linkRows = [
  { id: 101, from_id: 1, to_id: 4, protocol: 'https', state: 'busy' },
  { id: 102, from_id: 1, to_id: 6, protocol: 'https', state: 'idle' },
  { id: 103, from_id: 2, to_id: 8, protocol: 'sql', state: 'idle' },
  { id: 104, from_id: 3, to_id: 1, protocol: 'https', state: 'busy' },
  { id: 105, from_id: 4, to_id: 5, protocol: 'grpc', state: 'broken' },
  { id: 106, from_id: 4, to_id: 9, protocol: 'amqp', state: 'busy', optional: true },
  { id: 107, from_id: 5, to_id: 7, protocol: 'smtp', state: 'idle', optional: true },
  { id: 108, from_id: 5, to_id: 8, protocol: 'sql', state: 'idle' },
  { id: 109, from_id: 6, to_id: 8, protocol: 'sql', state: 'idle' },
  { id: 110, from_id: 7, to_id: 9, protocol: 'amqp', state: 'idle' },
  { id: 111, from_id: 9, to_id: 10, protocol: 's3', state: 'busy' },
  { id: 112, from_id: 4, to_id: 99, protocol: 'https', state: 'idle' },
].map((row) => ({ optional: false, ...row }))

const base = { nodes: 'services', edges: 'links', label: 'name', group: 'area', status: 'health', source: 'from_id', target: 'to_id' } as const

const mapPage = (props: Partial<GraphProps> = {}) =>
  page('map', Page({ title: 'Services', width: 'full', children: Card({ title: 'Service map', children: Graph({ ...base, select: 'service', ...props, children: [Field({ source: 'owner' }), Field({ source: 'health' })] }) }) }))

const Services = ({ path, map }: { path: string; map: ReturnType<typeof mapPage> }) => {
  const [client] = useState(() => fakeApi({ resources: [services.toModel(), links.toModel()], views: views.map((entry) => entry.toModel()), pages: [map.toModel()], rows: { services: serviceRows, links: linkRows } }).client)
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl={path} />
    </div>
  )
}

const plain = mapPage()

export const Desktop: StoryObj = { name: 'Ten services in three areas', globals: { viewport: { value: 'desktop1280' } }, render: () => <Services path="/map" map={plain} /> }

export const Phone: StoryObj = { ...Desktop, name: 'Ten services in three areas, on a phone', globals: { viewport: { value: 'phone390' } } }

export const Chosen: StoryObj = { ...Desktop, name: 'A chosen service beside the map', render: () => <Services path="/map?service=5" map={plain} /> }

export const ChosenPhone: StoryObj = { ...Chosen, name: 'A chosen service under the map, on a phone', globals: { viewport: { value: 'phone390' } } }

// Each node's own contents, its links coloured by their state with their protocol on them, a busy one moving and an
// optional one dashed, laid out from left to right
const drawn = mapPage({
  node: [Text({ as: 'strong', children: '{{name}}' }), Text({ children: 'Owned by {{owner}}' }), Field({ source: 'health', label: false })],
  edgeLabel: 'protocol',
  edgeStatus: 'state',
  animated: 'state = "busy"',
  dashed: 'optional = true',
  direction: 'right',
})

export const Drawn: StoryObj = { ...Desktop, name: 'Its own node contents and edge styles, left to right', render: () => <Services path="/map" map={drawn} /> }

export const DrawnPhone: StoryObj = { ...Drawn, name: 'Its own node contents and edge styles, on a phone', globals: { viewport: { value: 'phone390' } } }

const force = mapPage({ layout: 'force', edgeStatus: 'state', dotted: 'optional = true' })

export const Force: StoryObj = { ...Desktop, name: 'Laid out by force, each area a region', render: () => <Services path="/map" map={force} /> }

// Five services stand where their records place them; the others are laid out under them
const placed = mapPage({ x: 'map_x', y: 'map_y', edgeLabel: 'protocol' })

export const Placed: StoryObj = { ...Desktop, name: 'Five services at their stored positions', render: () => <Services path="/map" map={placed} /> }

// Each node is a link that chooses its service, the link to a service that is not among them is left out, and the
// page never scrolls sideways
const play: StoryObj['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const nodes = await canvas.findAllByRole('link', { name: /^(Gateway|Sign-in|Web app|Orders|Billing|Search|Mailer|Database|Queue|Files)$/ })
  expect(nodes).toHaveLength(10)
  expect(await canvas.findByText('Core')).toBeVisible()
  // Edges draw once the nodes' handles are measured
  await waitFor(() => expect(canvasElement.querySelectorAll('.react-flow__edge')).toHaveLength(11))
  const billing = nodes.find((node) => node.textContent === 'Billing' || node.getAttribute('aria-label') === 'Billing')!
  expect(billing).toHaveAttribute('href', '/map?service=5')

  // Nothing is chosen yet, so the children draw nothing
  expect(canvas.queryByText('Finance')).toBeNull()
  await userEvent.click(billing)
  await waitFor(() => expect(canvas.getByText('Finance')).toBeVisible())
  await waitFor(() => expect(canvas.getAllByRole('link', { name: 'Billing' }).find((node) => node.getAttribute('aria-current') === 'true')).toBeDefined())
  await waitFor(() => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth))
}

export const DesktopChecks: StoryObj = { ...Desktop, name: 'Ten services in three areas (checks)', tags: ['play', '!dev'], play }

export const PhoneChecks: StoryObj = { ...Phone, name: 'Ten services in three areas, on a phone (checks)', tags: ['play', '!dev', 'phone'], play }

// A node's own contents draw inside its record, the busy links move, the optional ones are dashed and each link says
// its protocol
const drawnPlay: StoryObj['play'] = async (context) => {
  const canvas = within(context.canvasElement)
  await waitFor(() => expect(canvas.getByText('Owned by Finance')).toBeVisible())
  await waitFor(() => expect(context.canvasElement.querySelectorAll('.react-flow__edge.animated')).toHaveLength(4))
  await waitFor(() => expect([...context.canvasElement.querySelectorAll('.react-flow__edge-text')].map((label) => label.textContent)).toContain('https'))
  const dashed = [...context.canvasElement.querySelectorAll<SVGPathElement>('.react-flow__edge-path')].filter((path) => /^6(px)?,? 4(px)?$/.test(path.style.strokeDasharray))
  expect(dashed).toHaveLength(2)
  await play(context)
}

export const DrawnChecks: StoryObj = { ...Drawn, name: 'Its own node contents and edge styles (checks)', tags: ['play', '!dev'], play: drawnPlay }
