import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    table: 'Table',
    noRows: 'No rows.',
    rows: (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`,
    cutOff: ', cut off at the limit',
  },
  nl: {
    table: 'Tabel',
    noRows: 'Geen rijen.',
    rows: (count: number) => `${count} ${count === 1 ? 'rij' : 'rijen'}`,
    cutOff: ', afgekapt bij de limiet',
  },
})
