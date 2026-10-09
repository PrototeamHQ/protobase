import { Ban, Download, Send, Wallet } from 'lucide-react'
import { formatDate, formatMoney } from '../format'
import { invoiceTotals, userById, type Invoice, type InvoiceLine } from '../mocks'
import { ActionRail } from './action-rail'
import { MetadataList, RelatedRecords, SidebarCard } from './record-sidebar'

const actions = [
  { name: 'Send to customer', description: 'Emails the PDF and marks the invoice as sent.', icon: Send },
  { name: 'Record payment', description: 'Matches a bank transfer and closes the invoice when paid in full.', icon: Wallet },
  { name: 'Download PDF', description: 'Renders the invoice with your letterhead.', icon: Download },
  { name: 'Void invoice', description: 'Cancels it and creates a credit note.', icon: Ban },
]

export const InvoiceSidebar = ({ invoice, lines }: { invoice: Invoice; lines: InvoiceLine[] }) => (
  <aside className="space-y-4">
    <ActionRail actions={actions} />
    <SidebarCard title="Details">
      <MetadataList
        rows={[
          { label: 'Created', value: formatDate(invoice.issuedAt) },
          { label: 'Owner', value: userById('u3').name },
          { label: 'Currency', value: invoice.currency },
          { label: 'Terms', value: invoice.paymentTerms },
          { label: 'Total', value: <strong>{formatMoney(invoiceTotals(lines).totalCents)}</strong> },
        ]}
      />
    </SidebarCard>
    <SidebarCard title="Related records">
      <RelatedRecords
        records={[
          { kind: 'Customer', label: invoice.customer.name, meta: `${invoice.customer.city}, ${invoice.customer.country}` },
          { kind: 'Sales order', label: 'SO-2026-048102', meta: 'Delivered 28 Sep 2026' },
          { kind: 'Payments', label: '2 bank transfers', meta: 'Last received 2 Oct 2026' },
        ]}
      />
    </SidebarCard>
  </aside>
)
