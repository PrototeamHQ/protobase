import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    close: 'Close',
    loading: 'Loading',
    remove: (label: string) => `Remove ${label}`,
  },
  nl: {
    close: 'Sluiten',
    loading: 'Laden',
    remove: (label: string) => `${label} verwijderen`,
  },
})
