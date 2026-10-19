import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    couldNotLoad: 'Could not load',
    noneMatch: (plural: string) => `No ${plural} match.`,
    viewAll: 'View all',
    new: 'New',
    previous: (label: string) => `Previous ${label}`,
    next: (label: string) => `Next ${label}`,
    couldNotLoadYour: (plural: string) => `Could not load your ${plural}`,
    noneYet: (plural: string) => `No ${plural} yet.`,
  },
  nl: {
    couldNotLoad: 'Kon niet laden',
    noneMatch: (plural: string) => `Geen ${plural} gevonden.`,
    viewAll: 'Alles bekijken',
    new: 'Nieuw',
    previous: (label: string) => `Terug in ${label}`,
    next: (label: string) => `Verder in ${label}`,
    couldNotLoadYour: (plural: string) => `Kon je ${plural} niet laden`,
    noneYet: (plural: string) => `Nog geen ${plural}.`,
  },
})
