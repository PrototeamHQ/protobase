import { useEffect, useRef, useState } from 'react'
import { useToast } from '../toasts'

export type SaveFeedback = 'toast' | 'button'
export type SavePhase = 'idle' | 'saving' | 'saved'

const roundTripMs = 1100

export const useSaveFeedback = (mode: SaveFeedback, subject: string) => {
  const toast = useToast()
  const [phase, setPhase] = useState<SavePhase>('idle')
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const save = () => {
    if (mode === 'toast') {
      const id = toast.show({ state: 'loading', title: `Saving ${subject}...` })
      timers.current.push(setTimeout(() => toast.update(id, { state: 'success', title: `${subject} saved` }), roundTripMs))
      return
    }
    setPhase('saving')
    timers.current.push(setTimeout(() => setPhase('saved'), roundTripMs))
    timers.current.push(setTimeout(() => setPhase('idle'), roundTripMs + 2000))
  }

  return { phase, save }
}
