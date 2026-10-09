import { useQueries, useQueryClient } from '@tanstack/react-query'
import { enumLabel, type FilterExpr, type ResourceModel, type ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { useHistogram } from '../data/use-aggregates'
import { keys } from '../data/query-keys'
import { formatMoney } from '../format/money'
import type { FilterConfig, FilterState } from '../filter-panel'
import { stateToText } from './filter-string'
import { humanize } from './naming'
import { fetchLabels } from './relation-labels'
import { widgetFields } from './view-fields'

export type FilterConfigParams = {
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  view: ViewModel | undefined
  state: FilterState
  extras: FilterExpr[]
}

/**
 * The panel's config for a view: facet counts come from `:facets`, each computed with every
 * other active filter applied but not its own, so choosing one value does not hide the rest.
 */
export const useFilterConfig = ({ model, resources, views, view, state, extras }: FilterConfigParams): FilterConfig => {
  const client = useClient()
  const queryClient = useQueryClient()
  const skeleton = widgetFields(view, model)
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)

  const facetQueries = useQueries({
    queries: skeleton.facets.map((group) => {
      const filter = stateToText(skeleton, { ...state, facets: { ...state.facets, [group.id]: [] } }, extras)
      return { queryKey: keys.facets(model.name, group.id, filter), queryFn: () => client.facets(model.name, group.id, { filter, limit: 50 }) }
    }),
  })

  const labelQueries = useQueries({
    queries: skeleton.facets.map((group, index) => {
      const field = model.fields[group.id]
      const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
      const ids = (facetQueries[index]?.data ?? []).map((facet) => String(facet.value))
      return {
        queryKey: keys.labels(`facet:${model.name}.${group.id}`, ids.join(',')),
        enabled: Boolean(target) && ids.length > 0,
        queryFn: async () => [...(await fetchLabels(queryClient, client, target!, ids, views[target!.name]))],
      }
    }),
  })

  const rangeFilter = stateToText({ ...skeleton, range: undefined }, state, extras)
  const histogram = useHistogram(model.name, skeleton.range?.id ?? '', rangeFilter, 24, Boolean(skeleton.range))
  const prefix = skeleton.range ? view?.fields[skeleton.range.id]?.prefix : undefined

  return {
    facets: skeleton.facets.map((group, index) => {
      const field = model.fields[group.id]
      const names = new Map(labelQueries[index]?.data ?? [])
      return {
        ...group,
        label: label(group.id),
        options: (facetQueries[index]?.data ?? []).flatMap((facet) =>
          facet.value === null ? [] : [{ value: String(facet.value), label: field?.type === 'enum' ? enumLabel(String(facet.value), view?.fields[group.id]?.valueLabels) : (names.get(String(facet.value)) ?? String(facet.value)), count: facet.count }],
        ),
      }
    }),
    ...(skeleton.range && histogram.data && histogram.data.min !== null && histogram.data.max !== null && {
      range: {
        ...skeleton.range,
        label: label(skeleton.range.id),
        min: Math.floor(histogram.data.min),
        max: Math.ceil(histogram.data.max),
        step: Math.max(1, Math.round((histogram.data.max - histogram.data.min) / 100)),
        histogram: histogram.data.buckets.map((bucket) => bucket.count),
        format: (value: number) => (prefix === '€' ? formatMoney(value * 100).replace('.00', '') : String(value)),
      },
    }),
    ...(skeleton.dateField && { datePresets: skeleton.datePresets ?? true, dateField: skeleton.dateField, dateKind: skeleton.dateKind }),
    toggles: skeleton.toggles?.map((toggle) => ({ ...toggle, label: label(toggle.id) })),
  }
}
