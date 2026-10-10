import type { FieldModel, FileProcessor } from '@protobase/schema'
import type { Deps } from '../deps'
import { HttpProblem, badRequest } from '../problem'
import type { Entry } from '../registry'
import { requestAccess, requireOperation, writableFields, type RequestAccess } from '../request-access'
import { tenantScope } from '../tenant'
import type { Session } from '../types'
import { ticketScope } from './attach'
import { decideType } from './detect'
import { accepts } from './media-types'
import { ticketSeconds } from './runtime'
import type { FileStore } from './store'
import { issueTicket } from './ticket'
import { FileTooLarge, incomingFile, limitedStream, readHead, tooLarge } from './upload-body'
import { cleanName, tenantSegment } from './uri'

/** How many first bytes processors get as `head`: enough for image headers, EXIF included. */
export const headBytes = 256 * 1024

// Written by the client only through the upload route: create or update on the resource, and write access to the field.
const uploadField = (access: RequestAccess, name: string | undefined): FieldModel => {
  if (!access.resolved.operations.create && !access.resolved.operations.update) requireOperation(access, 'update')
  const field = name !== undefined && Object.hasOwn(access.readable.fields, name) ? access.full.fields[name] : undefined
  if (!field?.file) throw badRequest('invalid-parameter', `"${name ?? ''}" is not a file field of ${access.entry.name}`, { errors: [{ parameter: 'field', message: 'Not a file field' }] })
  if (!writableFields(access, 'create').includes(field.name) && !writableFields(access, 'update').includes(field.name)) {
    throw badRequest('invalid-parameter', `"${field.name}" is read-only`, { errors: [{ parameter: 'field', message: 'Read-only' }] })
  }
  return field
}

type ProcessorSource = { meta: { file?: { derive?: Record<string, FileProcessor> } } }

// Each derived field's value: the processor's, or null when it does not handle this type. The field's own schema checks it.
const deriveValues = async (entry: Entry, field: FieldModel, input: { name: string; type: string; size: number; head: Uint8Array; store: FileStore; path: string }) => {
  const source = entry.source.state.fields?.[field.name] as unknown as ProcessorSource | undefined
  const derived: Record<string, unknown> = {}
  for (const [target, processor] of Object.entries(source?.meta.file?.derive ?? {})) {
    const handles = !processor.accepts || accepts(processor.accepts, input.type)
    const value = handles
      ? await processor.run({
          name: input.name,
          type: input.type,
          size: input.size,
          head: input.head,
          read: async () => {
            const body = await input.store.read(input.path)
            if (!body) throw new Error(`The upload ${input.path} is gone from its store`)
            return body
          },
        })
      : null
    const schema = entry.source.state.fields?.[target]?.schema
    const normalized = value === undefined ? null : value
    if (schema && !schema.safeParse(normalized).success) throw new Error(`The processor for "${target}" of ${entry.name} returned ${JSON.stringify(normalized)}, which that field refuses`)
    derived[target] = normalized
  }
  return derived
}

/**
 * `POST /{resource}:upload?field=<field>`: streams one file to the field's provider and answers with a ticket for a
 * write. The type is decided from the first bytes before anything is stored, a refused type gets 415 and a file over
 * `maxSize` 413. The field's processors then compute its derived values, which the ticket carries signed. An upload no
 * write ever uses is deleted after the ticket expires.
 */
export const uploadFile = async (deps: Deps, entry: Entry, session: Session, request: Request) => {
  const files = deps.files
  const access = await requestAccess(deps, entry, session)
  const field = uploadField(access, new URL(request.url).searchParams.get('field') ?? undefined)
  if (!files) throw new Error(`Resource "${entry.name}" has file fields but no file runtime`)
  const { accept, maxSize, provider: providerName } = field.file!
  const provider = files.providers[providerName]!

  const incoming = await incomingFile(request, maxSize)
  const reader = incoming.body.getReader()
  const { head, complete } = await readHead(reader, headBytes)
  if (head.length > maxSize) {
    await reader.cancel()
    throw tooLarge(maxSize)
  }
  const name = cleanName(incoming.name)
  const decision = await decideType({ head, complete, name, accept, ...(incoming.declared && { declared: incoming.declared }) })
  if (!accepts(accept, decision.type)) {
    await reader.cancel()
    throw new HttpProblem(415, 'unsupported-type', 'Unsupported Media Type', `This field takes ${accept.join(', ')}; the file is ${decision.type}`, { detected: decision.type, accept })
  }

  const expires = Math.floor(Date.now() / 1000) + ticketSeconds
  const tenant = await tenantSegment(tenantScope(entry, session)?.tenantValue)
  const path = `${tenant}/${crypto.randomUUID()}.${decision.extension}`
  // Scheduled first, so even an upload that fails half way is cleaned up; an hour past the ticket, after any write using it.
  await files.schedule.add([{ provider: providerName, path, due: new Date((expires + 3_600) * 1000) }])
  let size: number
  try {
    size = (await provider.store.put(path, limitedStream(head, reader, maxSize))).size
  } catch (error) {
    if (error instanceof FileTooLarge) throw tooLarge(maxSize)
    throw error
  }

  const derived = await deriveValues(entry, field, { name, type: decision.type, size, head, store: provider.store, path })
  const ref = { provider: providerName, path, name, size }
  const value = await issueTicket(files.signer, ref, derived, ticketScope(access, field.name), expires)
  return { value, file: { name, type: decision.type, size }, derived, ...(decision.corrected && { corrected: decision.corrected }) }
}
