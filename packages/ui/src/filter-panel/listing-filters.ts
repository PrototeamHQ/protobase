import { formatMoney } from '../format/money'
import type { FilterConfig } from './filter-config'

/** A portal's listings: a reference to places as a combobox, and three ranges, two of them without a histogram. */
export const listingFilters: FilterConfig = {
  facets: [
    {
      id: 'offer_type',
      label: 'Offer type',
      options: [
        { value: 'sale', label: 'For sale', count: 257 },
        { value: 'rent', label: 'For rent', count: 136 },
      ],
    },
    {
      id: 'place_id',
      label: 'Place',
      combobox: true,
      options: [
        { value: '1', label: 'Amsterdam', count: 31 },
        { value: '23', label: 'Madrid', count: 27 },
        { value: '24', label: 'Barcelona', count: 27 },
        { value: '3', label: 'Den Haag', count: 21 },
        { value: '26', label: 'Sevilla', count: 20 },
        { value: '2', label: 'Rotterdam', count: 19 },
        { value: '7', label: 'Haarlem', count: 14 },
      ],
    },
  ],
  ranges: [
    {
      id: 'price',
      label: 'Price',
      min: 0,
      max: 2_000_000,
      step: 10_000,
      histogram: [61, 9, 6, 4, 4, 8, 3, 9, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      format: (value) => formatMoney(value * 100).replace('.00', ''),
    },
    { id: 'living_area', label: 'Living area (m²)', min: 27, max: 295, step: 3, histogram: [], format: String },
    { id: 'bedrooms', label: 'Bedrooms', min: 0, max: 6, step: 1, histogram: [], format: String },
  ],
  toggles: [{ id: 'garden', label: 'Garden' }],
}
