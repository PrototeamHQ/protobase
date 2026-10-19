import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    none: (plural: string) => `No ${plural}`,
  },
  nl: {
    none: (plural: string) => `Geen ${plural}`,
  },
})
