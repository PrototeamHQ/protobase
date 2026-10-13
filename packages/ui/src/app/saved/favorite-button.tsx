import { Heart } from 'lucide-react'
import { useState } from 'react'
import type { CardFavoriteModel, KeyValue } from '@protobase/schema'
import { SignInPrompt } from '../../auth/sign-in-prompt'
import { cn } from '../../lib/cn'
import { useFavorite } from './use-favorite'

type FavoriteButtonProps = {
  favorite: CardFavoriteModel
  /** The card's record key, in the text form the record API takes. */
  recordKey: string
  /** The card's record key as the saved record's relation holds it. */
  target: KeyValue
  className?: string
}

/**
 * A heart that saves the card's record for the signed-in user, pressed while it is saved, or, for a visitor, opens the
 * sign-in prompt of the saved records' resource. It sits over the card's link, beside it in the document, so pressing
 * it does not open the record; the card's list item must be `relative`.
 */
export const FavoriteButton = ({ favorite, recordKey, target, className }: FavoriteButtonProps) => {
  const state = useFavorite(favorite, recordKey, target)
  const [prompting, setPrompting] = useState(false)
  if (!state.mode) return null
  const label = favorite.label ?? 'Favorite'
  const base = cn(
    'absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
    className,
  )
  if (state.mode === 'sign-in') {
    return (
      <>
        <button type="button" aria-label={label} aria-haspopup="dialog" className={base} onClick={() => setPrompting(true)}>
          <Heart className="size-4" aria-hidden />
        </button>
        <SignInPrompt as="dialog" prompt={state.prompt!} open={prompting} onClose={() => setPrompting(false)} />
      </>
    )
  }
  return (
    <button type="button" aria-label={label} aria-pressed={state.saved} aria-disabled={!state.ready} className={base} onClick={() => state.ready && state.toggle()}>
      <Heart className={cn('size-4', state.saved && 'fill-current text-danger')} aria-hidden />
    </button>
  )
}
