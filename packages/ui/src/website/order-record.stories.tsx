import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppShell } from '../app-shell'
import { adminUser } from './users'
import { OrderRecordView } from '../record-view'
import { Screen } from './screen'

const meta = { title: 'Website/OrderRecord', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

export const OrderRecord: StoryObj = {
  render: () => (
    <Screen>
      <AppShell sidebarMode="text-small" activeItem="orders" breadcrumb={['Sales', 'Orders', 'SO-2026-048209']} user={adminUser} workspace="Veldhuis Supply">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <OrderRecordView ticking={false} />
        </div>
      </AppShell>
    </Screen>
  ),
}
