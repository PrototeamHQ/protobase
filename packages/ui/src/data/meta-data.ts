import type { ResourcePermissions } from '@protobase/client'
import type { PageModel } from '@protobase/layout'
import type { ResourceModel, UserMenuModel, ViewModel } from '@protobase/schema'

export type MetaData = {
  etag: string
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Composed pages by name. */
  pages: Record<string, PageModel>
  permissions: Record<string, ResourcePermissions>
  userMenu?: UserMenuModel
  /** The assistant backend, when the app has one and the user has the admin or ai role. */
  assistant?: { url: string }
  /** The runtime updates endpoint, when the app has one and the user has the admin role. */
  runtime?: { url: string }
}

export const allowEverything: ResourcePermissions = { create: true, update: true, delete: true, conditional: [] }
