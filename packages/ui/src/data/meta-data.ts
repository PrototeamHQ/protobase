import type { MapLayerModel, PluginRef, ResourcePermissions, SourceRef } from '@protobase/client'
import type { PageModel } from '@protobase/layout'
import type { BottomBarModel, ResourceModel, SignInViewModel, UserMenuModel, ViewModel } from '@protobase/schema'
import type { Locale } from '@protobase/schema/internal'

export type MetaData = {
  etag: string
  /** The app's name, which ends the tab titles. */
  appName: string
  /** The Protobase version the server ran when this `/meta` was read. */
  protobaseVersion?: string
  /**
   * Set once the server runs another Protobase version than the page started with: `to` is that version, when the server
   * names one. The page keeps this `/meta` and stops reading it until it is reloaded (see `keepOnVersionChange`).
   */
  versionChange?: { to?: string }
  /** The path of the app's own icon, when the project has one, which the sidebar's logo draws. */
  appIcon?: string
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Composed pages by name. */
  pages: Record<string, PageModel>
  /** The signed-in user's account page, at `/-/account` (see `AccountPage`). */
  account?: PageModel
  permissions: Record<string, ResourcePermissions>
  userMenu?: UserMenuModel
  /** For a visitor, the resources they could use once signed in, by name, with what to tell them (see `SignInPrompt`). */
  signIn?: Record<string, SignInViewModel>
  /** The tabs of the user's bottom bar on phones, when one names their active role. */
  bottomBar?: Omit<BottomBarModel, 'roles'>
  /** The assistant backend, when the app has one and the user has the admin or ai role. */
  assistant?: { url: string }
  /** The runtime updates endpoint, when the app has one and the user has the admin role. */
  runtime?: { url: string }
  /** The error tracker the app sends its errors to, when the app reports them (see `startErrorReporting`). */
  errorReporting?: { dsn: string; environment?: string }
  /** The map style the app's maps are drawn with, and the layers they may switch to, when the app has one (see `MapSection`). */
  maps?: { style: string; layers?: MapLayerModel[] }
  /** Whether the top bar draws the notification bell: the app has notifications and their `ui` is not false (see `ShellBell`). */
  bell?: boolean
  /** Whether people set their own status and see those they share an organization with (see `useStatuses`). */
  status?: boolean
  /** The language the app's screens are in for everyone, when it sets one (see `AppLocale`). */
  locale?: Locale
  /** The hosts besides the app's own whose images are drawn with the page's referrer (see `FileImage`). */
  files?: { trustedHosts: string[] }
  /** The plugins the app loads for the user (see `PluginGate`). */
  plugins?: PluginRef[]
  /** The other APIs the app draws resources from for the user, and how far their `/meta` has loaded (see `withSources`). */
  sources?: SourceStatus[]
}

/**
 * A source of resources and its `/meta`: `ready` once its resources are among the app's, `error` when it could not be
 * read, the reason in `error`.
 */
export type SourceStatus = { source: SourceRef; state: 'loading' | 'ready' } | { source: SourceRef; state: 'error'; error: Error }

export const allowEverything: ResourcePermissions = { create: true, update: true, delete: true, conditional: [] }
