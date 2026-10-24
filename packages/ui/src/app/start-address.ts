import type { AppAddress } from '@protobase/schema'
import type { MetaData } from '../data/meta-data'
import { navFromMeta } from './nav-from-meta'

/**
 * Where the app opens at `/`: the first sidebar entry the caller sees that opens what it names; with none, the first
 * page, else the first resource's list.
 */
export const startAddress = (meta: MetaData): AppAddress | undefined => {
  const first = navFromMeta(meta)
    .flatMap((group) => group.items)
    .find((item) => !item.problem)
  if (first && meta.pages[first.id]) return { kind: 'page', page: first.id }
  if (first) {
    const [resource, list] = first.id.split('/') as [string, string | undefined]
    return { kind: 'list', resource, ...(list !== undefined && { list }) }
  }
  const firstPage = Object.keys(meta.pages)[0]
  if (firstPage) return { kind: 'page', page: firstPage }
  const firstResource = Object.keys(meta.resources)[0]
  return firstResource ? { kind: 'list', resource: firstResource } : undefined
}
