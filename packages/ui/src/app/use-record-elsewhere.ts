import { useEffect, useMemo, useState } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { useAuth } from '../auth'
import { useClient } from '../data/api-provider'
import { elsewhereRequest, otherOrganization } from './record-elsewhere'

export type RecordElsewhere = { state: 'looking' } | { state: 'switching' } | { state: 'missing' } | { state: 'failed'; error: unknown }

/**
 * For a record not found in the session's organization: looks for it across the person's organizations, and when it is
 * in another one, switches the session there and opens the page again, so the record and everything on its page are
 * read in its own organization. `missing` when it is nowhere else, or the resource does not list across organizations.
 */
export const useRecordElsewhere = (model: ResourceModel, recordKey: string): RecordElsewhere => {
  const client = useClient()
  const { session, organizations } = useAuth()
  const request = useMemo(() => (organizations ? elsewhereRequest(model, recordKey) : undefined), [organizations, model, recordKey])
  const [found, setFound] = useState<RecordElsewhere>(request ? { state: 'looking' } : { state: 'missing' })
  useEffect(() => {
    if (!request) return
    const look = async () => {
      const [page, current] = await Promise.all([client.list(model.name, request), session.organizations.current()])
      const other = otherOrganization(model, page.items[0], current.organization?.id)
      if (other === undefined) return setFound({ state: 'missing' })
      setFound({ state: 'switching' })
      await session.organizations.switchTo(other)
      window.location.reload()
    }
    look().catch((error: unknown) => setFound({ state: 'failed', error }))
  }, [client, session, model, request])
  return found
}
