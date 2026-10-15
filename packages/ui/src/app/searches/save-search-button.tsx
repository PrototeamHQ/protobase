import { Bookmark, BookmarkCheck, BookmarkPlus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { ResourceModel, SaveSearchModel, ViewModel } from '@protobase/schema'
import { SignInPrompt } from '../../auth/sign-in-prompt'
import { Button } from '../../primitives/button'
import { UpdateSearchDialog } from './update-search-dialog'
import { useSaveSearch } from './use-save-search'

type SaveSearchButtonProps = {
  /** The list's resource and view. */
  model: ResourceModel
  view: ViewModel | undefined
  search: SaveSearchModel
  /** The list's filter, as its address has it. */
  filter: string
  /** What a new search is called. */
  name: string
  className?: string
}

/**
 * "Save search" on a filtered list: saves its filter as one of the signed-in user's searches, pressed while it is saved,
 * or, for a visitor, opens the sign-in prompt of the saved searches' resource. On a list opened from a saved search whose
 * filter it no longer has, "Update <search>" asks before giving the search the list's filter, beside "Save as new search".
 */
export const SaveSearchButton = ({ model, view, search, filter, name, className }: SaveSearchButtonProps) => {
  const state = useSaveSearch(search, filter, name)
  const [prompting, setPrompting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  if (!state.mode) return null
  const label = search.label ?? 'Save search'
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
  const opened = state.opened
  if (opened) {
    const saveNewLabel = `Save as new ${state.noun}`
    const close = { onSuccess: () => setConfirming(false) }
    return (
      <>
        <Button className={className} aria-haspopup="dialog" aria-disabled={!state.ready} onClick={() => state.ready && setConfirming(true)}>
          <RefreshCw className="size-3.5" aria-hidden />
          <span className="max-w-60 truncate">{opened.name ? `Update ${opened.name}` : `Update ${state.noun}`}</span>
        </Button>
        <Button className={className} aria-disabled={!state.ready} onClick={() => state.ready && state.saveNew()}>
          <BookmarkPlus className="size-3.5" aria-hidden />
          {saveNewLabel}
        </Button>
        {confirming && (
          <UpdateSearchDialog
            model={model}
            view={view}
            title={opened.name ? `Update ${opened.name}?` : `Update this ${state.noun}?`}
            before={opened.filter}
            after={filter}
            saveNewLabel={saveNewLabel}
            updating={state.updating}
            creating={state.creating}
            onUpdate={() => state.update(close)}
            onSaveNew={() => state.saveNew(close)}
            onCancel={() => setConfirming(false)}
          />
        )}
      </>
    )
  }
  const Icon = state.saved ? BookmarkCheck : Bookmark
  return (
    <Button className={className} aria-pressed={state.saved} aria-disabled={!state.ready} onClick={() => state.ready && state.toggle()}>
      <Icon className={state.saved ? 'size-3.5 text-primary' : 'size-3.5'} aria-hidden />
      {label}
    </Button>
  )
}
