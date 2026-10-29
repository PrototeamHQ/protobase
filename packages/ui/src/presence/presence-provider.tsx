import { useEffect, useState, type ReactNode } from 'react'
import { useProjectUi } from '../app/pages/project-ui'
import { createPresenceStore, PresenceContext, type PresenceHook, type PresenceStore } from './presence'

// Calls the app's hook and hands what it gives to the store; it draws nothing, so the hook's updates render it alone.
const PresenceReader = ({ usePresence, store }: { usePresence: PresenceHook; store: PresenceStore }) => {
  const presence = usePresence()
  useEffect(() => store.set(presence), [store, presence])
  useEffect(() => () => store.set(undefined), [store])
  return null
}

/**
 * Calls the project UI's `presence` hook once, for every place that shows presence beneath it (see `usePresence`).
 * A hook a plugin brings late, after the app first drew, starts its own reader, so the hooks never mix.
 */
export const PresenceProvider = ({ children }: { children: ReactNode }) => {
  const { presence } = useProjectUi()
  const [store] = useState(createPresenceStore)
  const [reader, setReader] = useState({ hook: presence, key: 0 })
  if (reader.hook !== presence) setReader({ hook: presence, key: reader.key + 1 })
  return (
    <PresenceContext.Provider value={store}>
      {presence && <PresenceReader key={reader.key} usePresence={presence} store={store} />}
      {children}
    </PresenceContext.Provider>
  )
}
