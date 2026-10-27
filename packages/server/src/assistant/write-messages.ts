import { defineMessages } from '../locale/messages'

/** The texts of the approvals the write tools ask for, which the user reads in their client. */
export const writeText = defineMessages({
  en: {
    createTitle: (resource: string, title: string | undefined) => `Create ${resource}${title === undefined ? '' : ` "${title}"`}?`,
    updateTitle: (record: string) => `Update ${record}?`,
    deleteTitle: (record: string) => `Delete ${record}?`,
    create: 'Create',
    update: 'Update',
    delete: 'Delete',
    deleteForGood: 'Delete for good',
    reject: 'Cancel',
    noChanges: 'No field changes.',
    restorable: 'It can be restored: the record is kept, marked deleted.',
    permanent: 'This cannot be undone: the record is removed for good.',
    empty: 'empty',
    hidden: 'hidden',
    yes: 'Yes',
    no: 'No',
  },
  nl: {
    createTitle: (resource: string, title: string | undefined) => `${resource}${title === undefined ? '' : ` "${title}"`} aanmaken?`,
    updateTitle: (record: string) => `${record} bijwerken?`,
    deleteTitle: (record: string) => `${record} verwijderen?`,
    create: 'Aanmaken',
    update: 'Bijwerken',
    delete: 'Verwijderen',
    deleteForGood: 'Definitief verwijderen',
    reject: 'Annuleren',
    noChanges: 'Er verandert geen veld.',
    restorable: 'Het kan worden teruggezet: het record blijft bewaard, gemarkeerd als verwijderd.',
    permanent: 'Dit kan niet ongedaan worden gemaakt: het record wordt definitief verwijderd.',
    empty: 'leeg',
    hidden: 'verborgen',
    yes: 'Ja',
    no: 'Nee',
  },
})
