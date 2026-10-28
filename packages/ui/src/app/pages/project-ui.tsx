import { createContext, useContext, type ComponentType, type ReactNode } from 'react'
import type { Client } from '@protobase/client'
import type { AppAddress } from '@protobase/schema'
import type { ShellLogoProps } from '../../app-shell/logo'
import type { FieldWidget } from '../field-types/field-widget'
import type { BoardDrop } from '../displays/board-drop'
import type { DropRule } from '../hand-order/drop-rule'
import type { TitleRule } from '../titles/title-rule'

/**
 * What a named action's handler gets: the record it runs on (inside a RecordCard or CardRow), the API, and a way to move.
 * `client` is the client of the API that serves the resource: the app's own, or the source's for a resource drawn from
 * another API, whose functions `invoke` then calls.
 */
export type ActionContext = {
  resource: string
  record?: Record<string, unknown>
  /** The record's key as the URL carries it. */
  recordKey?: string
  etag?: string
  client: Client
  /** Moves the app to an address, such as `{ kind: 'record', resource: 'orders', key: 42 }`. */
  navigate: (to: AppAddress) => void
  /**
   * The answers to the action's inputs, by input name, for an action with `inputs`: those that show, null when left
   * empty. Throwing `ActionInputError` refuses them, each message under its input.
   */
  values?: Record<string, unknown>
}

export type ActionHandler = (context: ActionContext) => void | Promise<void>

/** What a plugin's `beforeSignIn` component gets from the app, drawn around the pages someone signed out sees. */
export type BeforeSignInProps = {
  /** What the app shows someone signed out: the sign-in page, or the app a visitor browses. */
  children: ReactNode
  /**
   * Enters the app with a session something other than the sign-in page started, such as an endpoint that traded a
   * one-time code for the session cookie: reads the session again and shows the app signed in. Resolves `false`, and
   * changes nothing, when there is no session.
   */
  signedIn: () => Promise<boolean>
  /** The query parameters of the page's address, such as a one-time code a link carries. */
  params: URLSearchParams
  /** Takes these query parameters, such as a used one-time code, out of the address, in place of it in the tab's history. */
  removeParams: (names: string[]) => void
}

/**
 * The project's own React code for composed pages: custom components by the name their layout declares
 * (`component('UsageChart')`) or a widget part names, handlers for named actions that have no built-in behaviour,
 * field types by the name a view's `.widget(name)` chooses, drop rules by the name a list's `drag.rule` gives, board
 * drops by the name a list's `drag.board` gives, title rules by the name a view's `.titleFrom` gives, and the shell's slots. `extends` lists UI configs merged in before it (see `mergeUi`), or whole `protobase.ui.tsx` modules
 * (`import * as tasksUi from '...'`), their exported components included; `name` names it in their errors.
 */
export type ProjectUi = {
  name?: string
  extends?: Array<ProjectUi | UiModule>
  components?: Record<string, ComponentType<any>>
  actions?: Record<string, ActionHandler>
  /** Field types by name, each with the storage types it shows and its components (see `FieldWidget`). */
  fields?: Record<string, FieldWidget>
  /** Where re-ranked records may land, by the name a view's `drag.rule` gives (see `DropRule`). */
  dropRules?: Record<string, DropRule>
  /** Which columns of a board take a card and what a drop there writes, by the name a view's `drag.board` gives (see `BoardDrop`). */
  boardDrops?: Record<string, BoardDrop>
  /** A record's title for the person reading it, by the name a view's `.titleFrom` gives (see `TitleRule`). */
  titles?: Record<string, TitleRule>
  /**
   * Rendered in the shell on every page: `actions` at the end of the top bar, `rightPanel` beside the page, `logo`
   * at the top of the sidebar in place of Protobase's (see `ShellLogoProps`), and `bell` in the top bar in place of the
   * notification bell, where that would be: with notifications on and their `ui` not false, for someone signed in as
   * themselves.
   */
  shell?: { actions?: ComponentType; rightPanel?: ComponentType; logo?: ComponentType<ShellLogoProps>; bell?: ComponentType }
  /**
   * Drawn around the pages someone signed out sees, only for a plugin the app loads before sign-in (`beforeSignIn` in
   * `options.plugins`): its code runs for them, and it can sign them in (see `BeforeSignInProps`).
   */
  beforeSignIn?: ComponentType<BeforeSignInProps>
}

/** A `protobase.ui.tsx` module as `import * as` gives it: components exported by name, the rest as the default export. */
export type UiModule = { readonly default?: ProjectUi; readonly [name: string]: unknown }

/** Typed identity, for `export default defineUi({ extends, components, actions })` in `protobase.ui.tsx`. */
export const defineUi = (ui: ProjectUi) => ui

/**
 * Typed identity, for `export default definePlugin({ name, components, actions, fields, shell, beforeSignIn })` in a
 * plugin's `protobase.ui.tsx`: a plugin is a UI config the app loads at runtime, its components exported by name as in
 * a project's. A project's own protobase.ui.tsx is one too, which `protobase build` builds as the plugin `app`.
 */
export const definePlugin = (plugin: ProjectUi) => plugin

/** The project's UI, merged with the UI configs it extends and the plugins loaded; `PluginGate` or `ProjectUiProvider` provides it. */
export const ProjectUiContext = createContext<ProjectUi>({})

export const useProjectUi = () => useContext(ProjectUiContext)
