import type { Meta, StoryObj } from '@storybook/react-vite'
import { adminUser } from './users'
import { ordersColumns, ordersNaturalSort, createFilteredSource, createRowSource } from '../data-grid'
import { ordersFilters } from '../filter-panel'
import { orderAt, orderCount } from '../mocks'
import { ListScreen } from './list-screen'
import { Screen } from './screen'

const meta = { title: 'Website/Hero', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const confirmedOrPicking = createFilteredSource(createRowSource(orderCount, orderAt), 2_481, (row, index) => ({ ...row, status: index % 4 === 0 ? 'picking' : 'confirmed' }))

export const Hero: StoryObj = {
  render: () => (
    <Screen>
      <ListScreen
        sidebarMode="text-small"
        activeItem="orders"
        breadcrumb={['Sales', 'Orders']}
        user={adminUser}
        title="Orders"
        subtitle="Every sales order across all warehouses."
        newLabel="New order"
        columns={ordersColumns}
        source={confirmedOrPicking}
        naturalSort={ordersNaturalSort}
        filters={{ config: ordersFilters, layout: 'bar', defaultValue: { facets: { status: ['confirmed', 'picking'] }, toggles: [] } }}
        showChart
      />
    </Screen>
  ),
}
