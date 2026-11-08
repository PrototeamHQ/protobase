import { useState } from 'react'
import { useClient } from '../../../data/api-provider'
import { useToast } from '../../../toasts'
import { usePermissions } from '../../meta-gate'
import { useRefreshResource } from '../../pages/use-layout-data'
import { can } from '../../permissions'
import { text } from './messages'

/** The resource whose records mark a workflow resolved: one per mark, copied onto the workflow by the database. */
export const resolutionsResource = 'workflow_resolutions'

/**
 * Marks the workflow resolved, clearing every failure so far, for a caller who may change it (`mayUpdate`, the record's
 * own permission) and so mark it; then reads the workflow again, which the sidebar follows.
 */
export const useResolve = (workflow: string, mayUpdate: boolean) => {
  const client = useClient()
  const refresh = useRefreshResource()
  const toast = useToast()
  const permitted = can(usePermissions(resolutionsResource), 'create') && mayUpdate
  const [busy, setBusy] = useState(false)
  const resolve = async () => {
    setBusy(true)
    await client.create(resolutionsResource, { workflow_id: workflow }).then(
      async () => {
        await Promise.all([refresh('workflows'), refresh(resolutionsResource)])
        toast.show({ state: 'success', title: text('resolveDone') })
      },
      () => toast.show({ state: 'error', title: text('resolveFailed') }),
    )
    setBusy(false)
  }
  return { permitted, busy, resolve }
}
