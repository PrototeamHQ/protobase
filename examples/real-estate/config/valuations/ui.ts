import { view } from '@protobase/schema'
import type { valuations } from './data'

export const valuationsView = view<typeof valuations>('valuations')
  .names({ singular: 'Valuation', plural: 'Valuations' })
  .fields((r) => ({
    propertyId: r.propertyId.label('Property'),
    valuedOn: r.valuedOn.label('Valuation date'),
    value: r.value.prefix('€').decimals(0),
    source: r.source.help('WOZ is the municipal value set every year; an appraisal is a valuer\'s report.').format('badge').valueLabels({ woz: 'WOZ', appraisal: 'Appraisal' }),
  }))
  .list((r) => ({ columns: [r.propertyId, r.valuedOn, r.source, r.value], sort: [[r.valuedOn, 'desc']] }))
  .filters((r, w) => [w.facets(r.source), w.dateRange(r.valuedOn, { presets: ['year'] })])
