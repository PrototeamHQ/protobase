import { z } from 'zod'
import { defineFunction, HttpProblem, readJson } from '@protobase/server'

const Input = z.object({ repairId: z.number().int().positive() })

// POST /api/functions/ready-for-pickup { "repairId": 7 }: the workshop finishes a repair. It reads and writes as the
// caller, so a mechanic touches only the repairs their access rules allow, and the repair's validation and write hooks
// run as for any other update.
export default defineFunction({ roles: ['mechanic', 'desk'] }, async (request, { records }) => {
  const { repairId } = await readJson(request, Input)
  const { record: repair, etag } = await records.get('repairs', repairId)
  if (repair.status !== 'working') {
    throw new HttpProblem(409, 'not-in-progress', 'Conflict', `Repair ${repair.number} is ${repair.status}, not in the workshop`)
  }
  // The ETag makes this fail with 412 when someone changed the repair since it was read.
  const ready = await records.update('repairs', repairId, { status: 'ready' }, { etag })
  const waiting = await records.list('repairs', { filter: `customerId = ${repair.customerId} AND status = "ready"`, fields: ['number', 'bike'] })
  return Response.json({ repair: ready.record, readyForCustomer: waiting.items.map(({ number, bike }) => ({ number, bike })) })
})
