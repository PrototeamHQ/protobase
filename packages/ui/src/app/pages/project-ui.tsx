import { createContext, useContext, type ComponentType } from 'react'
import type { Client } from '@protobase/client'

/** What a named action's handler gets: the record it runs on (inside a RecordCard or CardRow), the API and the router. */
export type ActionContext = {
  resource: string
  record?: Record<string, unknown>
  /** The record's key as the URL carries it. */
  recordKey?: string
  etag?: string
  client: Client
  navigate: (to: string) => void
}

export type ActionHandler = (context: ActionContext) => void | Promise<void>

/**
 * The project's own React code for composed pages: custom components by the name their layout declares
 * (`component('UsageChart')`) or a widget part names, handlers for named actions that have no built-in behaviour, and
 * the shell's slots. `extends` lists UI configs merged in before it (see `mergeUi`); `name` names it in their errors.
 */
export type ProjectUi = {
  name?: string
  extends?: ProjectUi[]
  components?: Record<string, ComponentType<any>>
  actions?: Record<string, ActionHandler>
  /** Rendered in the shell on every page: `actions` at the end of the top bar, `rightPanel` beside the page. */
  shell?: { actions?: ComponentType; rightPanel?: ComponentType }
}

/** Typed identity, for `export default defineUi({ extends, components, actions })` in `protobase.ui.tsx`. */
export const defineUi = (ui: ProjectUi) => ui

/** The project's UI, merged with the UI configs it extends; `ProjectUiProvider` provides it. */
export const ProjectUiContext = createContext<ProjectUi>({})

export const useProjectUi = () => useContext(ProjectUiContext)
