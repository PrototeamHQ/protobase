import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    create: 'created this',
    update: 'changed',
    delete: 'deleted this',
    undelete: 'restored this',
    database: 'Database',
    databaseRole: (role: string) => `Database (${role})`,
    changed: 'changed',
    changedThis: 'changed this',
    couldNotLoad: 'Could not load the history',
    noChanges: 'No changes kept yet.',
    showMore: 'Show more',
  },
  nl: {
    create: 'maakte dit',
    update: 'wijzigde',
    delete: 'verwijderde dit',
    undelete: 'zette dit terug',
    database: 'Database',
    databaseRole: (role: string) => `Database (${role})`,
    changed: 'gewijzigd',
    changedThis: 'wijzigde dit',
    couldNotLoad: 'Kon de geschiedenis niet laden',
    noChanges: 'Nog geen wijzigingen bewaard.',
    showMore: 'Meer tonen',
  },
})
