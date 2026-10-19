import type { Organization } from '@protobase/client'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'

/** An organization with Open, or a Current badge when the person works in it. */
export const OrganizationRow = ({ organization, current, busy, onOpen }: { organization: Organization; current: boolean; busy: boolean; onOpen: () => void }) => (
  <li className="flex items-center gap-3 px-3 py-2.5">
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{organization.name}</span>
      <span className="block text-xs text-muted-foreground">{organization.slug}</span>
    </span>
    {current ? <Badge tone="green">Current</Badge> : <Button size="sm" loading={busy} onClick={onOpen}>Open</Button>}
  </li>
)
