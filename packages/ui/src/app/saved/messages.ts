import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    favorite: 'Favorite',
    couldNotLoadYour: (plural: string) => `Could not load your ${plural}`,
    noneYet: (plural: string) => `No ${plural} yet.`,
    somethingWrong: 'Something went wrong',
    couldNotTakeOff: 'Could not take it off',
    couldNotSave: 'Could not save it',
  },
  nl: {
    favorite: 'Favoriet',
    couldNotLoadYour: (plural: string) => `Kon je ${plural} niet laden`,
    noneYet: (plural: string) => `Nog geen ${plural}.`,
    somethingWrong: 'Er ging iets mis',
    couldNotTakeOff: 'Kon het niet weghalen',
    couldNotSave: 'Kon het niet bewaren',
  },
})
