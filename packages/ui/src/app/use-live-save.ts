import { useEffect, useRef, useState } from 'react'
import { isApiError } from '@protobase/client'
import { useToast } from '../toasts'

export type SaveMode = 'toast' | 'button'
export type SavePhase = 'idle' | 'saving' | 'saved'

const savedForMs = 2000

/**
 * Shows the outcome of a save the way the view asks: a toast (spinner, then check) or the state of
 * the Save button. API errors are reported and not rethrown; anything else propagates.
 */
export const useLiveSave = (mode: SaveMode, subject: string) => {
  const toast = useToast()
  const [phase, setPhase] = useState<SavePhase>('idle')
  const [message, setMessage] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const run = async (action: () => Promise<unknown>) => {
    const id = mode === 'toast' ? toast.show({ state: 'loading', title: `Saving ${subject}...` }) : undefined
    setMessage(undefined)
    if (mode === 'button') setPhase('saving')
    try {
      await action()
      if (id !== undefined) toast.update(id, { state: 'success', title: `${subject} saved` })
      if (mode === 'button') {
        setPhase('saved')
        timer.current = setTimeout(() => setPhase('idle'), savedForMs)
      }
    } catch (error) {
      if (!isApiError(error)) throw error
      const title = error.status === 412 ? 'Changed by someone else' : 'Could not save'
      if (id !== undefined) toast.update(id, { state: 'error', title, description: error.message })
      if (mode === 'button') {
        setPhase('idle')
        setMessage(`${title}: ${error.message}`)
      }
    }
  }

  return { phase, message, run }
}
