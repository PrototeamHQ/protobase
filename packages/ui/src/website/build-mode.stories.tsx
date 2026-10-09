import type { Meta, StoryObj } from '@storybook/react-vite'
import { adminUser } from './users'
import { AssistantPanel } from '../assistant-panel'
import { createRowSource, invoiceCount, invoiceRowAt, invoicesColumns, invoicesNaturalSort } from '../data-grid'
import { ListScreen } from './list-screen'
import { Screen } from './screen'

const meta = { title: 'Website/BuildMode', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const invoices = createRowSource(invoiceCount, invoiceRowAt)

export const BuildMode: StoryObj = {
  render: () => (
    <Screen>
      <ListScreen
        sidebarMode="icon"
        activeItem="invoices"
        breadcrumb={['Sales', 'Invoices']}
        user={adminUser}
        title="Invoices"
        subtitle="Preview of your change: the new discount column is highlighted."
        newLabel="New invoice"
        columns={invoicesColumns(true, true)}
        source={invoices}
        naturalSort={invoicesNaturalSort}
        assistantOpen
        rightPanel={<AssistantPanel stage="checks-passed" buildMode showChecks={false} />}
      />
    </Screen>
  ),
}
