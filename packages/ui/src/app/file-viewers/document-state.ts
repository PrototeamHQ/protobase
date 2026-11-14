import { useCallback, useState } from 'react'

/** A value of an `HtmlFrame` that belongs to the document it shows, by that document's `nonce`. */
export type DocumentState<T> = { nonce: string; value: T }

/** `state`'s value for the document `nonce`; `initial` for another document, which starts again. */
export const ofDocument = <T>(state: DocumentState<T> | undefined, nonce: string, initial: T) => (state?.nonce === nonce ? state.value : initial)

/** State that starts again at `initial` (a constant) each time the frame shows another document, `nonce`. */
export const useDocumentState = <T>(nonce: string, initial: T) => {
  const [state, setState] = useState<DocumentState<T>>()
  const update = useCallback((next: (value: T) => T) => setState((state) => ({ nonce, value: next(ofDocument(state, nonce, initial)) })), [nonce, initial])
  return [ofDocument(state, nonce, initial), update] as const
}
