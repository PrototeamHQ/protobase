import type { Meta, StoryObj } from '@storybook/react-vite'
import { adminUser } from './users'
import { AssistantPanel } from '../assistant-panel'
import { createRowSource, invoiceCount, invoiceRowAt, invoicesColumns, invoicesNaturalSort } from '../data-grid'
import { ListScreen } from './list-screen'
import { Screen } from './screen'

const meta = { title: 'Website/ChecksAndPreview', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const invoices = createRowSource(invoiceCount, invoiceRowAt)

export const ChecksAndPreview: StoryObj = {
  render: () => (
    <Screen>
      <div className="flex h-full justify-end bg-surface">
        <div className="min-w-0 flex-1">
          <ListScreen
            sidebarMode="icon"
            activeItem="invoices"
            breadcrumb={['Sales', 'Invoices']}
            user={adminUser}
            title="Invoices"
            subtitle="Preview"
            newLabel="New invoice"
            columns={invoicesColumns(true, true)}
            source={invoices}
            naturalSort={invoicesNaturalSort}
            assistantOpen
          />
        </div>
        <AssistantPanel stage="preview" buildMode />
      </div>
    </Screen>
  ),
}
