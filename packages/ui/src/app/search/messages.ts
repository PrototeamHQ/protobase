import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    search: 'Search',
    searchOne: (name: string) => `Search ${name}`,
    searchTwo: (first: string, second: string) => `Search ${first} and ${second}`,
    searchMore: (first: string, second: string) => `Search ${first}, ${second} and more`,
    goTo: 'Go to',
    create: 'Create',
  },
  nl: {
    search: 'Zoeken',
    searchOne: (name: string) => `Zoek in ${name}`,
    searchTwo: (first: string, second: string) => `Zoek in ${first} en ${second}`,
    searchMore: (first: string, second: string) => `Zoek in ${first}, ${second} en meer`,
    goTo: 'Ga naar',
    create: 'Maken',
  },
})
