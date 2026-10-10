import { prunePage, type PageModel } from '@protobase/layout'
import { pickView, type ResourceModel, type UserMenuItemModel, type UserMenuModel, type ViewModel } from '@protobase/schema'
import { seesAssistant } from './assistant/assistant-settings'
import type { Deps } from './deps'
import { sha256Hex, stableJson } from './hash'
import { requestAccess } from './request-access'
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
  /** The assistant backend, for a caller with the `admin` or `ai` role when there is one: an absolute URL, or the built-in one's path. */
  assistant?: { url: string }
}

const modelsHash = (deps: Deps) => sha256Hex(stableJson(deps.registry.entries.map((entry) => entry.model))).then((hash) => hash.slice(0, 32))

/**
 * `/meta` as one caller sees it: the resources they can do anything with, each as the restricted model (hidden fields
 * absent, `readOnly` unless writable), the view for their roles with hidden fields pruned, what they may do, and the
 * user menu without the resources they cannot see.
 * The ETag hashes all of it, so it differs per user and per roles.
 */
export const createMeta = (deps: Deps) => {
  const base = modelsHash(deps)

  const forCaller = async (session: Session) => {
    const accesses = await Promise.all(deps.registry.entries.map((entry) => requestAccess(deps, entry, session)))
    const visible = accesses.filter((access) => Object.values(access.resolved.operations).some(Boolean))
    // Sensitive fields are in the models and views, so the record page can offer to reveal them, but nowhere data is listed
    const listed = Object.fromEntries(visible.map((access) => [access.entry.name, access.model]))
    const views = visible.flatMap((access) => {
      const view = pickView(deps.views, session.user.roles, access.entry.name)
      return view ? [pruneView(view, access.readable, listed)] : []
    })
    const callerAccess = {
      models: listed,
      permissions: Object.fromEntries(visible.map(({ entry, resolved }) => [entry.name, { create: resolved.operations.create, update: resolved.operations.update }])),
      actions: (resource: string) => new Set(views.find((view) => view.resource === resource)?.actions.map((action) => action.name) ?? []),
    }
    const pages = deps.pages.flatMap((page) => prunePage(page, session.user.roles, callerAccess) ?? [])
    const shown = (item: UserMenuItemModel) =>
      item.kind === 'link' || (item.kind === 'resource' ? visible.some((access) => access.entry.name === item.resource) : pages.some((page) => page.name === item.page))
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
      ...(deps.userMenu && { userMenu: { items: deps.userMenu.items.filter(shown) } }),
      ...(deps.assistant && seesAssistant(session.user.roles) && { assistant: { url: deps.assistant } }),
    }
    return { body, etag: `"${(await sha256Hex(stableJson(body))).slice(0, 32)}"` }
  }

  /** The X-Meta-Version header: the models, and the roles the access depends on, so a role change moves it. */
  const version = async (roles: readonly string[]) => (await sha256Hex(`${await base}|${[...roles].sort().join(',')}`)).slice(0, 32)

  return { forCaller, version }
}

export type Meta = ReturnType<typeof createMeta>
