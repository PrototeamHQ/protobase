import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { HoldStartForFirstLoads } from './hold-start-for-first-loads'
import { PagesFirst } from './lazy-routes'
import { createSplashHold, SplashHoldProvider } from './splash-hold'

/** A first page whose data comes after `ms`, under the start screen's hold, which tells when it lets go. */
const Start = ({ snapshot, ms, onGone, pagesFirst = false }: { snapshot: boolean; ms: number; onGone: (at: string) => void; pagesFirst?: boolean }) => {
  const [placed] = useState(() => {
    document.body.removeAttribute('data-start-gone')
    const placeholder = document.createElement('div')
    placeholder.id = 'pb-snapshot'
    if (snapshot) placeholder.innerHTML = '<p>The page shown last</p>'
    document.body.append(placeholder)
    return placeholder
  })
  useEffect(() => () => placed.remove(), [placed])
  const client = useMemo(() => new QueryClient(), [])
  const splash = useMemo(() => createSplashHold(() => onGone(document.querySelector('[data-loaded]') ? 'after the data' : 'before the data')), [])
  useEffect(() => splash.start(), [splash])
  return (
    <SplashHoldProvider value={splash}>
      <QueryClientProvider client={client}>
        {pagesFirst ? (
          <PagesFirst>
            <HoldStartForFirstLoads />
            <Page ms={ms} />
          </PagesFirst>
        ) : (
          <>
            <HoldStartForFirstLoads />
            <Page ms={ms} />
          </>
        )}
      </QueryClientProvider>
    </SplashHoldProvider>
  )
}

const Page = ({ ms }: { ms: number }) => {
  const result = useQuery({ queryKey: ['first', ms], queryFn: () => new Promise<string>((resolve) => setTimeout(() => resolve('Loaded'), ms)) })
  return result.data ? <p data-loaded>{result.data}</p> : <p>Loading</p>
}

const meta = { title: 'App/Start screen hold', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

/** With a host's snapshot, the start screen waits for the first page's first data. */
export const WithSnapshot: StoryObj = {
  tags: ['play'],
  render: () => <Start snapshot ms={400} onGone={(at) => document.body.setAttribute('data-start-gone', at)} />,
  play: async () => {
    await waitFor(() => expect(document.body.getAttribute('data-start-gone')).toBe('after the data'), { timeout: 3000 })
  },
}

/** Without one, the start is as before: it goes once the app has drawn, data or not. */
export const WithoutSnapshot: StoryObj = {
  tags: ['play'],
  render: () => <Start snapshot={false} ms={400} onGone={(at) => document.body.setAttribute('data-start-gone', at)} />,
  play: async () => {
    await waitFor(() => expect(document.body.getAttribute('data-start-gone')).toBe('before the data'), { timeout: 3000 })
  },
}

/** With a host's snapshot, the app draws its first page once the pages' code has loaded, and the start screen still waits for the page's data. */
export const WithSnapshotAndPagesCode: StoryObj = {
  tags: ['play'],
  render: () => <Start snapshot pagesFirst ms={400} onGone={(at) => document.body.setAttribute('data-start-gone', at)} />,
  play: async () => {
    await waitFor(() => expect(document.body.getAttribute('data-start-gone')).toBe('after the data'), { timeout: 5000 })
  },
}
