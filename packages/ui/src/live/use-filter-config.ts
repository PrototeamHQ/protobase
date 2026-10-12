import { useQueries, useQueryClient } from '@tanstack/react-query'
import { enumLabel, type FilterExpr, type ResourceModel, type ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { formatMoney } from '../format/money'
import type { FacetOption, FilterConfig, FilterState, RangeConfig } from '../filter-panel'
import { setRange } from '../filter-panel/filter-state'
import { stateToText } from './filter-string'
import { humanize } from './naming'
import { labelKeys, matchOptions } from './reference-options'
import { fetchLabels } from './relation-labels'
import { useReferenceSearch } from './use-reference-search'
import { rangeHistogram, widgetFields } from './view-fields'

export type FilterConfigParams = {
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  view: ViewModel | undefined
  state: FilterState
  extras: FilterExpr[]
}

const histogramBuckets = 24

/**
 * The panel's config for a view: facet counts come from `:facets` and each range's bounds from `:histogram`, each
 * computed with every other active filter applied but not its own, so choosing one value does not hide the rest.
 */
export const useFilterConfig = ({ model, resources, views, view, state, extras }: FilterConfigParams): FilterConfig => {
  const client = useClient()
  const queryClient = useQueryClient()
  const skeleton = widgetFields(view, model)
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)
  const targetOf = (name: string) => {
    const field = model.fields[name]
    return field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
  }

  // A facet group counts its field's values; a flags group counts each of its fields, of which it shows the true ones.
  const counted = skeleton.facets.flatMap((group) => (group.flags ? group.options.map((option) => option.value) : [group.id]).map((field) => ({ group: group.id, field })))
  const facetQueries = useQueries({
    queries: counted.map(({ group, field }) => {
      const filter = stateToText(skeleton, { ...state, facets: { ...state.facets, [group]: [] } }, extras)
      return { queryKey: keys.facets(model.name, field, filter), queryFn: () => client.facets(model.name, field, { filter, limit: 50 }) }
    }),
  })
  const counts = (group: string, field: string) => facetQueries[counted.findIndex((entry) => entry.group === group && entry.field === field)]?.data

  const labelQueries = useQueries({
    queries: skeleton.facets.map((group) => {
      const target = targetOf(group.id)
      const ids = labelKeys((counts(group.id, group.id) ?? []).flatMap((facet) => (facet.value === null ? [] : [String(facet.value)])), state.facets[group.id] ?? [])
      return {
        queryKey: keys.labels(`facet:${model.name}.${group.id}`, ids.join(',')),
        enabled: Boolean(target) && ids.length > 0,
        queryFn: async () => [...(await fetchLabels(queryClient, client, target!, ids, views[target!.name]))],
      }
    }),
  })

  const searches = useReferenceSearch(
    skeleton.facets.map((group) => ({ id: group.id, target: group.combobox ? targetOf(group.id) : undefined })),
    views,
  )

  const ranges = skeleton.ranges ?? []
  const histogramQueries = useQueries({
    queries: ranges.map((range) => {
      const filter = stateToText(skeleton, setRange(state, range.id, undefined), extras)
      const buckets = rangeHistogram(view, range.id) ? histogramBuckets : 1
      return { queryKey: keys.histogram(model.name, range.id, buckets, filter), queryFn: () => client.histogram(model.name, range.id, { filter, buckets }) }
    }),
  })

  const facetGroup = (group: FilterConfig['facets'][number], index: number) => {
    if (group.flags) {
      const options = group.options.map(({ value }) => ({ value, label: label(value), count: counts(group.id, value)?.find((facet) => String(facet.value) === 'true')?.count ?? 0 }))
      return { ...group, options }
    }
    const field = model.fields[group.id]
    const names = new Map(labelQueries[index]?.data ?? [])
    const values = (counts(group.id, group.id) ?? []).flatMap((facet): FacetOption[] =>
      facet.value === null
        ? []
        : [{ value: String(facet.value), label: field?.type === 'enum' ? enumLabel(String(facet.value), view?.fields[group.id]?.valueLabels) : (names.get(String(facet.value)) ?? String(facet.value)), count: facet.count }],
    )
    const search = searches[index]!
    return {
      ...group,
      label: label(group.id),
      options: search.matches ? matchOptions(search.matches, values) : values,
      ...(names.size > 0 && { labels: Object.fromEntries(names) }),
      ...(search.onSearch && { onSearch: search.onSearch }),
    }
  }

  const rangeConfig = (range: RangeConfig, index: number): RangeConfig[] => {
    const data = histogramQueries[index]?.data
    if (!data || data.min === null || data.max === null) return []
    const hints = view?.fields[range.id]
    const prefix = hints?.prefix
    const suffix = hints?.suffix ?? ''
    return [
      {
        ...range,
        label: label(range.id),
        min: Math.floor(data.min),
        max: Math.ceil(data.max),
        step: Math.max(1, Math.round((data.max - data.min) / 100)),
        histogram: rangeHistogram(view, range.id) ? data.buckets.map((bucket) => bucket.count) : [],
        format: (value: number) => `${prefix === '€' ? formatMoney(value * 100).replace('.00', '') : String(value)}${suffix}`,
      },
    ]
  }

  return {
    facets: skeleton.facets.map(facetGroup),
    ranges: ranges.flatMap(rangeConfig),
    ...(skeleton.dateField && { datePresets: skeleton.datePresets ?? true, dateField: skeleton.dateField, dateKind: skeleton.dateKind }),
    toggles: skeleton.toggles?.map((toggle) => ({ ...toggle, label: label(toggle.id) })),
  }
}
