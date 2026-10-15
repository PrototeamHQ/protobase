import { useMutation, useQuery } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ResourceModel, SearchesOfModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { useToast } from '../../toasts'
import { countQuery, useRefreshResource } from '../pages/use-layout-data'
import { RecordRowBody } from '../record-row/record-row-body'
import { AppLink } from '../use-app-address'
import { chipsText, InlineFilterChips } from './filter-chip-list'
import { isUnseen, unseenFilter } from './saved-search'
import { SearchControls } from './search-controls'
import { SearchNameDialog } from './search-name-dialog'
import { useFilterChips } from './use-filter-chips'
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
 * One saved search: its name when it has one, and what it filters on as chips, which are its title when it has none;
 * its controls, rename and delete; and the records it finds in a row of their cards that scrolls sideways
 * (`RecordRowBody`), with `unseen` newest first, those new to the user marked "New", and "View all results", which opens
 * the list with its filter and counts as having seen them.
 */
export const SavedSearchSection = ({ model, view, of, target, targetView, row, recordKey, canRename, onDelete }: SavedSearchSectionProps) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const [renaming, setRenaming] = useState(false)
  const filter = String(row[of.filter] ?? '')
  const chips = useFilterChips(target, filter)
  const stored = of.name === undefined ? undefined : row[of.name]
  const name = typeof stored === 'string' && stored !== '' ? stored : undefined
  const title = name ?? chipsText(chips)
  const unseen = of.unseen
  const markSeen = useMutation({
    mutationFn: (seenAt: string) => client.update(model.name, recordKey, { [unseen!.seenAt]: seenAt }, row.etag ?? '*'),
    onSettled: () => refresh(model.name),
  })
  const rename = useMutation({
    mutationFn: (next: string | null) => client.update(model.name, recordKey, { [of.name!]: next }, row.etag ?? '*'),
    onSuccess: () => setRenaming(false),
    onError: (error) => toast.show({ state: 'error', title: 'Could not rename the search', description: message(error) }),
    onSettled: () => refresh(model.name),
  })
  const nameField = of.name === undefined ? undefined : model.fields[of.name]
  const plural = (targetView?.names?.plural ?? humanize(target.name)).toLowerCase()
  // How many of its records are new, to say when none are; every record is new to a search never seen
  const newCount = useQuery({ ...countQuery(client, target, unseen ? unseenFilter(filter, unseen.field, row[unseen.seenAt]) : ''), enabled: unseen !== undefined })

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
      <RecordRowBody
        model={target}
        view={targetView}
        filter={filter}
        sort={unseen ? `${unseen.field} desc` : undefined}
        limit={of.limit}
        chips={name !== undefined}
        empty={`No ${plural} match.`}
        note={unseen && newCount.data === 0 && `No new ${plural} since you last looked.`}
        isNew={unseen && ((record) => isUnseen(record.record[unseen.field], row[unseen.seenAt]))}
        viewAll={{ label: 'View all results', savedSearch: recordKey, ...(unseen && { onOpen: () => markSeen.mutate(new Date().toISOString()) }) }}
      />
    </section>
  )
}
