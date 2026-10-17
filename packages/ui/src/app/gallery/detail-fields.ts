import type { ResourceModel, ViewModel } from '@protobase/schema'
import { whenShown } from '../record-mode/record-mode'

/**
 * The fields of a photo's details: those its record page shows in its sections, or without a layout every field but its
 * key and tenant, less sensitive ones, those meant only for its form and those the gallery already shows: `omit`, such as the photo's file and the
 * field pointing at the gallery's record.
 */
export const detailFields = (model: ResourceModel, view: ViewModel | undefined, omit: readonly string[]) => {
  const sections = (view?.layout ?? []).flatMap((item) => (item.kind === 'section' && whenShown(item.when, false) ? item.fields : []))
  const names = sections.length > 0 ? [...new Set(sections)] : Object.keys(model.fields).filter((name) => name !== model.tenant && !model.primaryKey.includes(name))
  return names.filter((name) => model.fields[name] && !model.fields[name].sensitive && !omit.includes(name) && whenShown(view?.fields[name]?.when, false))
}
