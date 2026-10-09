import { l, view } from '@protobase/schema'
import type { owners } from './data'

export const ownersView = view<typeof owners>('owners')
  .title((r) => r.name)
  .names({ singular: 'Owner', plural: 'Owners' })
  .fields((r) => ({
    kind: r.kind.format('badge').valueLabels({ private: 'Private', company: 'Company', pension_fund: 'Pension fund', housing_association: 'Housing association' }),
    iban: r.iban.label('IBAN').help('Where the rent, less the management fee, is paid out.').format('code'),
    managementFeePercent: r.managementFeePercent.label('Management fee').help('Share of the collected rent the firm keeps.').format('percent'),
  }))
  .list((r) => ({ columns: [r.name, r.kind, r.email, r.managementFeePercent], search: [r.name] }))
  .filters((r, w) => [w.facets(r.kind)])
  .layout((r) => [
    l.section('Owner', [r.name, r.kind, r.email, r.phone]),
    l.section('Payout', [r.iban, r.managementFeePercent]),
  ])
