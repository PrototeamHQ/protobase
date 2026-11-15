import type { ChartProps } from '@protobase/layout'
import { chartAggregate } from '../../charts/chart-params'
import { aggregateQuery } from '../../../data/use-aggregates'
import { blockQuery, type BlockQueries } from '../block-query'
import { propsOf } from './block-props'

/** A `Chart`'s `:aggregate`, as `ChartView` reads it. */
export const chartQueries: BlockQueries = (node, _read, { client, resources, views }) => {
  const { resource, groupBy, splitBy, sum, average, filter, granularity, range, limit } = propsOf<ChartProps>(node)
  const model = resources[resource]
  const params = model && chartAggregate({ model, groupBy, splitBy, sum, average, filter, granularity, range, limit }, resources, views)
  return model && params ? [blockQuery(aggregateQuery(client, model.name, params))] : []
}
