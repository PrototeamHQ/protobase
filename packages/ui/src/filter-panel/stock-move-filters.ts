import type { FilterConfig } from './filter-config'

export const stockMoveFilters: FilterConfig = {
  facets: [
    {
      id: 'kind',
      label: 'Type',
      options: [
        { value: 'issue', label: 'Issue', count: 5_632_000 },
        { value: 'receipt', label: 'Receipt', count: 2_867_200 },
        { value: 'transfer', label: 'Transfer', count: 1_331_200 },
        { value: 'adjustment', label: 'Adjustment', count: 409_600 },
      ],
    },
    {
      id: 'warehouse',
      label: 'Warehouse',
      options: [
        { value: 'AMS-01', label: 'Amsterdam (AMS-01)', count: 3_481_600 },
        { value: 'RTM-02', label: 'Rotterdam (RTM-02)', count: 2_867_200 },
        { value: 'DUS-01', label: 'Düsseldorf (DUS-01)', count: 2_457_600 },
        { value: 'ANT-03', label: 'Antwerp (ANT-03)', count: 1_433_600 },
      ],
    },
    {
      id: 'category',
      label: 'Product group',
      searchable: true,
      options: [
        { value: 'FST', label: 'Fasteners', count: 1_904_000 },
        { value: 'ELC', label: 'Electrical', count: 1_536_000 },
        { value: 'PKG', label: 'Packaging', count: 1_402_000 },
        { value: 'HYD', label: 'Hydraulics', count: 1_118_000 },
        { value: 'PPE', label: 'Safety equipment', count: 962_000 },
        { value: 'BRG', label: 'Bearings', count: 874_000 },
      ],
    },
  ],
  range: {
    id: 'quantity',
    label: 'Quantity',
    min: -200,
    max: 200,
    step: 5,
    histogram: [1, 2, 3, 5, 8, 14, 26, 61, 94, 71, 40, 22, 31, 38, 33, 24, 17, 11, 8, 6, 4, 3, 2, 1],
    format: (value) => (value > 0 ? `+${value}` : String(value)),
  },
  datePresets: true,
  toggles: [{ id: 'review', label: 'Needs review' }],
}
