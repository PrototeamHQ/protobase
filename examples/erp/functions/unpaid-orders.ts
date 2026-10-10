import { defineFunction } from '@protobase/server'

// GET /api/functions/unpaid-orders: delivered orders that are not paid yet, oldest first, as the caller may see them
// (a sales rep, only their own).
export default defineFunction(async (_request, { records }) => {
  const page = await records.list('orders', {
    filter: 'status = "delivered" AND paid = false',
    order_by: 'createdAt',
    page_size: 20,
    fields: ['id', 'number', 'companyId', 'total', 'createdAt'],
  })
  return Response.json({ orders: page.items.map(({ etag, permissions, ...order }) => order) })
})
