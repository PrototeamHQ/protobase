import type { ComponentType } from 'react'
import type { ProjectUi } from './project-ui'

const componentName = /^[A-Z][A-Za-z0-9]*$/

// A function component, or one React wraps in an object (`memo`, `forwardRef`, `lazy`).
const isComponent = (value: unknown) => typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in value)

/**
 * The UI config of a `protobase.ui.tsx` module: its default export (`defineUi`, for action handlers, shell slots and
 * the configs it extends), and every component it exports under a PascalCase name as the component of that name. A
 * name both exported and in `components` must be the same component.
 */
export const uiFromModule = (module: Record<string, unknown>): ProjectUi => {
  const ui = (module.default ?? {}) as ProjectUi
  const named = Object.entries(module).filter((entry): entry is [string, ComponentType<any>] => entry[0] !== 'default' && componentName.test(entry[0]) && isComponent(entry[1]))
  if (named.length === 0) return ui
  for (const [name, component] of named) {
    if (ui.components && Object.hasOwn(ui.components, name) && ui.components[name] !== component) {
      throw new Error(`The component "${name}" is exported by name and given in components as another one; keep the export`)
    }
  }
  return { ...ui, components: { ...ui.components, ...Object.fromEntries(named) } }
}
