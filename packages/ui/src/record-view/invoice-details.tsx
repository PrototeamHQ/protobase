import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { userById, type Invoice } from '../mocks'
import { Input } from '../primitives/input'
import { Field } from './field'
import { toIsoDay, validateInvoice } from './invoice-validation'
import { Section } from './section'

export type InvoiceDetailsProps = {
  invoice: Invoice
  conflictField: 'paymentTerms' | 'none'
  onEdit: () => void
}

export const InvoiceDetails = ({ invoice, conflictField, onEdit }: InvoiceDetailsProps) => {
  const [issuedAt, setIssuedAt] = useState(toIsoDay(invoice.issuedAt))
  const [dueAt, setDueAt] = useState(toIsoDay(invoice.dueAt))
  const [reference, setReference] = useState('PO-48213')
  const [terms, setTerms] = useState(invoice.paymentTerms)
  const [conflictOpen, setConflictOpen] = useState(conflictField === 'paymentTerms')
  const errors = validateInvoice({ issuedAt, dueAt, reference })

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    onEdit()
  }

  return (
    <Section title="Billing details" help="Who is being billed and when payment is due. Changes are saved as you type, and everyone viewing this invoice sees them.">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Field label="Customer" help="Pick the legal entity that receives the invoice.">
          <Input readOnly value={invoice.customer.name} />
        </Field>
        <Field label="Customer reference" help="Printed on the PDF so the customer can match it to their purchase order." example="PO-48213" error={errors.reference}>
          <Input value={reference} invalid={!!errors.reference} onChange={(event) => edit(setReference)(event.target.value)} />
        </Field>
        <Field label="Issue date" example="2026-10-01" error={errors.issuedAt}>
          <Input leading={<CalendarDays className="size-4" />} value={issuedAt} invalid={!!errors.issuedAt} onChange={(event) => edit(setIssuedAt)(event.target.value)} />
        </Field>
        <Field label="Due date" help="Usually the issue date plus the payment terms." example="2026-10-31" error={errors.dueAt}>
          <Input leading={<CalendarDays className="size-4" />} value={dueAt} invalid={!!errors.dueAt} onChange={(event) => edit(setDueAt)(event.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field
            label="Payment terms"
            help="Controls reminders and the late-payment notice."
            example="Net 30"
            conflict={
              conflictOpen
                ? {
                    user: userById('u2'),
                    ago: '2 min ago',
                    theirValue: 'Net 14',
                    onKeepMine: () => setConflictOpen(false),
                    onUseTheirs: () => {
                      setTerms('Net 14')
                      setConflictOpen(false)
                    },
                  }
                : undefined
            }
          >
            <Input value={terms} onChange={(event) => edit(setTerms)(event.target.value)} />
          </Field>
        </div>
      </div>
    </Section>
  )
}
