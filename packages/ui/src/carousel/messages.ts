import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    photoOf: (index: number, count: number) => `Photo ${index} of ${count}`,
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
  },
  nl: {
    photoOf: (index: number, count: number) => `Foto ${index} van ${count}`,
    previousPhoto: 'Vorige foto',
    nextPhoto: 'Volgende foto',
  },
})
