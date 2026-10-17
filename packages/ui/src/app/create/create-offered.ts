import type { ResourcePermissions } from '@protobase/client'
import type { ViewModel } from '@protobase/schema'
import { can } from '../permissions'

/**
 * Whether the list offers New: a view's create page to whoever `/meta` gives that page, whatever the resource's access
 * says; the create form to whoever may create records.
 */
export const createOffered = (view: ViewModel | undefined, pages: Readonly<Record<string, unknown>>, permissions: ResourcePermissions) =>
  view?.create ? Object.hasOwn(pages, view.create.page) : can(permissions, 'create')
