import type { ComponentType, ReactNode } from 'react'
import type { BeforeSignInProps, ProjectUi, UiModule } from './project-ui'
import { uiFromModule } from './ui-from-module'

type Named = { ui: ProjectUi; label: string }

/** Two UI configs define one component or action handler differently. */
export class UiConflictError extends Error {
  override name = 'UiConflictError'
}

// A module has a default export or components exported by name; a UI config has neither.
const configOf = (parent: ProjectUi | UiModule): ProjectUi => (Object.keys(parent).some((key) => key === 'default' || /^[A-Z]/.test(key)) ? uiFromModule(parent) : (parent as ProjectUi))

// Every UI config in merge order, each after the ones it extends, with the label errors name it by.
const flatten = (ui: ProjectUi, label: string): Named[] => [
  ...(ui.extends ?? []).map(configOf).flatMap((parent, index) => flatten(parent, parent.name ?? `${label} extends[${index}]`)),
  { ui, label },
]

// One registry from every config's, refusing a name two configs give different values.
const union = <T,>(kind: string, named: Named[], pick: (ui: ProjectUi) => Record<string, T> | undefined) => {
  const merged: Record<string, T> = {}
  const owners = new Map<string, string>()
  for (const { ui, label } of named) {
    for (const [name, value] of Object.entries(pick(ui) ?? {})) {
      if (Object.hasOwn(merged, name) && merged[name] !== value) throw new UiConflictError(`${kind} "${name}" is defined twice, by ${owners.get(name)} and by ${label}; rename one of them`)
      merged[name] = value
      owners.set(name, owners.get(name) ?? label)
    }
  }
  return merged
}

// One slot component drawing every config's, in merge order.
const slot = (slots: ComponentType[]): ComponentType | undefined => {
  if (slots.length <= 1) return slots[0]
  const All = () => slots.map((Slot, index) => <Slot key={index} />)
  return All
}

// One component drawing every config's around the pages someone signed out sees, the first outermost.
const around = (wrappers: ComponentType<BeforeSignInProps>[]): ComponentType<BeforeSignInProps> | undefined => {
  if (wrappers.length <= 1) return wrappers[0]
  const All = ({ children, ...given }: BeforeSignInProps) => wrappers.reduceRight<ReactNode>((inner, Wrapper) => <Wrapper {...given}>{inner}</Wrapper>, children)
  return All
}

/**
 * One UI config from several, each after the ones it `extends`, the last being the app's own: components, action
 * handlers and field types are all kept, and one name defined by two configs is an error naming both; every shell slot
 * and `beforeSignIn` component is drawn, the extended configs' first.
 */
export const mergeUi = (...uis: ProjectUi[]): ProjectUi => {
  const named = uis.flatMap((ui, index) => flatten(ui, ui.name ?? `UI config ${index + 1}`))
  const components = union('The component', named, (ui) => ui.components)
  const actions = union('The action handler', named, (ui) => ui.actions)
  const fields = union('The field type', named, (ui) => ui.fields)
  const actionSlot = slot(named.flatMap(({ ui }) => (ui.shell?.actions ? [ui.shell.actions] : [])))
  const rightPanel = slot(named.flatMap(({ ui }) => (ui.shell?.rightPanel ? [ui.shell.rightPanel] : [])))
  const beforeSignIn = around(named.flatMap(({ ui }) => (ui.beforeSignIn ? [ui.beforeSignIn] : [])))
  const name = uis.at(-1)?.name
  return {
    ...(name && { name }),
    components,
    actions,
    ...(Object.keys(fields).length > 0 && { fields }),
    ...((actionSlot || rightPanel) && { shell: { ...(actionSlot && { actions: actionSlot }), ...(rightPanel && { rightPanel }) } }),
    ...(beforeSignIn && { beforeSignIn }),
  }
}
