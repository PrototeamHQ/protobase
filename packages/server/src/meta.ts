import { prunePage, type PageModel } from '@protobase/layout'
import { pickView, type BottomBarItemModel, type ResourceModel, type SignInViewModel, type UserMenuItemModel, type UserMenuModel, type ViewModel } from '@protobase/schema'
import { bottomBarFor } from '@protobase/schema/internal'
import { activeRole } from './active-role'
import { seesAssistant } from './assistant/assistant-settings'
import type { Deps } from './deps'
import type { ErrorReportingSettings } from './error-reporting/error-reporting-settings'
import { sha256Hex, stableJson } from './hash'
import { pluginsFor, type PluginRef } from './plugins/plugin-settings'
import { requestAccess } from './request-access'
import { seesRuntime } from './runtime/runtime-settings'
import { sourcesFor, type SourceRef } from './sources/source-settings'
import type { Session } from './types'
import { pruneView } from './view-access'

export type ResourcePermissions = {
  read: boolean
  create: boolean
  update: boolean
  delete: boolean
  /** Operations allowed only for some records: a row filter (`.own`) or a record-level rule decides. */
  conditional: Array<'create' | 'update' | 'delete'>
}

export type CallerMeta = {
  resources: ResourceModel[]
  views: ViewModel[]
  /** The composed pages the caller may open, without the elements that name what they cannot see or do. */
  pages: PageModel[]
  permissions: Record<string, ResourcePermissions>
  /** The user menu with the resources the caller cannot see left out. */
  userMenu?: UserMenuModel
  /** For a visitor who is not signed in, the resources they cannot see whose view tells them what signing in gives. */
  signIn?: SignInViewModel[]
  /** The bottom bar naming the caller's active role, without the resources and pages they cannot see. */
  bottomBar?: { label: string; items: BottomBarItemModel[] }
  /** The assistant backend, for a caller with the `admin` or `ai` role when there is one: an absolute URL, or the built-in one's path. */
  assistant?: { url: string }
  /** The runtime updates endpoint, for a caller with the `admin` role when the app has one. */
  runtime?: { url: string }
  /** Where the admin app sends its errors, when the app reports them: the DSN is public, as in any browser app. */
  errorReporting?: ErrorReportingSettings
  /** The map style the admin app draws the record page's maps with, when the app has one: public, as the tiles are. */
  maps?: { style: string }
  /** The hosts besides the app's own whose images the admin app draws with the page's referrer, when there are any. */
  files?: { trustedHosts: string[] }
  /** The plugins the admin app loads for the caller: those for everyone, and those for one of their roles. */
  plugins?: PluginRef[]
  /** The other APIs whose resources the admin app draws for the caller: those for everyone, and those for one of their roles. */
  sources?: SourceRef[]
}

// What a visitor is told about a resource: what its view calls it, where it sits in the sidebar without its recent
// records, and its prompt.
const signInView = (view: ViewModel | undefined): SignInViewModel[] => {
  if (!view?.signIn) return []
  const { recent: _recent, ...nav } = view.nav ?? {}
  return [{ resource: view.resource, ...(view.names && { names: view.names }), ...(view.nav && { nav }), signIn: view.signIn }]
}

const modelsHash = (deps: Deps) => sha256Hex(stableJson(deps.registry.entries.map((entry) => entry.model))).then((hash) => hash.slice(0, 32))

/**
 * `/meta` as one caller sees it: the resources they can do anything with, each as the restricted model (hidden fields
 * absent, `readOnly` unless writable), the view for their roles with hidden fields pruned, what they may do, and the
 * user menu and their bottom bar without the resources they cannot see. A visitor also gets the prompts of the resources
 * they could use once signed in, which keep their place in the bottom bar and the user menu.
 * The ETag hashes all of it, so it differs per user and per roles.
 */
