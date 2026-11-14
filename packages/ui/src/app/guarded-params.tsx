import { createContext, useContext, useMemo, type ReactNode } from 'react'

const GuardedParamsContext = createContext<readonly string[]>([])

/**
 * Content a change of the page parameter `name` replaces, such as the row a `select` chose: a navigation guard inside
 * it asks before that parameter changes, as before leaving the page.
 */
export const GuardedParams = ({ name, children }: { name: string; children: ReactNode }) => {
  const outer = useContext(GuardedParamsContext)
  const names = useMemo(() => [...outer, name], [outer, name])
  return <GuardedParamsContext.Provider value={names}>{children}</GuardedParamsContext.Provider>
}

/** The page parameters whose change replaces the content around, from every `GuardedParams` it sits in. */
export const useGuardedParams = () => useContext(GuardedParamsContext)
