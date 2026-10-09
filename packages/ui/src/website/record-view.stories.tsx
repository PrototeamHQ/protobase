import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppShell } from '../app-shell'
import { adminUser } from './users'
import { InvoiceRecordView } from '../record-view'
import { Screen } from './screen'

const meta = { title: 'Website/RecordView', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

export const RecordView: StoryObj = {
  render: () => (
    <Screen>
      <AppShell sidebarMode="text-small" activeItem="invoices" breadcrumb={['Sales', 'Invoices', 'INV-2026-04218']} user={adminUser} workspace="Veldhuis Supply">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <InvoiceRecordView saveFeedback="toast" ticking={false} />
        </div>
      </AppShell>
    </Screen>
  ),
}
