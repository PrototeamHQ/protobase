import { maxBottomBarItems } from './bottom-bar'
import type { BottomBarItemModel, BottomBarModel } from './model'

/** What the bottom bars may name. Without `roles` (an app whose roles are not declared) any role is accepted. */
export type BottomBarNames = {
  /** The app's resources. */
  resources: readonly string[]
  /** The app's composed pages. */
  pages: readonly string[]
  /** The app's roles, when it declares them. */
  roles?: readonly string[]
}

const itemErrors = (item: BottomBarItemModel, names: BottomBarNames) => {
  if (item.kind === 'resource' && !names.resources.includes(item.resource)) return [`resource "${item.resource}" does not exist`]
  if (item.kind === 'page' && !names.pages.includes(item.page)) return [`page "${item.page}" does not exist`]
  return []
}

const barErrors = (bar: BottomBarModel, names: BottomBarNames) => {
  const unknownRoles = names.roles ? bar.roles.filter((role) => !names.roles!.includes(role)) : []
  return [
    ...(bar.roles.length === 0 ? ['needs at least one role'] : []),
    ...unknownRoles.map((role) => `role "${role}" is not one of the roles: ${names.roles!.join(', ')}`),
    ...(bar.items.length === 0 ? ['needs at least one item'] : []),
    ...(bar.items.length > maxBottomBarItems ? [`has ${bar.items.length} items; at most ${maxBottomBarItems} fit beside "More"`] : []),
    ...bar.items.flatMap((item) => itemErrors(item, names)),
  ].map((error) => `Bottom bar "${bar.label}": ${error}`)
}

// A role in two bars would leave its holders' bar to chance; two bars with one label could not be told apart.
const overlapErrors = (bars: BottomBarModel[]) =>
  bars.flatMap((bar, index) => {
    const earlier = bars.slice(0, index)
    const sameLabel = earlier.some((other) => other.label === bar.label) ? [`Two bottom bars are labelled "${bar.label}"; give each its own label`] : []
    const shared = bar.roles.flatMap((role) => {
      const other = earlier.find((candidate) => candidate.roles.includes(role))
      return other ? [`Bottom bars "${other.label}" and "${bar.label}" both name role "${role}"; a role belongs to one bottom bar`] : []
    })
    return [...sameLabel, ...shared]
  })

/**
 * Why the bottom bars do not fit the app, as messages; empty when they do. Pure, so it can run wherever the config is
 * known: at startup today, when a bundle is built later.
 */
export const bottomBarErrors = (bars: BottomBarModel[], names: BottomBarNames) => [...bars.flatMap((bar) => barErrors(bar, names)), ...overlapErrors(bars)]
