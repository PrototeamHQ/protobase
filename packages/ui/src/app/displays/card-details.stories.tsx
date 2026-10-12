import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Card details', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@homes.example', name: 'Pip', role: 'admin' })

const homes = resource('homes')
  .table('homes')
  .fields({
    id: f.integer().readOnly(),
    address: f.text(),
    living_area: f.integer(),
    energy_label: f.enum(['a', 'b', 'd', 'g']).optional(),
    garden: f.boolean(),
    parking: f.boolean(),
  })
  .primaryKey((r) => r.id)

const homesView = view<typeof homes>('homes')
  .title((r) => r.address)
  .fields((r) => ({
    living_area: r.living_area.label('Living area').suffix(' m²').icon('ruler'),
    energy_label: r.energy_label.format('badge').valueLabels({ a: 'A', b: 'B', d: 'D', g: 'G' }).valueColors({ a: '#00a651', b: '#50b848', d: '#fff200', g: '#ed1c24' }).badgeShape('arrow'),
  }))
  .list((r, d) => ({ columns: [r.address, r.living_area, r.energy_label], displays: [d.cards({ meta: [r.living_area, r.energy_label], flags: [r.garden, r.parking] })], default: 'cards' }))

const Homes = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [homes.toModel()],
      views: [homesView.toModel(homes.toModel())],
      rows: {
        homes: [
          { id: 1, address: 'Keizersgracht 183', living_area: 120, energy_label: 'a', garden: true, parking: true },
          { id: 2, address: 'Calle Mayor 39', living_area: 64, energy_label: 'd', garden: false, parking: true },
          { id: 3, address: 'Parkweg 78', living_area: 210, energy_label: 'g', garden: false, parking: false },
          { id: 4, address: 'Spaarne 20', living_area: 48, energy_label: null, garden: true, parking: false },
        ],
      },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/homes" workspace="Pip's homes" />
    </div>
  )
}

export const CardDetails: StoryObj = { name: 'Cards with units, icons, coloured badges and flags', render: () => <Homes /> }

export const CardDetailsChecks: StoryObj = {
  ...CardDetails,
  name: 'Cards with units, icons, coloured badges and flags (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const area = await canvas.findByText('120 m²')
    expect(area.closest('dd')!.querySelector('svg')).not.toBeNull()
    const label = canvas.getByText('A')
    expect(label.style.backgroundColor).toBe('rgb(0, 166, 81)')
    expect(label.style.clipPath).toContain('polygon')
    expect(canvas.getByText('D').style.color).toBe('rgb(17, 24, 39)')
    const cards = canvas.getAllByRole('listitem').filter((item) => item.querySelector('a'))
    expect(within(cards[0]!).getByRole('list', { name: 'Features' }).textContent).toBe('GardenParking')
    expect(within(cards[1]!).getByRole('list', { name: 'Features' }).textContent).toBe('Parking')
    expect(within(cards[2]!).queryByRole('list', { name: 'Features' })).toBeNull()
  },
}
