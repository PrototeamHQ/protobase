import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    table: 'Table',
    display: 'Display',
    sort: 'Sort',
    ascending: 'ascending',
    descending: 'descending',
    movedTo: (column: string) => `Moved to ${column}`,
    orderChanged: 'Order changed',
    stayedIn: (column: string) => `Saved, still in ${column}`,
    undo: 'Undo',
    couldNotUndo: 'Could not undo',
  },
  nl: {
    table: 'Tabel',
    display: 'Weergave',
    sort: 'Sorteren',
    ascending: 'oplopend',
    descending: 'aflopend',
    movedTo: (column: string) => `Verplaatst naar ${column}`,
    orderChanged: 'Volgorde gewijzigd',
    stayedIn: (column: string) => `Opgeslagen, nog in ${column}`,
    undo: 'Ongedaan maken',
    couldNotUndo: 'Kon niet ongedaan maken',
  },
})
