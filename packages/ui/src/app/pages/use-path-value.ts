import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { resolveFieldPath, type PathStep } from '@protobase/layout'
import type { Client } from '@protobase/client'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { LiveRecord } from '../../data/use-record'
import { useAdminMeta } from '../meta-gate'
import type { LayoutRecord } from './record-scope'

export type PathValue =
  | { state: 'ready'; value: unknown; field: FieldModel; model: ResourceModel }
  | { state: 'loading' }
  | { state: 'missing' }

/** The steps of `path` from the record around it, or none when it names nothing the caller can read. */
const stepsOf = (resources: Record<string, ResourceModel>, scope: LayoutRecord | undefined, path: string): PathStep[] => {
  if (!scope) return []
  const resolved = resolveFieldPath(resources, scope.model.name, path)
  return resolved.ok ? resolved.steps : []
}

/** The query that follows the relations of `steps` from `scope`, fetching each record it passes like a record page. */
const pathQuery = (client: Client, queryClient: QueryClient, scope: LayoutRecord | undefined, path: string, steps: PathStep[]) => ({
  queryKey: keys.pathValue(scope?.model.name ?? '', scope?.key ?? '', path),
  enabled: steps.length > 1,
  queryFn: async () => {
    let record = scope!.record
    for (const step of steps.slice(0, -1)) {
      const id = record[step.field.name]
      if (id === null || id === undefined) return null
      const target = step.field.relation!.resource
      const stored = await queryClient.fetchQuery<LiveRecord>({ queryKey: keys.record(target, String(id)), queryFn: () => client.get(target, String(id)) })
      record = stored.record
    }
    return record[steps.at(-1)!.field.name] ?? null
  },
})

const valueOf = (scope: LayoutRecord | undefined, steps: PathStep[], query: { isPending: boolean; data: unknown }): PathValue => {
  const last = steps.at(-1)
  if (!scope || !last) return { state: 'missing' }
  if (steps.length === 1) return { state: 'ready', value: scope.record[last.field.name], field: last.field, model: last.model }
  if (query.isPending) return { state: 'loading' }
  return { state: 'ready', value: query.data ?? null, field: last.field, model: last.model }
}

/** The value at `path` from the record around it: `status` directly, `plan.name` through the plan it points at. */
export const usePathValue = (scope: LayoutRecord | undefined, path: string): PathValue => {
  const { resources } = useAdminMeta()
  const steps = stepsOf(resources, scope, path)
  const query = useQuery(pathQuery(useClient(), useQueryClient(), scope, path, steps))
  return valueOf(scope, steps, query)
}

/** Several paths at once, for conditions. */
export const usePathValues = (scope: LayoutRecord | undefined, paths: string[]): PathValue[] => {
  const { resources } = useAdminMeta()
  const client = useClient()
  const queryClient = useQueryClient()
  const steps = paths.map((path) => stepsOf(resources, scope, path))
  const queries = useQueries({ queries: paths.map((path, index) => pathQuery(client, queryClient, scope, path, steps[index]!)) })
  return paths.map((_, index) => valueOf(scope, steps[index]!, queries[index]!))
}