export const createMeta = (deps: Deps) => {
  const base = modelsHash(deps)

  const forCaller = async (session: Session) => {
    const accesses = await Promise.all(deps.registry.entries.map((entry) => requestAccess(deps, entry, session)))
    const visible = accesses.filter((access) => Object.values(access.resolved.operations).some(Boolean))
    // Sensitive fields are in the models and views, so the record page can offer to reveal them, but nowhere data is listed
    const listed = Object.fromEntries(visible.map((access) => [access.entry.name, access.model]))
    // A visitor is told what signing in gives about the resources they cannot see whose view says (`.signIn(...)`)
    const signIn = session.anonymous ? accesses.filter((access) => !visible.includes(access)).flatMap((access) => signInView(pickView(deps.views, session.user.roles, access.entry.name))) : []
    const prompted = new Set(signIn.map((entry) => entry.resource))
    const views = visible.flatMap((access) => {
      const view = pickView(deps.views, session.user.roles, access.entry.name)
      return view ? [pruneView(view, access.readable, listed, prompted)] : []
    })
    const callerAccess = {
      models: listed,
      permissions: Object.fromEntries(visible.map(({ entry, resolved }) => [entry.name, { create: resolved.operations.create, update: resolved.operations.update }])),
      actions: (resource: string) => new Set(views.find((view) => view.resource === resource)?.actions.map((action) => action.name) ?? []),
    }
    const pages = deps.pages.flatMap((page) => prunePage(page, session.user.roles, callerAccess) ?? [])
    const shown = (item: UserMenuItemModel | BottomBarItemModel) =>
      item.kind === 'link' || (item.kind === 'resource' ? visible.some((access) => access.entry.name === item.resource) || prompted.has(item.resource) : pages.some((page) => page.name === item.page))
    const bar = bottomBarFor(deps.bottomBars, activeRole(session))
    const barItems = bar?.items.filter(shown) ?? []
    const plugins = pluginsFor(deps.plugins, session.user.roles)
    const sources = sourcesFor(deps.sources, session.user.roles)
    const body: CallerMeta = {
      resources: visible.map((access) => access.readable),
      views,
      pages,
      permissions: Object.fromEntries(visible.map(({ entry, resolved }) => [entry.name, {
        read: resolved.operations.read || resolved.operations.list,
        create: resolved.operations.create,
        update: resolved.operations.update,
        delete: resolved.operations.delete,
        conditional: (['create', 'update', 'delete'] as const).filter((op) => resolved.operations[op] && (resolved.recordChecks.includes(op) || resolved.rowFilter[op] !== undefined)),
      } satisfies ResourcePermissions])),
      ...(signIn.length > 0 && { signIn }),
      ...(deps.userMenu && { userMenu: { items: deps.userMenu.items.filter(shown) } }),
      ...(bar && barItems.length > 0 && { bottomBar: { label: bar.label, items: barItems } }),
      ...(deps.assistant && seesAssistant(session.user.roles) && { assistant: { url: deps.assistant } }),
      ...(deps.runtime && seesRuntime(session.user.roles) && { runtime: { url: deps.runtime } }),
      ...(deps.errorReporting && { errorReporting: deps.errorReporting }),
      ...(deps.mapStyle && { maps: { style: deps.mapStyle } }),
      ...(deps.files && deps.files.trustedHosts.length > 0 && { files: { trustedHosts: deps.files.trustedHosts } }),
      ...(plugins.length > 0 && { plugins }),
      ...(sources.length > 0 && { sources }),
    }
    return { body, etag: `"${(await sha256Hex(stableJson(body))).slice(0, 32)}"` }
  }

  /** The X-Meta-Version header: the models, and the roles the access depends on, so a role change moves it. */
  const version = async (roles: readonly string[]) => (await sha256Hex(`${await base}|${[...roles].sort().join(',')}`)).slice(0, 32)

  return { forCaller, version }
}

export type Meta = ReturnType<typeof createMeta>
