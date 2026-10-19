import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    done: 'Done',
    sort: 'Sort',
    couldNotLoad: 'Could not load',
    tooMany: (limit: string, plural: string) => `There are more than ${limit} ${plural}, too many to sort by hand.`,
    nothingYet: 'Nothing here yet.',
    couldNotChange: 'Could not change the order',
  },
  nl: {
    done: 'Klaar',
    sort: 'Sorteren',
    couldNotLoad: 'Kon niet laden',
    tooMany: (limit: string, plural: string) => `Er zijn meer dan ${limit} ${plural}, te veel om met de hand te sorteren.`,
    nothingYet: 'Hier staat nog niets.',
    couldNotChange: 'Kon de volgorde niet wijzigen',
  },
})
