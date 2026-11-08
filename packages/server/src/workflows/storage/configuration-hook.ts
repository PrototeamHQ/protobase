import { badRequest } from '../../problem'
import type { PipelineHook, WriteCheck } from '../../types'
import type { WorkflowsStorage } from '../options'
import { configurationProblem, type ConfigurationRow } from './configuration-rules'
import { endpointProblem } from './endpoint-check'
import type { Resolve } from '../../webhooks/table/pinned-request'

const resource = 'storage_configurations'

const refused = (field: string, message: string) =>
  badRequest('invalid-storage-configuration', `The storage configuration cannot be saved: ${message}`, { errors: [{ code: 'invalid-storage-configuration', field, message }] })

/** Refuses a create or update whose saved row breaks the storage rules (`configurationProblem`); the write rolls back. */
export const storageConfigurationHook = (storage: WorkflowsStorage): PipelineHook => async (event) => {
  if (event.resource.name !== resource || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  const problem = configurationProblem(event.after as ConfigurationRow, storage)
  if (problem) throw refused(problem.field, problem.message)
}

/**
 * The early refusal of an endpoint that is, or resolves to, a private address, before the write's transaction opens.
 * Every store a step builds checks it again, which is the check that holds.
 */
export const storageEndpointCheck = (storage: WorkflowsStorage, allowPrivateAddresses: boolean, resolve?: Resolve): WriteCheck => async ({ resource: name, body }) => {
  if (name !== resource || typeof body !== 'object' || body === null) return
  const { endpoint } = body as { endpoint?: unknown }
  if (typeof endpoint !== 'string') return
  const problem = await endpointProblem(endpoint, { endpoints: storage.endpoints, allowPrivateAddresses, ...(resolve && { resolve }) })
  if (problem) throw refused('endpoint', problem)
}
