import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    notSet: 'Not set',
    yes: 'Yes',
    no: 'No',
    nothingYet: 'Nothing to chart yet.',
    couldNotLoad: 'Could not load the chart.',
    weekOf: (day: string) => `Week of ${day}`,
    other: 'Other',
    records: (count: string) => `${count} records`,
  },
  nl: {
    notSet: 'Niet ingevuld',
    yes: 'Ja',
    no: 'Nee',
    nothingYet: 'Nog niets om in een grafiek te zetten.',
    couldNotLoad: 'Kon de grafiek niet laden.',
    weekOf: (day: string) => `Week van ${day}`,
    other: 'Overig',
    records: (count: string) => `${count} records`,
  },
})
