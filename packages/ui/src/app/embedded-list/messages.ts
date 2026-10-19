import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    firstOf: (shown: number, total: string) => `The first ${shown} of ${total}.`,
    firstOfAbout: (shown: number, total: string) => `The first ${shown} of about ${total}.`,
    open: (singular: string) => `Open ${singular}`,
    edit: (singular: string) => `Edit ${singular}`,
    viewAll: 'View all',
    couldNotLoad: 'Could not load',
    nothingYet: 'Nothing here yet.',
  },
  nl: {
    firstOf: (shown: number, total: string) => `De eerste ${shown} van ${total}.`,
    firstOfAbout: (shown: number, total: string) => `De eerste ${shown} van ongeveer ${total}.`,
    open: (singular: string) => `${singular} openen`,
    edit: (singular: string) => `${singular} bewerken`,
    viewAll: 'Alles bekijken',
    couldNotLoad: 'Kon niet laden',
    nothingYet: 'Hier staat nog niets.',
  },
})
