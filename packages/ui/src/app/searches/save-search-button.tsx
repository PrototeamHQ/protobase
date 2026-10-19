import { Bookmark, BookmarkCheck, BookmarkPlus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { ResourceModel, SaveSearchModel, ViewModel } from '@protobase/schema'
import { SignInPrompt } from '../../auth/sign-in-prompt'
import type { FilterChip } from '../../filter-panel'
import { Button } from '../../primitives/button'
import { SearchNameDialog } from './search-name-dialog'
import { UpdateSearchDialog } from './update-search-dialog'
import { useSaveSearch } from './use-save-search'
import { text } from './messages'

type SaveSearchButtonProps = {
  /** The list's resource and view. */
  model: ResourceModel
  view: ViewModel | undefined
  search: SaveSearchModel
  /** The list's filter, as its address has it. */
  filter: string
  /** What the filter filters on, as the list's chips name it. */
  chips: readonly FilterChip[]
  className?: string
}

/**
 * "Save search" on a filtered list: asks for an optional name and saves its filter as one of the signed-in user's
 * searches, pressed while it is saved, or, for a visitor, opens the sign-in prompt of the saved searches' resource. On a
 * list opened from a saved search whose filter it no longer has, "Update <search>" asks before giving the search the
 * list's filter, beside "Save as new search".
 */
export const SaveSearchButton = ({ model, view, search, filter, chips, className }: SaveSearchButtonProps) => {
  const state = useSaveSearch(search, filter)
  const [prompting, setPrompting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [naming, setNaming] = useState<string>()
  if (!state.mode) return null
  const label = search.label ?? text('saveSearch')
  if (state.mode === 'sign-in') {
    return (
      <>
        <Button className={className} aria-haspopup="dialog" onClick={() => setPrompting(true)}>
          <Bookmark className="size-3.5" aria-hidden />
          {label}
        </Button>
        <SignInPrompt as="dialog" prompt={state.prompt!} open={prompting} onClose={() => setPrompting(false)} />
      </>
    )
  }

  // A new search is named in a dialog titled `title`, or saved at once when searches have no name
  const saveNew = (title: string) => {
    setConfirming(false)
    if (state.naming) setNaming(title)
    else state.saveNew(null)
  }
  const nameDialog = naming !== undefined && state.naming && (
    <SearchNameDialog
      title={naming}
      chips={chips}
      label={state.naming.label}
      required={state.naming.required}
      busy={state.creating}
      onSave={(name) => state.saveNew(name, { onSuccess: () => setNaming(undefined) })}
      onClose={() => setNaming(undefined)}
    />
  )

  const opened = state.opened
  if (opened) {
    const saveNewLabel = text('saveAsNew', state.noun)
    return (
      <>
        <Button className={className} aria-haspopup="dialog" aria-disabled={!state.ready} onClick={() => state.ready && setConfirming(true)}>
          <RefreshCw className="size-3.5" aria-hidden />
          <span className="max-w-60 truncate">{text('updateName', opened.name ?? state.noun)}</span>
        </Button>
        <Button className={className} aria-haspopup={state.naming ? 'dialog' : undefined} aria-disabled={!state.ready} onClick={() => state.ready && saveNew(saveNewLabel)}>
          <BookmarkPlus className="size-3.5" aria-hidden />
          {saveNewLabel}
        </Button>
        {confirming && (
          <UpdateSearchDialog
            model={model}
            view={view}
            title={opened.name ? text('updateNameQuestion', opened.name) : text('updateNounQuestion', state.noun)}
            before={opened.filter}
            after={filter}
            saveNewLabel={saveNewLabel}
            updating={state.updating}
            creating={state.creating}
            onUpdate={() => state.update({ onSuccess: () => setConfirming(false) })}
            onSaveNew={() => saveNew(saveNewLabel)}
            onCancel={() => setConfirming(false)}
          />
        )}
        {nameDialog}
      </>
    )
  }

  const Icon = state.saved ? BookmarkCheck : Bookmark
  return (
    <>
      <Button
        className={className}
        aria-pressed={state.saved}
        aria-haspopup={!state.saved && state.naming ? 'dialog' : undefined}
        aria-disabled={!state.ready}
        onClick={() => state.ready && (state.saved ? state.remove() : saveNew(label))}
      >
        <Icon className={state.saved ? 'size-3.5 text-primary' : 'size-3.5'} aria-hidden />
        {label}
      </Button>
      {nameDialog}
    </>
  )
}
