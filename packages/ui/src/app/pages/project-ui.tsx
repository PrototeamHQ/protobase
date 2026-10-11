import { createContext, useContext, type ComponentType } from 'react'
import type { Client } from '@protobase/client'
import type { AppAddress } from '@protobase/schema'

/** What a named action's handler gets: the record it runs on (inside a RecordCard or CardRow), the API, and a way to move. */
export type ActionContext = {
  resource: string
  record?: Record<string, unknown>
  /** The record's key as the URL carries it. */
  recordKey?: string
  etag?: string
  client: Client
  /** Moves the app to an address, such as `{ kind: 'record', resource: 'orders', key: 42 }`. */
  navigate: (to: AppAddress) => void
}

export type ActionHandler = (context: ActionContext) => void | Promise<void>

/**
 * The project's own React code for composed pages: custom components by the name their layout declares
 * (`component('UsageChart')`) or a widget part names, handlers for named actions that have no built-in behaviour, and
 * the shell's slots. `extends` lists UI configs merged in before it (see `mergeUi`), or whole `protobase.ui.tsx` modules
 * (`import * as tasksUi from '...'`), their exported components included; `name` names it in their errors.
 */
export type ProjectUi = {
  name?: string
  extends?: Array<ProjectUi | UiModule>
  components?: Record<string, ComponentType<any>>
  actions?: Record<string, ActionHandler>
  /** Rendered in the shell on every page: `actions` at the end of the top bar, `rightPanel` beside the page. */
  shell?: { actions?: ComponentType; rightPanel?: ComponentType }
}

/** A `protobase.ui.tsx` module as `import * as` gives it: components exported by name, the rest as the default export. */
export type UiModule = { readonly default?: ProjectUi; readonly [name: string]: unknown }

/** Typed identity, for `export default defineUi({ extends, components, actions })` in `protobase.ui.tsx`. */
export const defineUi = (ui: ProjectUi) => ui

/** The project's UI, merged with the UI configs it extends; `ProjectUiProvider` provides it. */
export const ProjectUiContext = createContext<ProjectUi>({})

export const useProjectUi = () => useContext(ProjectUiContext)
