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
    noRule: 'No drop rule is registered as {}. Give it in dropRules in protobase.ui.tsx, or load the plugin that provides it.',
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
    noRule: 'Er is geen sleepregel geregistreerd als {}. Geef die in dropRules in protobase.ui.tsx, of laad de plug-in die haar levert.',
  },
})
