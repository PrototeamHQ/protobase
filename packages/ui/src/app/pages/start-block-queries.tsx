import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { LayoutNode, ReadPlan } from '@protobase/layout'
import { useClient } from '../../data/api-provider'
import { useIsXs } from '../../lib/use-media-query'
import { useAdminMeta } from '../meta-gate'
import { blockQueries } from './block-queries'
import { usePageParamsGiven, usePageParamValues } from './page-params'
import { useProjectUi } from './project-ui'
import { rootRecordOf, useScopeStack } from './record-scope'

/**
 * Starts the queries of the blocks of `plan` that read by themselves as the page opens, beside its planned reads; each
 * block then finds its own query running or answered once it draws. It draws nothing.
 */
export const StartBlockQueries = ({ tree, plan }: { tree: LayoutNode; plan: ReadPlan | undefined }) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const { resources, views } = useAdminMeta()
  const fieldTypes = useProjectUi().fields
  const xs = useIsXs()
  const params = usePageParamValues()
  const given = usePageParamsGiven()
  const root = rootRecordOf(useScopeStack())
  const started = useMemo(() => blockQueries({ client, queryClient, resources, views, fieldTypes, xs, params, given, ...(root && { root }) }, tree, plan), [client, queryClient, resources, views, fieldTypes, xs, params, given, root, tree, plan])
  useEffect(() => {
    for (const query of started) void query.start(queryClient)
  }, [started, queryClient])
  return null
}
