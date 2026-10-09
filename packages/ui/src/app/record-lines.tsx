import type { ResourceModel } from '@protobase/schema'
import { InlineChildTable } from '../inline-child-table'
import type { InvoiceLine } from '../mocks'
import { Section } from '../record-view'
import { usePermissions } from './meta-gate'
import { can } from './permissions'
import type { LinesDraft } from './use-lines-draft'

/** A resource that holds numbered lines of this one: it points at the parent and has `position` and `quantity`. */
export const findLinesResource = (resources: Record<string, ResourceModel>, parent: ResourceModel) =>
  Object.values(resources).find(
    (candidate) =>
      candidate.name !== parent.name &&
      candidate.fields.position &&
      candidate.fields.quantity &&
      Object.values(candidate.fields).some((field) => field.type === 'relation' && field.relation?.resource === parent.name),
  )

const toLine = (record: Record<string, unknown>): InvoiceLine => ({
  id: String(record.id),
  productId: String(record.productId ?? ''),
  description: String(record.description ?? ''),
  quantity: Number(record.quantity),
  unitPriceCents: Math.round(Number(record.unitPrice) * 100),
})

/** The lines of a record. Reordering only changes `draft`; the record's Save writes it, in one batch. */
export const RecordLines = ({ lines, draft, vatRate, saving }: { lines: ResourceModel; draft: LinesDraft; vatRate: number; saving: boolean }) => {
  const canReorder = can(usePermissions(lines.name), 'update')
  return (
    <Section title="Lines" help="What the document bills for. Drag the handle, or use the menu, to change the order; Save applies it.">
      <div className="-mx-4 overflow-x-auto px-4 [-webkit-overflow-scrolling:touch] md:mx-0 md:px-0">
        <div className="min-w-[560px]">
          <InlineChildTable
            lines={draft.shown.map(toLine)}
            onChange={() => undefined}
            onReorder={(next) => draft.setOrder(next.map((line) => line.id))}
            vatRate={vatRate}
            readOnly
            reorderable={canReorder && !saving}
          />
        </div>
      </div>
    </Section>
  )
}
