import type { AssistantState } from '@protobase/schema'
import { proposalCard } from '../app/testing/fake-assistant'

/** Story data: a question answered with a query, and a proposal waiting for an answer. */
export const conversation: AssistantState = {
  replying: false,
  status: 'Example backend',
  messages: [
    { id: 'm1', from: 'user', parts: [{ type: 'text', id: 'm1-text', text: 'Which invoices are still unpaid?' }] },
    {
      id: 'm2',
      from: 'assistant',
      parts: [
        {
          type: 'table',
          id: 'm2-table',
          caption: 'select number, customer, total from sales.invoices where paid_at is null',
          columns: ['number', 'customer', 'total'],
          rows: [['INV-0039', 'Brightside', '980.50'], ['INV-0031', 'Northwind', '410.25']],
        },
        { type: 'text', id: 'm2-text', text: 'Two invoices are unpaid: INV-0039 from Brightside and INV-0031 from Northwind.' },
      ],
    },
    { id: 'm3', from: 'user', parts: [{ type: 'text', id: 'm3-text', text: 'Add a discount to invoices and show it in the list' }] },
    { id: 'm4', from: 'assistant', parts: [proposalCard] },
  ],
}
