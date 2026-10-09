import type { Meta, StoryObj } from '@storybook/react-vite'
import { salesRepUser } from './users'
import { createRowSource, ordersColumns, ordersNaturalSort } from '../data-grid'
import { ordersFilters } from '../filter-panel'
import { orderAt } from '../mocks'
import { ListScreen } from './list-screen'
import { Screen } from './screen'

const meta = { title: 'Website/Permissions', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const ownOrders = createRowSource(6_214, (index) => ({ ...orderAt(index * 7), owner: 'u2' }))

export const Permissions: StoryObj = {
  render: () => (
    <Screen>
      <ListScreen
        sidebarMode="text-small"
        activeItem="orders"
        breadcrumb={['Sales', 'Orders']}
        user={salesRepUser}
        title="Orders"
        subtitle="Your sales orders."
        newLabel="New order"
        columns={ordersColumns}
        source={ownOrders}
        naturalSort={ordersNaturalSort}
        filters={{ config: ordersFilters, layout: 'bar', lockedLabels: ['Showing your orders only'] }}
      />
    </Screen>
  ),
}
