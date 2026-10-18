import type { ResourceModel, ViewModel } from '@protobase/schema'
import { guarded } from '../../lib/guarded'
import { changedList, listDefaults } from '../current-address'
import { defaultDisplay, displayChoices } from '../displays/list-displays'

const prefix = 'protobase:embedded-display:'

/** Where a viewer's pick of display is kept for one embedded list, named by the place it is shown. */
export const embeddedDisplayKey = (place: string) => `${prefix}${place}`

export const readPickedDisplay = (storage: Pick<Storage, 'getItem'>, key: string) => guarded(() => storage.getItem(key) ?? undefined, undefined)

export const writePickedDisplay = (storage: Pick<Storage, 'setItem'>, key: string, display: string) => guarded(() => storage.setItem(key, display), undefined)

/**
 * The display an embedded list shows: the viewer's pick while the view still has it, else what the list opens in for
 * the screen, with the display the page names in place of the view's default (below `sm`, a cards display when the
 * view has one).
 */
export const embeddedDisplay = (view: ViewModel | undefined, xs: boolean, { picked, preferred }: { picked?: string; preferred?: string }) => {
  const names = displayChoices(view).map((choice) => choice.name)
  if (picked !== undefined && names.includes(picked)) return picked
  return defaultDisplay(view, xs, preferred !== undefined && names.includes(preferred) ? preferred : undefined)
}

/**
 * The resource's list with the embedded list's filter, order and display, leaving out what the list does by default (an
 * embedded list's own default display among it, so a phone opens the list in its rows rather than the table), and
 * the saved search whose results it shows, if any. `resource` names another list of the same records, such as the
 * favorites that list a user's saved listings.
 */
export const viewAllAddress = (
  model: ResourceModel,
  view: ViewModel | undefined,
  xs: boolean,
  { resource = model.name, ...list }: { filter: string; orderBy: string; display: string; savedSearch?: string; resource?: string },
) => changedList({ kind: 'list', resource }, list, { ...listDefaults(model, view, xs), display: defaultDisplay(view, xs) })
