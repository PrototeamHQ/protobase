import type { MapLayerModel, PluginRef, ResourcePermissions, SourceRef } from '@protobase/client'
import type { PageModel } from '@protobase/layout'
import type { BottomBarModel, ResourceModel, SignInViewModel, UserMenuModel, ViewModel } from '@protobase/schema'

export type MetaData = {
  etag: string
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Composed pages by name. */
  pages: Record<string, PageModel>
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
