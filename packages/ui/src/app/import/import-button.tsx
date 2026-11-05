import { Upload } from 'lucide-react'
import { useState } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { Button } from '../../primitives/button'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { ImportDialog } from './import-dialog'
import { fieldsResource } from './new-table/create-table-ops'
import { ImportTableDialog } from './new-table/import-table-dialog'
import { text } from './messages'

/**
 * The list page's Import button, for a user who may create records of a resource whose view does not turn it off
 * (`.import(false)`), and the import dialog it opens. The server checks every write as it would a single one. A view
 * with `.import('table')`, the tables users add, makes a new table from the file instead, for a user who may create
 * tables and their fields.
 */
export const ImportButton = ({ model }: { model: ResourceModel }) => {
  const { resources, views } = useAdminMeta()
  const permissions = usePermissions(model.name)
  const fieldPermissions = usePermissions(fieldsResource)
  const [open, setOpen] = useState(false)
  const mode = views[model.name]?.import
  if (mode === false || !can(permissions, 'create')) return null
  if (mode === 'table' && !can(fieldPermissions, 'create')) return null
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Upload className="size-3.5" />
        {mode === 'table' ? text('fromFile') : text('import')}
      </Button>
      {open && mode === 'table' && <ImportTableDialog tables={model} resources={resources} views={views} onClose={() => setOpen(false)} />}
      {open && mode !== 'table' && <ImportDialog model={model} resources={resources} views={views} canUpdate={can(permissions, 'update')} onClose={() => setOpen(false)} />}
    </>
  )
}
