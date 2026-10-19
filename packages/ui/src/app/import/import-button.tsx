import { Upload } from 'lucide-react'
import { useState } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { Button } from '../../primitives/button'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { ImportDialog } from './import-dialog'
import { text } from './messages'

/**
 * The list page's Import button, for a user who may create records of a resource whose view does not turn it off
 * (`.import(false)`), and the import dialog it opens. The server checks every write as it would a single one.
 */
export const ImportButton = ({ model }: { model: ResourceModel }) => {
  const { resources, views } = useAdminMeta()
  const permissions = usePermissions(model.name)
  const [open, setOpen] = useState(false)
  if (views[model.name]?.import === false || !can(permissions, 'create')) return null
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Upload className="size-3.5" />
        {text('import')}
      </Button>
      {open && <ImportDialog model={model} resources={resources} views={views} canUpdate={can(permissions, 'update')} onClose={() => setOpen(false)} />}
    </>
  )
}
