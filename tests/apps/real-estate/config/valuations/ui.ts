import { view } from '@protobase/schema'
import type { valuations } from './data'

export const valuationsView = view<typeof valuations>('valuations')
  .names({ singular: 'Valuation', plural: 'Valuations' })
  .fields((r) => ({
    property_id: r.property_id.label('Property'),
    valued_on: r.valued_on.label('Valuation date'),
    value: r.value.prefix('€').decimals(0),
    source: r.source.help('WOZ is the municipal value set every year; an appraisal is a valuer\'s report.').format('badge').valueLabels({ woz: 'WOZ', appraisal: 'Appraisal' }),
  }))
  .list((r) => ({ columns: [r.property_id, r.valued_on, r.source, r.value], sort: [[r.valued_on, 'desc']] }))
  .filters((r, w) => [w.facets(r.source), w.dateRange(r.valued_on, { presets: ['year'] })])
