import { Check } from 'lucide-react'
import { useState } from 'react'
import { InlineChildTable } from '../inline-child-table'
import { invoiceAt, userById, type Invoice } from '../mocks'
import { Button } from '../primitives/button'
import type { BadgeTone } from '../primitives/badge'
import { ToastProvider } from '../toasts'
import { AutosaveStatus } from './autosave-status'
import { InvoiceDetails } from './invoice-details'
import { InvoiceSidebar } from './invoice-sidebar'
import { RecordHeader } from './record-header'
import { Section } from './section'
import { useAutosave } from './use-autosave'
import { useSaveFeedback, type SaveFeedback } from './use-save-feedback'

export type InvoiceRecordViewProps = {
  invoice?: Invoice
  saveFeedback: SaveFeedback
  presenceUserIds?: string[]
  conflictField?: 'paymentTerms' | 'none'
  autosaveAgoSeconds?: number
  ticking?: boolean
}

const statusTones: Record<Invoice['status'], BadgeTone> = { draft: 'neutral', sent: 'blue', paid: 'green', overdue: 'red' }

const InvoiceRecordBody = ({ invoice, saveFeedback, presenceUserIds, conflictField, autosaveAgoSeconds, ticking }: Required<InvoiceRecordViewProps>) => {
  const [lines, setLines] = useState(invoice.lines)
  const autosave = useAutosave(autosaveAgoSeconds, ticking)
  const { phase, save } = useSaveFeedback(saveFeedback, invoice.number)
  const editor = userById('u3')

  return (
    <div className="mx-auto max-w-[1100px] px-10 py-8">
      <RecordHeader
        collection="Invoices"
        title={invoice.number}
        status={{ label: invoice.status[0]!.toUpperCase() + invoice.status.slice(1), tone: statusTones[invoice.status] }}
        lastEditedBy={{ name: editor.name, ago: '4 min ago' }}
        presence={presenceUserIds.map(userById)}
        actions={
          <>
            <AutosaveStatus state={autosave.state} agoSeconds={autosave.agoSeconds} />
            <Button variant="primary" loading={phase === 'saving'} onClick={save}>
              {phase === 'saved' && <Check className="size-4" />}
              {phase === 'saved' ? 'Saved' : 'Save'}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-12">
        <main className="divide-y divide-border">
          <InvoiceDetails invoice={invoice} conflictField={conflictField} onEdit={autosave.touch} />
          <Section title="Lines" help="What you are billing for. Drag the handle to change the order on the PDF; quantities and prices update the totals immediately.">
            <InlineChildTable
              lines={lines}
              onChange={(next) => {
                setLines(next)
                autosave.touch()
              }}
            />
          </Section>
        </main>
        <div className="pt-8">
          <InvoiceSidebar invoice={invoice} lines={lines} />
        </div>
      </div>
    </div>
  )
}

export const InvoiceRecordView = ({
  invoice = invoiceAt(0),
  saveFeedback,
  presenceUserIds = ['u1', 'u3'],
  conflictField = 'paymentTerms',
  autosaveAgoSeconds = 3,
  ticking = true,
}: InvoiceRecordViewProps) => (
  <ToastProvider>
    <InvoiceRecordBody {...{ invoice, saveFeedback, presenceUserIds, conflictField, autosaveAgoSeconds, ticking }} />
  </ToastProvider>
)
