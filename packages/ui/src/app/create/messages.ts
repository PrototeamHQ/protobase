import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    title: (noun: string) => `New ${noun.toLowerCase()}`,
    subject: (noun: string) => `New ${noun.toLowerCase()}`,
    submit: (noun: string) => `Create ${noun.toLowerCase()}`,
    notCreated: 'Not created',
    notSaved: 'Not saved',
    cancel: 'Cancel',
    setByDatabase: 'Set by the database',
    details: 'Details',
    otherFields: 'Other fields',
    notAllowed: 'Not allowed',
    cannotCreate: (plural: string) => `You cannot create ${plural}.`,
  },
  nl: {
    title: (noun: string) => `${noun} toevoegen`,
    subject: (noun: string) => noun,
    submit: (noun: string) => `${noun} aanmaken`,
    notCreated: 'Niet aangemaakt',
    notSaved: 'Niet bewaard',
    cancel: 'Annuleren',
    setByDatabase: 'Ingevuld door de database',
    details: 'Details',
    otherFields: 'Overige velden',
    notAllowed: 'Niet toegestaan',
    cannotCreate: (plural: string) => `Je mag geen ${plural} aanmaken.`,
  },
})
