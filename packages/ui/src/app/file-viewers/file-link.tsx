import type { ResourceModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'
import { useProjectUi } from '../pages/project-ui'
import { AppLink } from '../use-app-address'
import { viewedField } from './file-viewer-page'

type FileLinkProps = {
  /** The file field's name and the record it is of, which its viewer opens on; without them the link downloads. */
  field?: string
  model?: ResourceModel
  record?: Record<string, unknown>
  /** The file's name and the link that downloads it. */
  name: string
  url: string
  className?: string
}

/**
 * A stored file's name as a link: to the record's address with `?file=<field>` when a viewer is registered for the file's
 * media type (`fileViewers`), otherwise to its download, in a new tab.
 */
export const FileLink = ({ field, model, record, name, url, className }: FileLinkProps) => {
  const ui = useProjectUi()
  const viewed = field && model && record && model.primaryKey.every((part) => record[part] != null) ? viewedField(ui, model, record, field) : undefined
  if (viewed && model && record) {
    return (
      <AppLink to={{ kind: 'record', resource: model.name, key: recordKey(model, record), file: viewed.field }} className={className}>
        {name}
      </AppLink>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {name}
    </a>
  )
}
