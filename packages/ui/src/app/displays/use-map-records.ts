import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ListDisplayModel, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { listLabels, withLabels } from '../../live/relation-labels'
import { areaFilter, requestZoom, type MapArea } from '../map/map-area'
import { useAdminMeta } from '../meta-gate'
import { displayRow } from './list-displays'

export type MapRecordsParams = {
  model: ResourceModel
  display: Extract<ListDisplayModel, { kind: 'map' }>
  /** The fields the records' relations are labelled for, those the card shows among them. */
  fields: string[]
  /** The list's filter, its search included, and its order, as the list API takes them. */
  filter: string
  orderBy: string
  /** What the map shows; nothing is asked for without it. */
  area: MapArea | undefined
}

/**
 * The records in the map's area through the list API's `:map`, labelled for the card, or buckets of them when it holds
 * many. A new area or filter keeps the previous answer until its own arrives, and an answer for an area the map has
 * left is never shown.
 */
export const useMapRecords = ({ model, display, fields, filter, orderBy, area }: MapRecordsParams) => {
  const client = useClient()
  const { resources, views } = useAdminMeta()
  const position = { latitude: display.latitude, longitude: display.longitude }
  const inside = area ? areaFilter(filter, position, area.bounds) : ''
  const zoom = area ? requestZoom(area.zoom) : 0
  return useQuery({
    queryKey: keys.map(model.name, `${position.latitude},${position.longitude}`, zoom, inside, orderBy),
    enabled: area !== undefined,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const result = await client.map(model.name, { ...position, zoom, filter: inside, orderBy, labels: listLabels(resources, views, model, fields) })
      const labelled = withLabels(resources, model, fields, result.items, result.labels)
      return { rows: labelled.map((record) => displayRow(model, record)), buckets: result.buckets, total: result.totalSize }
    },
  })
}
