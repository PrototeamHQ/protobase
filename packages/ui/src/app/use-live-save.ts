import { useEffect, useRef, useState } from 'react'
import { isApiError } from '@protobase/client'
import { useToast } from '../toasts'
import { saveFailureDescription } from './field-errors'
import { text } from './record-messages'

export type SaveMode = 'toast' | 'button'
export type SavePhase = 'idle' | 'saving' | 'saved'

const savedForMs = 2000

/** What a save's action resolves to when it wrote nothing and needs no word, such as a create that opens the record it repeats. */
export const nothingSaved = Symbol('nothing saved')

/**
 * Shows the outcome of a save the way the view asks: a toast (spinner, then check) or the state of
 * the Save button. API errors are reported and not rethrown; anything else propagates. An action that resolves to
 * `nothingSaved` wrote nothing and says nothing: its toast goes away. `run` resolves to whether the save went through
 * or wrote nothing.
 */
export const useLiveSave = (mode: SaveMode, subject: string) => {
  const toast = useToast()
  const [phase, setPhase] = useState<SavePhase>('idle')
  const [message, setMessage] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const run = async (action: () => Promise<unknown>) => {
    const id = mode === 'toast' ? toast.show({ state: 'loading', title: text('savingSubject', { subject }) }) : undefined
    setMessage(undefined)
    if (mode === 'button') setPhase('saving')
    try {
      if ((await action()) === nothingSaved) {
        if (id !== undefined) toast.dismiss(id)
        if (mode === 'button') setPhase('idle')
        return true
      }
      if (id !== undefined) toast.update(id, { state: 'success', title: text('subjectSaved', { subject }) })
      if (mode === 'button') {
        setPhase('saved')
        timer.current = setTimeout(() => setPhase('idle'), savedForMs)
      }
      return true
    } catch (error) {
      if (!isApiError(error)) throw error
      const title = error.status === 412 ? text('changedBySomeoneElse') : text('couldNotSave')
      const description = saveFailureDescription(error)
      if (id !== undefined) toast.update(id, { state: 'error', title, description })
      if (mode === 'button') {
        setPhase('idle')
        setMessage(`${title}: ${description}`)
      }
      return false
    }
  }

  return { phase, message, run }
}
