import type { AppAddress, ViewModel } from '@protobase/schema'

/**
 * The list of `resource` opened on exactly the records `filter` counted or showed: with no filter, an empty one when
 * the view's list opens on a default filter, so the link does not narrow what it counted; otherwise a clean path.
 */
export const filteredListAddress = (view: ViewModel | undefined, resource: string, filter: string | undefined): AppAddress => {
  if (filter) return { kind: 'list', resource, filter }
  if (view?.list?.filter) return { kind: 'list', resource, filter: '' }
  return { kind: 'list', resource }
}
