import { useCallback, useMemo, type ReactNode } from 'react'
import { CustomBoundary } from '../app/pages/custom-boundary'
import { useRouter } from '../app/router'
import { useAuth } from '../auth/auth-provider'
import { Spinner } from '../primitives/spinner'
import { mergePlugins } from './merge-plugins'
import { usePluginSource } from './plugin-source'
import { usePluginLoads } from './use-plugin-loads'

/**
 * Loads the plugins the setup status names to everyone, from the app's plugin source, and draws their `beforeSignIn`
 * components around `children` for someone signed out or a visitor, once they have loaded, or failed, or after a wait
 * (see `usePluginLoads`). Signed in, it draws `children` alone, and the plugins stay loaded for the app to merge with
 * the others `/meta` names. A `beforeSignIn` that throws leaves `children` as they are without it.
 */
export const BeforeSignIn = ({ children }: { children: ReactNode }) => {
  const { state, beforeSignIn, adoptSession } = useAuth()
  const { path, params, navigate } = useRouter()
  const { loads, settled } = usePluginLoads(beforeSignIn, usePluginSource())
  const Around = useMemo(() => mergePlugins(undefined, loads).ui.beforeSignIn, [loads])
  const removeParams = useCallback(
    (names: string[]) => {
      const kept = new URLSearchParams(params)
      for (const name of names) kept.delete(name)
      navigate(kept.size > 0 ? `${path}?${kept}` : path, { replace: true })
    },
    [path, params, navigate],
  )

  if (state.kind !== 'signed-out' && state.kind !== 'visitor') return children
  if (!settled) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 text-muted-foreground">
        <Spinner /> Loading
      </div>
    )
  }
  if (!Around) return children
  return (
    <CustomBoundary name="beforeSignIn" fallback={children}>
      <Around signedIn={adoptSession} params={params} removeParams={removeParams}>
        {children}
      </Around>
    </CustomBoundary>
  )
}
