import { appPath } from '@protobase/schema'
import type { SearchResultGroup } from '../../app-shell'
import { allowEverything, type MetaData } from '../../data/meta-data'
import { humanize } from '../../live/naming'
import { createOffered } from '../create/create-offered'
import { navFromMeta } from '../nav-from-meta'

/** At most this many pages and lists, and this many "New ..." entries, match one text. */
export const navigationHitsPerGroup = 5

const matches = (label: string, text: string) => label.toLowerCase().includes(text.trim().toLowerCase())

/**
 * The search's own results, before the records: the sidebar's pages and lists whose names hold the text ("stock" finds
 * Stock levels), and "New ..." for each resource the user may create whose name does ("new order" or "order" finds New
 * order). Each is a link, as the sidebar's entries are.
 */
export const navigationHits = (meta: MetaData, text: string, basePath = ''): SearchResultGroup[] => {
  const entries = navFromMeta(meta, basePath).flatMap((group) => group.items.filter((item): item is typeof item & { href: string } => item.href !== undefined && !item.problem))
  const pages = entries.filter((item) => matches(item.label, text)).slice(0, navigationHitsPerGroup)
  const asked = text.trim().replace(/^new\s+/i, '')
  const creates = Object.values(meta.resources).flatMap((model) => {
    const view = meta.views[model.name]
    if (!view || view.nav?.hidden || !createOffered(view, meta.pages, meta.permissions[model.name] ?? allowEverything)) return []
    const singular = view.names?.singular ?? humanize(model.name)
    const label = `New ${singular.toLowerCase()}`
    if (!matches(label, text) && !matches(singular, asked) && !matches(view.names?.plural ?? humanize(model.name), asked)) return []
    return [{ id: `new:${model.name}`, title: label, href: appPath({ kind: 'create', resource: model.name }, basePath) }]
  })
  return [
    ...(pages.length > 0 ? [{ id: 'go-to', label: 'Go to', hits: pages.map((item) => ({ id: `go-to:${item.id}`, title: item.label, href: item.href })) }] : []),
    ...(creates.length > 0 ? [{ id: 'create', label: 'Create', hits: creates.slice(0, navigationHitsPerGroup) }] : []),
  ]
}
