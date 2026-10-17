import type { ActionModel } from '@protobase/schema'
import { hrefField } from '@protobase/schema/internal'

/** `href` with every `{field}` replaced by the record's value, percent-encoded; a missing value becomes empty. */
export const fillHref = (href: string, record: Record<string, unknown> = {}) =>
  href.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => encodeURIComponent(record[name] === null || record[name] === undefined ? '' : String(record[name])))

const webUrl = (value: unknown) => {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined
  const url = new URL(value)
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
}

/**
 * Where a link action's `href` goes from `record`: an href that is only `{field}` is the record's value as it is, when
 * that is an `https:` or `http:` URL, and nothing otherwise; any other href is filled by `fillHref`.
 */
export const linkTarget = (href: string, record: Record<string, unknown> = {}) => {
  const field = hrefField(href)
  return field === undefined ? fillHref(href, record) : webUrl(record[field])
}

/**
 * Opens a link's target: an `https:` or `http:` page in a new tab that gets neither the app's window nor its address,
 * anything else (`mailto:`) in place. A link without a target does nothing.
 */
export const openLink = (target: string | undefined) => {
  if (target === undefined) return
  if (/^https?:/i.test(target)) window.open(target, '_blank', 'noopener,noreferrer')
  else window.location.assign(target)
}

const hostOf = (target: string) => (URL.canParse(target) ? new URL(target).hostname.replace(/^www\./, '') : '')

// An update sets values the record may hold already, as `paid: true` on a paid order.
const holdsAll = (record: Record<string, unknown>, values: Record<string, unknown>) => Object.entries(values).every(([name, value]) => Object.is(record[name], value))

/**
 * `action` as it shows for `record`: an update that would change nothing there, and a link whose `href` has no target
 * there, are left out, and `{host}` in a link's label becomes the host its target opens, without `www.`.
 */
export const actionFor = (action: ActionModel, record: Record<string, unknown> | undefined): ActionModel | undefined => {
  const run = action.run
  if (run?.kind === 'update') return record && holdsAll(record, run.values as Record<string, unknown>) ? undefined : action
  if (run?.kind !== 'link' || !('href' in run)) return action
  const target = linkTarget(run.href, record)
  if (target === undefined) return undefined
  return action.label.includes('{host}') ? { ...action, label: action.label.replaceAll('{host}', hostOf(target)) } : action
}
