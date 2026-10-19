import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    couldNotLoad: 'Could not load the photos',
    showAll: (count: number) => `Show all ${count} photos`,
    showPhoto: (index: number, count: number) => `Show photo ${index} of ${count}`,
    details: 'Details',
    holderDetails: (singular: string) => `${singular} details`,
    close: 'Close',
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    couldNotLoadOne: (singular: string) => `Could not load the ${singular}`,
    open: (singular: string) => `Open ${singular}`,
  },
  nl: {
    couldNotLoad: 'Kon de foto’s niet laden',
    showAll: (count: number) => `Alle ${count} foto’s tonen`,
    showPhoto: (index: number, count: number) => `Foto ${index} van ${count} tonen`,
    details: 'Gegevens',
    holderDetails: (singular: string) => `Gegevens van ${singular.toLowerCase()}`,
    close: 'Sluiten',
    previousPhoto: 'Vorige foto',
    nextPhoto: 'Volgende foto',
    couldNotLoadOne: (singular: string) => `Kon ${singular} niet laden`,
    open: (singular: string) => `${singular} openen`,
  },
})
