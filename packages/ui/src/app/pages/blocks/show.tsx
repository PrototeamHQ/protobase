import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { countedResource, evaluateCondition, parseCondition, type ShowProps } from '@protobase/layout'
import { useClient } from '../../../data/api-provider'
import { useAdminMeta } from '../../meta-gate'
import { useLayoutRecord } from '../record-scope'
import { countQuery } from '../use-layout-data'
import { usePathValues } from '../use-path-value'
import { propsOf, type BlockProps } from './block-props'

/** Its children while `when` holds: fields of the record around it, and `<resource>.count` for any resource. */
export const ShowBlock = ({ node, children }: BlockProps) => {
  const { when } = propsOf<ShowProps>(node)
  const { resources } = useAdminMeta()
  const client = useClient()
  const scope = useLayoutRecord()
  const condition = useMemo(() => parseCondition(when), [when])
  const paths = condition.ok ? condition.paths : []
  const counted = paths.map((path) => countedResource(path, (name) => Boolean(scope && Object.hasOwn(scope.model.fields, name))))
  const fieldPaths = paths.filter((_, index) => counted[index] === undefined)
  const fields = usePathValues(scope, fieldPaths)
  const counts = useQueries({
    queries: counted.flatMap((resource) => {
      const model = resource === undefined ? undefined : resources[resource]
      if (!model) return []
      return [countQuery(client, model)]
    }),
  })
  if (!condition.ok) return null
  if (fields.some((value) => value.state === 'loading') || counts.some((count) => count.isPending)) return null
  const values: Record<string, unknown> = {}
  fieldPaths.forEach((path, index) => {
    const value = fields[index]!
    if (value.state === 'ready') values[path] = value.value
  })
  let next = 0
  paths.forEach((path, index) => {
    if (counted[index] === undefined) return
    // A resource the caller cannot see has no query and counts as zero.
    values[path] = resources[counted[index]!] ? (counts[next++]?.data ?? 0) : 0
  })
  return evaluateCondition(condition, values) ? <>{children}</> : null
}
