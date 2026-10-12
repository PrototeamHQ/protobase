import type { PluginRef, ResourcePermissions } from '@protobase/client'
import type { PageModel } from '@protobase/layout'
import type { BottomBarModel, ResourceModel, UserMenuModel, ViewModel } from '@protobase/schema'

export type MetaData = {
  etag: string
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Composed pages by name. */
  pages: Record<string, PageModel>
  permissions: Record<string, ResourcePermissions>
  userMenu?: UserMenuModel
  /** The tabs of the user's bottom bar on phones, when one names their active role. */
  bottomBar?: Omit<BottomBarModel, 'roles'>
  /** The assistant backend, when the app has one and the user has the admin or ai role. */
  assistant?: { url: string }
  /** The runtime updates endpoint, when the app has one and the user has the admin role. */
  runtime?: { url: string }
  /** The plugins the app loads for the user (see `PluginGate`). */
  plugins?: PluginRef[]
}

export const allowEverything: ResourcePermissions = { create: true, update: true, delete: true, conditional: [] }
