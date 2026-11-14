import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { countedResource, evaluateCondition, parseCondition } from '@protobase/layout'
import { useClient } from '../../data/api-provider'
import { useAdminMeta } from '../meta-gate'
import { frameFor, type LayoutRecord, type ScopeFrame } from './record-scope'
import { countQuery } from './use-layout-data'
import { usePathValues } from './use-path-value'

/** Whether each condition holds for the record around it (`scope`), as `useStackConditions` says. */
export const useConditions = (whens: string[], scope: LayoutRecord | undefined): Array<boolean | undefined> => useStackConditions(whens, scope ? [scope] : [])

/**
 * Whether each condition holds for the records around it (`stack`, outermost first): `undefined` while a value it reads
 * loads, `false` when it does not parse. A name reads from the nearest record that has that field, followed through
 * relations; `<resource>.count` counts records. All conditions share one set of queries, so the hook count never
 * changes with the conditions.
 */
export const useStackConditions = (whens: string[], stack: readonly ScopeFrame[]): Array<boolean | undefined> => {
  const { resources } = useAdminMeta()
  const client = useClient()
  const key = JSON.stringify(whens)
  const parsed = useMemo(() => (JSON.parse(key) as string[]).map(parseCondition), [key])
  const isField = (name: string) => stack.some((frame) => ('item' in frame ? typeof frame.item === 'object' && frame.item !== null && Object.hasOwn(frame.item, name) : Object.hasOwn(frame.model.fields, name)))
  const paths = [...new Set(parsed.flatMap((condition) => (condition.ok ? condition.paths : [])))]
  const counted = new Map(paths.flatMap((path) => {
    const resource = countedResource(path, isField)
    return resource === undefined ? [] : [[path, resource] as const]
  }))
  const fieldPaths = paths.filter((path) => !counted.has(path))
  const countedModels = [...new Set(counted.values())].flatMap((resource) => (resources[resource] ? [resources[resource]!] : []))
  const sources = fieldPaths.map((path) => frameFor(stack, path))
  const fields = usePathValues(fieldPaths.map((path, index) => {
    const at = sources[index]
    return at && 'frame' in at ? { scope: at.frame, path: at.path } : { scope: undefined, path }
  }))
  const counts = useQueries({ queries: countedModels.map((model) => countQuery(client, model)) })

  return parsed.map((condition) => {
    if (!condition.ok) return false
    const values: Record<string, unknown> = {}
    for (const path of condition.paths) {
      const resource = counted.get(path)
      if (resource === undefined) {
        const index = fieldPaths.indexOf(path)
        const at = sources[index]
        if (at && 'item' in at) {
          values[path] = at.item
          continue
        }
        const value = fields[index]!
        if (value.state === 'loading') return undefined
        if (value.state === 'ready') values[path] = value.value
        continue
      }
      // A resource the caller cannot see has no query and counts as zero.
      const index = countedModels.findIndex((model) => model.name === resource)
      if (index === -1) values[path] = 0
      else if (counts[index]!.isPending) return undefined
      else values[path] = counts[index]!.data ?? 0
    }
    return evaluateCondition(condition, values)
  })
}
