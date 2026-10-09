import { Check, PackageCheck, Printer, Wallet } from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatMoney } from '../format'
import { orderAt, userById } from '../mocks'
import type { BadgeTone } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { ActionRail } from './action-rail'
import { AutosaveStatus } from './autosave-status'
import { Field } from './field'
import { OrderStatusChoice, orderStatusOptions, type OrderStatusValue } from './order-status-choice'
import { RecordHeader } from './record-header'
import { MetadataList, RelatedRecords, SidebarCard } from './record-sidebar'
import { Section } from './section'
import { useAutosave } from './use-autosave'

const tones: Record<OrderStatusValue, BadgeTone> = { open: 'amber', paid: 'blue', shipped: 'violet' }

const actions = [
  { name: 'Mark as paid', description: 'Records the payment and releases the order for picking.', icon: Wallet },
  { name: 'Create shipment', description: 'Books a carrier and prints the label.', icon: PackageCheck },
  { name: 'Print picking list', description: 'One page, sorted by warehouse location.', icon: Printer },
]

export const OrderRecordView = ({ ticking = true }: { ticking?: boolean }) => {
  const order = orderAt(4)
  const [status, setStatus] = useState<OrderStatusValue>('paid')
  const [total, setTotal] = useState((order.totalCents / 100).toFixed(2))
  const autosave = useAutosave(3, ticking)
  const editor = userById('u2')

  return (
    <div className="mx-auto max-w-[1100px] px-10 py-8">
      <RecordHeader
        collection="Orders"
        title={order.number}
        status={{ label: orderStatusOptions.find((option) => option.value === status)!.label, tone: tones[status] }}
        lastEditedBy={{ name: editor.name, ago: '2 min ago' }}
        presence={[userById('u1'), editor]}
        actions={
          <>
            <AutosaveStatus state={autosave.state} agoSeconds={autosave.agoSeconds} />
            <Button variant="primary">
              <Check className="size-4" />
              Save
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-12">
        <main className="divide-y divide-border">
          <Section title="Order details" help="The basics of the order. The number is assigned automatically and cannot be changed.">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label="Number" help="Generated when the order is created.">
                <Input readOnly value={order.number} />
              </Field>
              <Field label="Customer" help="The company that placed the order. Click to open its record.">
                <a href="#customer" onClick={(event) => event.preventDefault()} className="flex h-8 items-center rounded-md border border-border-strong bg-background px-2.5 text-[13px] font-medium text-primary-text shadow-sm hover:underline">
                  {order.customer.name}
                </a>
              </Field>
              <Field label="Total" help="Including VAT, in euros." example="1,240.00">
                <Input
                  leading={<span className="text-[13px]">€</span>}
                  className="text-right tabular-nums"
                  value={total}
                  onChange={(event) => {
                    setTotal(event.target.value)
                    autosave.touch()
                  }}
                />
              </Field>
            </div>
          </Section>
          <Section title="Fulfilment" help="Where the order is in its life. Changing the status can trigger emails to the customer.">
            <OrderStatusChoice
              value={status}
              onChange={(next) => {
                setStatus(next)
                autosave.touch()
              }}
            />
          </Section>
        </main>
        <aside className="space-y-4 pt-8">
          <ActionRail actions={actions} />
          <SidebarCard title="Details">
            <MetadataList
              rows={[
                { label: 'Created', value: formatDate(order.createdAt) },
                { label: 'Owner', value: userById(order.owner).name },
                { label: 'Country', value: order.country },
                { label: 'Lines', value: order.lines },
                { label: 'Total', value: <strong>{formatMoney(Number(total) * 100)}</strong> },
              ]}
            />
          </SidebarCard>
          <SidebarCard title="Related records">
            <RelatedRecords
              records={[
                { kind: 'Customer', label: order.customer.name, meta: `${order.country}` },
                { kind: 'Invoice', label: 'INV-2026-04211', meta: 'Sent 5 Oct 2026' },
              ]}
            />
          </SidebarCard>
        </aside>
      </div>
    </div>
  )
}
