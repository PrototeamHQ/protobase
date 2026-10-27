import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    title: (label: string) => `Change ${label}?`,
    change: 'Change',
    cancel: 'Cancel',
  },
  nl: {
    title: (label: string) => `${label} wijzigen?`,
    change: 'Wijzigen',
    cancel: 'Annuleren',
  },
})
