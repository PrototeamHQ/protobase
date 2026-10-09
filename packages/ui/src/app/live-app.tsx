import { useEffect, useState } from 'react'
import { createAuthSession, createClient, createStaticSession } from '@protobase/client'
import type { SidebarMode } from '../app-shell'
import { App } from './app'

type Reach = { state: 'checking' } | { state: 'ready'; path: string } | { state: 'down'; reason: string }

/** Where the Live stories start: a fixed path, or the first record of a resource. */
export type LiveStart = { path: string } | { firstOf: string; suffix?: string }

/**
 * The real admin against a running server. When the server cannot be reached the story says so
 * and how to start it, instead of failing.
 */
/** `STORYBOOK_API_TOKEN=$(protobase token you@example.com)` when starting Storybook skips the sign-in page; never commit a token. */
const staticToken = import.meta.env.STORYBOOK_API_TOKEN as string | undefined

export const LiveApp = ({ baseUrl, start, sidebarMode }: { baseUrl: string; start: LiveStart; sidebarMode?: SidebarMode }) => {
  const [reach, setReach] = useState<Reach>({ state: 'checking' })

  useEffect(() => {
    let current = true
    const done = (next: Reach) => current && setReach(next)
    const down = (error: unknown) => done({ state: 'down', reason: error instanceof Error ? error.message : 'unreachable' })
    const session = staticToken ? createStaticSession(staticToken) : createAuthSession({ origin: new URL(baseUrl, window.location.origin).origin })
    void session.status().then(async () => {
      if ('path' in start) return done({ state: 'ready', path: start.path })
      // Without a session the sign-in page comes first, and there is no record to open yet.
      if (!(await session.session())) return done({ state: 'ready', path: '/' })
      const page = await createClient({ baseUrl, token: session.token }).list(start.firstOf, { pageSize: 1 })
      const first = page.items[0]
      if (!first) return done({ state: 'down', reason: `${start.firstOf} has no rows` })
      done({ state: 'ready', path: `/${start.firstOf}/${first.id as string}${start.suffix ?? ''}` })
    }, down)
    return () => {
      current = false
    }
  }, [baseUrl, start])

  if (reach.state === 'checking') return <div className="p-8 text-[13px] text-muted-foreground">Connecting to {baseUrl}...</div>
  if (reach.state === 'down') {
    return (
      <div className="mx-auto max-w-lg p-10 text-[13px]">
        <h1 className="text-[15px] font-semibold">Live story skipped: no API at {baseUrl}</h1>
        <p className="mt-2 text-muted-foreground">{reach.reason}</p>
        <p className="mt-2 text-muted-foreground">
          Start the ERP database and server with <code className="font-mono">pnpm --filter erp db:up</code> and <code className="font-mono">pnpm --filter erp serve</code>, then reload. To use another server, set <code className="font-mono">PROTOBASE_API</code> when starting Storybook or pick another API in the toolbar.
        </p>
      </div>
    )
  }
  return <App baseUrl={baseUrl} auth={staticToken ? createStaticSession(staticToken) : undefined} initialUrl={reach.path} workspace="Veldhuis Supply" sidebarMode={sidebarMode} />
}
