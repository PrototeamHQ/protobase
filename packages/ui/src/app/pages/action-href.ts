import type { ActionModel } from '@protobase/schema'
import { fillAddress, fillText, hostPlaceholder, hrefField, recordValueAt, resourceField, valueText } from '@protobase/schema/internal'
import { actionApplies } from './action-when'

/** `href` with every `{{path}}` replaced by the record's value, percent-encoded; a missing value becomes empty. */
export const fillHref = (href: string, record: Record<string, unknown> = {}) => fillText(href, (path) => encodeURIComponent(valueText(recordValueAt(record, path))))

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
  return field === undefined ? fillHref(href, record) : webUrl(recordValueAt(record, field))
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
 * `action` as it shows for `record`: one whose `when` does not hold there is left out, or shown as it is when it
 * disables instead; an update that would change nothing there, a link whose `href` has no target there, and a link
 * whose resource the record names but `resources` (the caller's, from `/meta`) lacks, are left out, and `{{host}}` in a
 * link's label becomes the host its target opens, without `www.`.
 */
export const actionFor = (action: ActionModel, record: Record<string, unknown> | undefined, resources: Readonly<Record<string, unknown>> = {}): ActionModel | undefined => {
  if (!actionApplies(action, record)) return action.otherwise === 'disable' ? action : undefined
  const run = action.run
  if (run?.kind === 'update') return record && !action.inputs?.length && holdsAll(record, run.values as Record<string, unknown>) ? undefined : action
  if (run?.kind === 'link' && 'to' in run && resourceField(run.to) !== undefined) {
    const to = fillAddress(run.to, record)
    return to.kind !== 'page' && Object.hasOwn(resources, to.resource) ? action : undefined
  }
  if (run?.kind !== 'link' || !('href' in run)) return action
  const target = linkTarget(run.href, record)
  if (target === undefined) return undefined
  return action.label.includes(hostPlaceholder) ? { ...action, label: action.label.replaceAll(hostPlaceholder, hostOf(target)) } : action
}
