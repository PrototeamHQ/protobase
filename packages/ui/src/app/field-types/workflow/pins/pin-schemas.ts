import { useMemo } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { keyTypes, recordJsonSchema } from '@protobase/schema/internal'
import type { PinSchemas } from '@protobase/workflows'
import { useMeta } from '../../../../data/use-meta'
import { humanize } from '../../../../live/naming'

/** The schemas pins are typed by: the types' inputs and outputs, and each resource's record titled by its singular name. */
export const pinSchemas = (types: WorkflowTypeList, resources: Record<string, ResourceModel>, views: Record<string, ViewModel> = {}): PinSchemas => ({
  inputs: Object.fromEntries(types.step_types.map((type) => [type.id, type.input])),
  outputs: Object.fromEntries([...types.step_types, ...types.triggers].flatMap((type) => (type.output ? [[type.id, type.output]] : []))),
  records: (resource, use) => {
    const model = resources[resource]
    return model && recordJsonSchema(model, use, views[resource]?.names?.singular ?? humanize(resource), keyTypes((name) => resources[name]))
  },
})

/** The app's pin schemas, from its types and the resources the signed-in user's `/meta` holds. */
export const usePinSchemas = (types: WorkflowTypeList) => {
  const { data } = useMeta()
  return useMemo(() => pinSchemas(types, data?.resources ?? {}, data?.views), [types, data?.resources, data?.views])
}
