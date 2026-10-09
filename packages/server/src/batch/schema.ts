import { z } from 'zod'

export const maxOperations = 500

const ref = z.object({ $ref: z.string().min(1), field: z.string().optional() }).strict()
const part = z.union([z.string(), z.number(), ref])
/** A key: its URL text (`a,b` when composite), a scalar, a list of parts, or a reference to a record created earlier. */
const key = z.union([z.string(), z.number(), z.array(part), ref])
const data = z.record(z.string(), z.unknown())
const resource = z.string().min(1)

const operations = z.array(z.discriminatedUnion('op', [
    z.object({ op: z.literal('create'), resource, data, ref: z.string().min(1).optional() }),
    z.object({ op: z.literal('update'), resource, key, etag: z.string().optional(), data }),
    z.object({ op: z.literal('delete'), resource, key, etag: z.string().optional() }),
    z.object({ op: z.literal('reorder'), resource, field: z.string().min(1), keys: z.array(key).min(1), etags: z.record(z.string(), z.string()).optional() }),
  ])).min(1).max(maxOperations)

/** `{ ops: [...] }`; `{ operations: [...] }` is accepted too, for clients written against that name. */
export const batchBody = z.union([z.object({ ops: operations }), z.object({ operations })]).transform((body) => ({ ops: 'ops' in body ? body.ops : body.operations }))

export type BatchOperation = z.output<typeof batchBody>['ops'][number]
export type KeyInput = z.output<typeof key>
export type RefInput = z.output<typeof ref>
