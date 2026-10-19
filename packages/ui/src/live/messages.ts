import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    yes: 'Yes',
    no: 'No',
    shownIn: (zone: string) => `Shown in ${zone}`,
    fileMissing: 'File missing',
  },
  nl: {
    yes: 'Ja',
    no: 'Nee',
    shownIn: (zone: string) => `Getoond in ${zone}`,
    fileMissing: 'Bestand ontbreekt',
  },
})
