import { defineMessages } from '../locale/messages'

// Texts the app's pages share: the notices of an address that leads nowhere, and an error without words of its own
export const text = defineMessages({
  en: {
    notFound: 'Not found',
    noResource: (name: string) => `There is no resource called ${name}.`,
    somethingWentWrong: 'Something went wrong',
  },
  nl: {
    notFound: 'Niet gevonden',
    noResource: (name: string) => `Er is geen onderdeel met de naam ${name}.`,
    somethingWentWrong: 'Er ging iets mis',
  },
})
