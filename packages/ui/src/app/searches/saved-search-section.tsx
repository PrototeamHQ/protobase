import { useMutation } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ResourceModel, SearchesOfModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { useToast } from '../../toasts'
import { useRefreshResource } from '../pages/use-layout-data'
import { RecordRowBody } from '../record-row/record-row-body'
import { AppLink } from '../use-app-address'
import { InlineFilterChips } from './filter-chip-list'
import { SearchControls } from './search-controls'
import { SearchNameDialog } from './search-name-dialog'
import { useSearchRow } from './use-search-row'
import type { SavedSearchRow } from './use-saved-searches'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

type SavedSearchSectionProps = {
  /** The saved searches' resource and its view, whose `searchesOf` is `of`. */
  model: ResourceModel
  view: ViewModel
  of: SearchesOfModel
  /** The resource searched and its view. */
  target: ResourceModel
  targetView: ViewModel | undefined
  row: SavedSearchRow
  /** The search's key, in the text form the record API takes. */
  recordKey: string
  /** Whether the user may rename the search. */
  canRename: boolean
  /** Deletes the search, named `title`, after asking; absent for a user who may not. */
  onDelete?: (title: string) => void
}

/**
 * One saved search on its list page: its name when it has one, and what it filters on as chips, which are its title
 * when it has none; its controls, rename and delete; and the records it finds in a row of their cards that scrolls
 * sideways (`useSearchRow`).
 */
export const SavedSearchSection = ({ model, view, of, target, targetView, row, recordKey, canRename, onDelete }: SavedSearchSectionProps) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const [renaming, setRenaming] = useState(false)
  const { name, chips, title, body } = useSearchRow({ model, of, target, targetView, row, recordKey })
  const rename = useMutation({
    mutationFn: (next: string | null) => client.update(model.name, recordKey, { [of.name!]: next }, row.etag ?? '*'),
    onSuccess: () => setRenaming(false),
    onError: (error) => toast.show({ state: 'error', title: 'Could not rename the search', description: message(error) }),
    onSettled: () => refresh(model.name),
  })
  const nameField = of.name === undefined ? undefined : model.fields[of.name]

  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[15px] font-semibold">
            <AppLink to={{ kind: 'record', resource: model.name, key: recordKey }} className="hover:underline">
              {name ?? <InlineFilterChips chips={chips} />}
            </AppLink>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {of.controls && <SearchControls model={model} view={view} recordKey={recordKey} row={row} fields={of.controls} />}
          {canRename && nameField && (
            <Button variant="ghost" aria-label={`Rename ${title}`} aria-haspopup="dialog" onClick={() => setRenaming(true)}>
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" aria-label={`Delete ${title}`} onClick={() => onDelete(title)}>
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {renaming && nameField && (
        <SearchNameDialog
          title={`Rename ${title}`}
          chips={chips}
          label={view.fields[nameField.name]?.label ?? humanize(nameField.name)}
          required={!nameField.nullable}
          initial={name}
          busy={rename.isPending}
          onSave={(next) => rename.mutate(next)}
          onClose={() => setRenaming(false)}
        />
      )}
      <RecordRowBody {...body} />
    </section>
  )
}
