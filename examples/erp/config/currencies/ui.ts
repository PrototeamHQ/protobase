import { view } from '@protobase/schema'
import type { currencies } from './data'

export const currenciesView = view<typeof currencies>('currencies')
  .names({ singular: 'Currency', plural: 'Currencies' })
  .list((r) => ({ columns: [r.name, r.symbol, r.decimals] }))
