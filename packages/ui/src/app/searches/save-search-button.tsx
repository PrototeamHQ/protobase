import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useState } from 'react'
import type { SaveSearchModel } from '@protobase/schema'
import { SignInPrompt } from '../../auth/sign-in-prompt'
import { Button } from '../../primitives/button'
import { useSaveSearch } from './use-save-search'

type SaveSearchButtonProps = {
  search: SaveSearchModel
  /** The list's filter, as its address has it. */
  filter: string
  /** What a new search is called. */
  name: string
  className?: string
}

/**
 * "Save search" on a filtered list: saves its filter as one of the signed-in user's searches, pressed while it is saved,
 * or, for a visitor, opens the sign-in prompt of the saved searches' resource.
 */
export const SaveSearchButton = ({ search, filter, name, className }: SaveSearchButtonProps) => {
  const state = useSaveSearch(search, filter, name)
  const [prompting, setPrompting] = useState(false)
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
  const Icon = state.saved ? BookmarkCheck : Bookmark
  return (
    <Button className={className} aria-pressed={state.saved} aria-disabled={!state.ready} onClick={() => state.ready && state.toggle()}>
      <Icon className={state.saved ? 'size-3.5 text-primary' : 'size-3.5'} aria-hidden />
      {label}
    </Button>
  )
}
