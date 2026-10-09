import { useEffect, useRef, useState } from 'react'

const savingMs = 700

export const useAutosave = (initialAgoSeconds: number, ticking: boolean) => {
  const [state, setState] = useState<'saving' | 'saved'>('saved')
  const [agoSeconds, setAgoSeconds] = useState(initialAgoSeconds)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!ticking || state !== 'saved') return
    const interval = setInterval(() => setAgoSeconds((seconds) => seconds + 1), 1000)
    return () => clearInterval(interval)
  }, [ticking, state])

  useEffect(() => () => clearTimeout(timer.current), [])

  const touch = () => {
    setState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setAgoSeconds(0)
      setState('saved')
    }, savingMs)
  }

  return { state, agoSeconds, touch }
}
