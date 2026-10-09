import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import type { DeleteTarget } from './use-delete-flow'

/** Brings a soft-deleted record back (AIP-164), for the Undo toast. */
export const useRestore = (model: ResourceModel) => {
  const client = useClient()
  return model.softDelete ? async (target: DeleteTarget) => void (await client.undelete(model.name, target.key)) : undefined
}
