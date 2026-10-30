import { defineFunction } from '@protobase/server'
import { invoiceDocument } from '../documents/invoice'

// GET /api/functions/invoice-pdf/<id>: the invoice as a PDF file, for anyone who reads invoices.
export default defineFunction({ capability: 'invoices.read' }, async (request, { records }) => {
  const id = new URL(request.url).pathname.slice(1)
  const { record: invoice } = await records.get('invoices', id)
  const { record: company } = await records.get('companies', invoice.company_id as number)
  const number = invoice.number as string
  const pdf = await invoiceDocument.render({
    number,
    company: company.name as string,
    issuedAt: invoice.issued_at as string,
    dueAt: invoice.due_at as string,
    total: invoice.total as string,
  })
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="invoice-${number}.pdf"` } })
})
