import { formatMoney } from '../format/money'
import type { FilterConfig } from './filter-config'

export const ordersFilters: FilterConfig = {
  facets: [
    {
      id: 'status',
      label: 'Status',
      options: [
        { value: 'delivered', label: 'Delivered', count: 39_540 },
        { value: 'shipped', label: 'Shipped', count: 3_112 },
        { value: 'cancelled', label: 'Cancelled', count: 2_894 },
        { value: 'picking', label: 'Picking', count: 1_377 },
        { value: 'confirmed', label: 'Confirmed', count: 1_104 },
        { value: 'draft', label: 'Draft', count: 186 },
      ],
    },
    {
      id: 'country',
      label: 'Country',
      options: [
        { value: 'NL', label: 'Netherlands', count: 24_361 },
        { value: 'DE', label: 'Germany', count: 14_702 },
        { value: 'GB', label: 'United Kingdom', count: 9_150 },
      ],
    },
    {
      id: 'owner',
      label: 'Owner',
      options: [
        { value: 'u2', label: 'Jonas K.', count: 16_804 },
        { value: 'u5', label: 'Imke V.', count: 15_977 },
        { value: 'u8', label: 'Daan P.', count: 15_432 },
      ],
    },
  ],
  range: {
    id: 'total',
    label: 'Total',
    min: 0,
    max: 5000,
    step: 50,
    histogram: [34, 52, 61, 58, 49, 41, 33, 27, 21, 17, 13, 10, 8, 6, 5, 4, 3, 2, 2, 1, 1, 1, 1, 2],
    format: (value) => (value === 5000 ? `${formatMoney(value * 100).replace('.00', '')}+` : formatMoney(value * 100).replace('.00', '')),
  },
  datePresets: true,
  toggles: [
    { id: 'unpaid', label: 'Unpaid only' },
    { id: 'discounted', label: 'With discount' },
  ],
}
