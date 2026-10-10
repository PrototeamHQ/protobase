import { defineFunction, functionApp } from '@protobase/server'
import { nextStatus } from './status'

// /api/functions/workshop/*: the workshop's tablet app, a Hono app on its own origin. `c.env` is the function's
// context, so every route acts as the signed-in mechanic.
const app = functionApp()

// GET /api/functions/workshop/queue
app.get('/queue', async (c) => {
  const page = await c.env.records.list('repairs', { filter: 'status = "waiting" OR status = "working"', order_by: 'bookedOn', fields: ['id', 'number', 'bike', 'status'] })
  return c.json(page.items)
})

// POST /api/functions/workshop/7/advance
app.post('/:id/advance', async (c) => {
  const id = Number(c.req.param('id'))
  const { record, etag } = await c.env.records.get('repairs', id)
  const updated = await c.env.records.update('repairs', id, { status: nextStatus(record.status as string) }, { etag })
  return c.json(updated.record)
})

export default defineFunction({ roles: ['mechanic'], cors: { origin: 'https://workshop.pips-bikes.example' } }, app)
