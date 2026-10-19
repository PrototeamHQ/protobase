import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    done: 'Done',
    reorder: 'Reorder',
    couldNotLoad: 'Could not load',
    nothingYet: 'Nothing here yet.',
    couldNotChange: 'Could not change the order',
    orderChanged: 'Order changed',
    undo: 'Undo',
    couldNotUndo: 'Could not undo',
    movedToPlace: (place: number) => `Moved to place ${place}`,
    notMoved: 'Left in its place',
  },
  nl: {
    done: 'Klaar',
    reorder: 'Volgorde wijzigen',
    couldNotLoad: 'Kon niet laden',
    nothingYet: 'Hier staat nog niets.',
    couldNotChange: 'Kon de volgorde niet wijzigen',
    orderChanged: 'Volgorde gewijzigd',
    undo: 'Ongedaan maken',
    couldNotUndo: 'Kon niet ongedaan maken',
    movedToPlace: (place: number) => `Verplaatst naar plaats ${place}`,
    notMoved: 'Op zijn plaats gelaten',
  },
})
